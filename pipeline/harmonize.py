"""Step 3: sensor groups, harmonization and its checks (Whitepaper section 3; MVP plan 4 and 13).

Reads   processed/atoms/product=*/*.parquet, processed/atoms/coverage.parquet
Writes  processed/harmonized/cells.parquet   one row per res 6 cell and month with any activity:
            cell6, mi (month index from the record start), h10, lo10, hi10 (harmonized value and band,
            in tenths of active cell-days), modis, viirs10, terra, aqua, snpp, noaa20, noaa21,
            dm_modis, dm_snpp, dm_noaa20 (day masks, bit d-1 set for UTC day d; MODIS is Terra or Aqua)
        processed/harmonized/noaa20_scale.parquet  NOAA-20 scale per region and season, when applied
        processed/harmonized/meta.json       record, satellite dates, nominal months, ratio table,
                                             leave-one-year-out table, diagnostics

Values are active cell-days: (res 6 cell, UTC day) pairs with at least one qualifying detection.
  modis   days seen by Terra or Aqua (union of the two day masks)
  viirs   mean of the group satellites (config viirs_group) that are nominal in the month,
          the ones with any data otherwise (decision D2)
  h       from first_reference_month on: viirs. Before: ratio x modis (ratio x terra before Aqua's
          first nominal month, decision D5), with lo and hi from the bootstrap band.
Ratio: sum of reference days / sum of MODIS days per H3 res 1 region and season over the fit
period, falling back to the res 0 parent, then the globe (decisions D1, D3, D6 defaults).
Values are stored in tenths as integers so that every sum of cells is exact.

Usage: python pipeline/harmonize.py [--data-root DIR]
"""

from __future__ import annotations

import calendar
import json

import numpy as np

from common import (
    SATELLITES,
    BuildError,
    base_parser,
    connect,
    int_month,
    load_config,
    log,
    main_guard,
    month_add,
    month_index,
    month_int,
    resolve_paths,
    step,
)

SEASONS = ("DJF", "MAM", "JJA", "SON")
SEASON_SQL = "CAST(((month % 100) % 12) // 3 AS TINYINT)"  # month as yyyymm; Dec, Jan, Feb -> 0


def hexid(x: int) -> str:
    return f"{int(x):015x}"


def days_in(month: str) -> int:
    return calendar.monthrange(int(month[:4]), int(month[5:7]))[1]


def fit_table(V: np.ndarray, M: np.ndarray, region_ids: np.ndarray, parent0: np.ndarray, years: np.ndarray,
              use_years: np.ndarray, min_sum: float, boot_idx: np.ndarray | None, lo_pct: float, hi_pct: float):
    """Ratio per (res 1 region, season) with fallbacks.

    V, M: arrays [n_regions, 4 seasons, n_years] of reference and MODIS-side day sums.
    Returns arrays ratio, lo, hi [n_regions, 4] and level [n_regions, 4] (0 res1, 1 res0, 2 global).
    """
    sel = np.isin(years, use_years)
    Vy, My = V[:, :, sel], M[:, :, sel]
    n_r = V.shape[0]
    ratio = np.ones((n_r, 4))
    lo = np.ones((n_r, 4))
    hi = np.ones((n_r, 4))
    level = np.zeros((n_r, 4), dtype=np.int8)

    def point_and_band(v: np.ndarray, m: np.ndarray):
        """v, m: [k, 4, n_years] summed over k units -> per season ratio and band."""
        vs, ms = v.sum(axis=(0, 2)), m.sum(axis=(0, 2))
        r = np.where(ms > 0, vs / np.maximum(ms, 1e-12), 1.0)
        if boot_idx is None:
            return r, r.copy(), r.copy(), ms
        vy, my = v.sum(axis=0), m.sum(axis=0)  # [4, n_years]
        vb = vy[:, boot_idx].sum(axis=2)  # [4, B]
        mb = my[:, boot_idx].sum(axis=2)
        b_lo, b_hi = r.copy(), r.copy()
        for s in range(4):
            ok = mb[s] > 0
            if ok.any():
                draws = vb[s, ok] / mb[s, ok]
                b_lo[s] = min(r[s], np.percentile(draws, lo_pct))
                b_hi[s] = max(r[s], np.percentile(draws, hi_pct))
        return r, b_lo, b_hi, ms

    g_r, g_lo, g_hi, _ = point_and_band(Vy, My)
    p0_cache: dict[int, tuple] = {}
    for i in range(n_r):
        r1, l1, h1, m1 = point_and_band(Vy[i : i + 1], My[i : i + 1])
        p = int(parent0[i])
        if p not in p0_cache:
            members = parent0 == p
            p0_cache[p] = point_and_band(Vy[members], My[members])
        r0, l0, h0, m0 = p0_cache[p]
        for s in range(4):
            if m1[s] >= min_sum:
                ratio[i, s], lo[i, s], hi[i, s], level[i, s] = r1[s], l1[s], h1[s], 0
            elif m0[s] >= min_sum:
                ratio[i, s], lo[i, s], hi[i, s], level[i, s] = r0[s], l0[s], h0[s], 1
            else:
                ratio[i, s], lo[i, s], hi[i, s], level[i, s] = g_r[s], g_lo[s], g_hi[s], 2
    return ratio, lo, hi, level, (g_r, g_lo, g_hi), p0_cache


def main() -> None:
    p = base_parser(__doc__.splitlines()[0])
    args = p.parse_args()
    cfg = load_config(args.config)
    hc = cfg["harmonize"]
    if hc.get("transfer", "ratio") != "ratio":
        raise BuildError("harmonize.transfer: only 'ratio' is implemented (decision D1)")
    paths = resolve_paths(cfg, args.data_root)
    atoms_glob = f"{paths.atoms.as_posix()}/product=*/[0-9]*.parquet"
    cov_path = paths.atoms / "coverage.parquet"
    if not cov_path.exists():
        raise BuildError(f"{cov_path} not found. Run pipeline/grid.py first.")
    out = paths.harmonized
    out.mkdir(parents=True, exist_ok=True)
    con = connect(args.threads, args.memory, paths.processed / "tmp", h3=True)
    region_res = int(hc["region_res"])
    if region_res < 1 or int(hc["fallback_res"]) != 0:
        raise BuildError("harmonize: region_res must be 1 or more and fallback_res 0 (decision D6)")

    with step(paths, "harmonize", out) as info:
        # ------------------------------------------------------------ record and satellite months
        cov = con.execute(
            f"SELECT satellite, month, days_covered, last_day, processing FROM read_parquet('{cov_path.as_posix()}')"
        ).fetchall()
        months_int = sorted({r[1] for r in cov})
        start, end = int_month(months_int[0]), int_month(months_int[-1])
        data_through = max(r[3] for r in cov)
        n_months = month_index(start, end) + 1
        record = [month_add(start, i) for i in range(n_months)]
        record_days = {m: days_in(m) for m in record}
        if data_through.strftime("%Y-%m") == end:
            record_days[end] = data_through.day
        covd = {(r[0], int_month(r[1])): r[2] for r in cov}
        share = float(hc["nominal_day_share"])
        nominal = {(s, m): covd.get((s, m), 0) >= share * record_days[m] for s in SATELLITES for m in record}
        group = list(hc["viirs_group"])
        weights = []  # (month int, satellite, weight)
        group_used = {}
        for m in record:
            used = [s for s in group if nominal[(s, m)]] or [s for s in group if covd.get((s, m), 0) > 0]
            group_used[m] = used
            for s in used:
                weights.append((month_int(m), s, 1.0 / len(used)))
        if any(len(u) > 2 for u in group_used.values()):
            raise BuildError("viirs_group with more than 2 satellites gives values that are not exact tenths")

        def first_month(sat: str, need_nominal: bool) -> str | None:
            for m in record:
                if (nominal[(sat, m)] if need_nominal else covd.get((sat, m), 0) > 0):
                    return m
            return None

        def last_month(sat: str) -> str | None:
            ms = [m for m in record if covd.get((sat, m), 0) > 0]
            return ms[-1] if ms else None

        aqua_seam = first_month("aqua", True)
        first_ref = hc["first_reference_month"]
        ref_sat = hc["fit_reference"]
        if not nominal[(ref_sat, first_ref)]:
            raise BuildError(f"{ref_sat} is not nominal in first_reference_month {first_ref}")
        log(f"record {start} to {end} ({n_months} months), data through {data_through}, Aqua nominal from {aqua_seam}")

        con.execute("CREATE TEMP TABLE w (month INTEGER, satellite VARCHAR, weight DOUBLE)")
        con.executemany("INSERT INTO w VALUES (?, ?, ?)", weights)

        # ------------------------------------------------------------ cell x month table
        log("building the cell x month table")
        # A (cell, month, satellite) can sit in more than one atom file when a product switches from
        # SP to NRT inside a month. Collapse first with bit_or of the day masks, so every column
        # below counts each day once.
        con.execute(
            f"""CREATE TEMP TABLE sm AS
                SELECT cell6, month, satellite, bit_or(day_mask) AS mask,
                       bit_count(bit_or(day_mask))::UTINYINT AS days
                FROM read_parquet('{atoms_glob}') GROUP BY cell6, month, satellite"""
        )
        # Regions (res 1 parents) and their res 0 parents.
        region_ids = np.asarray(
            [r[0] for r in con.execute(f"SELECT DISTINCT h3_cell_to_parent(cell6, {region_res}) FROM sm ORDER BY 1").fetchall()],
            dtype=np.uint64,
        )
        parent0 = np.asarray(
            [r[0] for r in con.execute(
                "SELECT h3_cell_to_parent(r, 0) FROM (SELECT unnest(?::UBIGINT[]) AS r)", [region_ids.tolist()]
            ).fetchall()],
            dtype=np.uint64,
        )
        years = np.arange(int(start[:4]), int(end[:4]) + 1)
        min_sum = float(hc["min_fit_cell_days"])
        lo_pct, hi_pct = float(hc["band_low_pct"]), float(hc["band_high_pct"])
        B = int(hc["bootstraps"])

        def year_cube(rows: dict, cols: list[str]) -> list[np.ndarray]:
            ri = np.searchsorted(region_ids, np.asarray(rows["region"], dtype=np.uint64))
            yi = np.asarray(rows["year"]) - years[0]
            si = np.asarray(rows["season"], dtype=int)
            out = []
            for c in cols:
                a = np.zeros((len(region_ids), 4, len(years)))
                np.add.at(a, (ri, si, yi), np.nan_to_num(np.asarray(rows[c], dtype=float)))
                out.append(a)
            return out

        # NOAA-20 to S-NPP calibration (decision D2 data): S-NPP cell-days / NOAA-20 cell-days per
        # res 1 region and season over the months where both are nominal, with the same fallbacks
        # and band as the MODIS ratio. Applied only when harmonize.scale_noaa20_to_snpp is true.
        both = [month_int(m) for m in record if nominal[("snpp", m)] and nominal[("noaa20", m)]]
        con.execute("CREATE TEMP TABLE bm (month INTEGER)")
        con.executemany("INSERT INTO bm VALUES (?)", [(m,) for m in both])
        t2 = con.execute(
            f"""SELECT h3_cell_to_parent(cell6, {region_res}) AS region, {SEASON_SQL} AS season, month // 100 AS year,
                       COALESCE(sum(days) FILTER (WHERE satellite = 'snpp'), 0)::DOUBLE AS s,
                       COALESCE(sum(days) FILTER (WHERE satellite = 'noaa20'), 0)::DOUBLE AS n
                FROM sm WHERE month IN (SELECT month FROM bm) AND satellite IN ('snpp', 'noaa20') GROUP BY ALL"""
        ).fetchnumpy()
        S2, N2 = year_cube(t2, ["s", "n"])
        n20_years = np.array(sorted({m // 100 for m in both}))
        boot2 = np.random.default_rng(int(hc["seed"]) + 1).integers(0, len(n20_years), size=(B, len(n20_years)))
        n20_fit = fit_table(S2, N2, region_ids, parent0, years, n20_years, min_sum, boot2, lo_pct, hi_pct)
        log("NOAA-20 to S-NPP scale (S-NPP / NOAA-20 cell-days), global per season: "
            + ", ".join(f"{SEASONS[s]} {n20_fit[4][0][s]:.3f} [{n20_fit[4][1][s]:.3f}, {n20_fit[4][2][s]:.3f}]" for s in range(4)))
        scale_on = bool(hc.get("scale_noaa20_to_snpp", False))
        con.execute("CREATE TEMP TABLE sc (region UBIGINT, season TINYINT, f DOUBLE)")
        if scale_on:
            con.executemany(
                "INSERT INTO sc VALUES (?, ?, ?)",
                [(int(reg), s, float(n20_fit[0][i, s])) for i, reg in enumerate(region_ids) for s in range(4)],
            )
        log(f"NOAA-20 scaling applied to the VIIRS series: {scale_on}")
        # The applied scale per region and season (empty when off), for the daily values in publish.
        con.execute(f"COPY sc TO '{(out / 'noaa20_scale.parquet').as_posix()}' (FORMAT parquet)")

        sat_cols = ",\n".join(
            f"COALESCE(max(sm.days) FILTER (WHERE sm.satellite = '{s}'), 0)::UTINYINT AS {s}" for s in SATELLITES
        )
        con.execute(
            f"""CREATE TEMP TABLE cm AS
                SELECT sm.cell6, sm.month,
                       bit_count(COALESCE(bit_or(sm.mask) FILTER (WHERE sm.satellite IN ('terra', 'aqua')), 0::UINTEGER))::UTINYINT AS modis,
                       {sat_cols},
                       COALESCE(bit_or(sm.mask) FILTER (WHERE sm.satellite IN ('terra', 'aqua')), 0::UINTEGER) AS dm_modis,
                       {', '.join(f"COALESCE(max(sm.mask) FILTER (WHERE sm.satellite = '{s}'), 0::UINTEGER) AS dm_{s}" for s in group)},
                       CAST(round(10 * COALESCE(sum(sm.days * w.weight
                            * CASE WHEN sm.satellite = 'noaa20' THEN COALESCE(sc.f, 1) ELSE 1 END), 0)) AS INTEGER) AS viirs10
                FROM sm LEFT JOIN w ON w.month = sm.month AND w.satellite = sm.satellite
                LEFT JOIN sc ON sc.region = h3_cell_to_parent(sm.cell6, {region_res})
                     AND sc.season = {SEASON_SQL.replace('month', 'sm.month')}
                GROUP BY sm.cell6, sm.month"""
        )
        n_cm = con.execute("SELECT count(*) FROM cm").fetchone()[0]
        n_split = con.execute(
            f"""SELECT count(*) FROM (SELECT cell6, month, satellite FROM read_parquet('{atoms_glob}')
                GROUP BY ALL HAVING count(*) > 1)"""
        ).fetchone()[0]
        log(f"  {n_cm:,} cell-months; {n_split:,} (cell, month, satellite) keys were split over two atom files")
        # Check: per month, viirs equals the weighted sum of the collapsed per-satellite columns.
        # Rounding to tenths per cell allows 0.05 per row.
        terms = " + ".join(
            f"t.{s} * {'COALESCE(sc.f, 1)' if s == 'noaa20' else '1'} * COALESCE(w_{s}.weight, 0)" for s in group
        )
        joins = " ".join(f"LEFT JOIN w w_{s} ON w_{s}.month = t.month AND w_{s}.satellite = '{s}'" for s in group)
        bad = con.execute(
            f"""SELECT t.month, sum(t.viirs10), 10 * sum({terms})
                FROM cm t {joins}
                LEFT JOIN sc ON sc.region = h3_cell_to_parent(t.cell6, {region_res})
                     AND sc.season = {SEASON_SQL.replace('month', 't.month')}
                GROUP BY t.month HAVING abs(sum(t.viirs10) - 10 * sum({terms})) > 0.5 * count(*) + 1e-6 LIMIT 5"""
        ).fetchall()
        if bad:
            raise BuildError(f"viirs does not match the per-satellite columns in months {bad}")
        con.execute("DROP TABLE sm")

        # ------------------------------------------------------------ fit totals
        fit_from, fit_to = hc["fit_from"], hc["fit_to"]
        cmp_from, cmp_to = hc["compare_from"], hc["compare_to"]

        def valid_fit_months(a: str, b: str) -> list[int]:
            ms = [m for m in record if a <= m <= b]
            ok = [m for m in ms if nominal[(ref_sat, m)] and nominal[("terra", m)] and nominal[("aqua", m)]]
            return [month_int(m) for m in ok]

        fit_months = valid_fit_months(fit_from, fit_to)
        cmp_months = valid_fit_months(cmp_from, cmp_to)
        dropped = sorted(set(month_int(m) for m in record if fit_from <= m <= fit_to) - set(fit_months))
        log(f"fit months: {len(fit_months)} ({len(dropped)} dropped where a satellite is not nominal: {[int_month(d) for d in dropped]})")
        con.execute("CREATE TEMP TABLE fm (month INTEGER)")
        con.executemany("INSERT INTO fm VALUES (?)", [(m,) for m in sorted(set(fit_months) | set(cmp_months))])

        totals = con.execute(
            f"""SELECT h3_cell_to_parent(cell6, {region_res}) AS region, {SEASON_SQL} AS season, month // 100 AS year,
                       sum({ref_sat})::DOUBLE AS v, sum(modis)::DOUBLE AS m, sum(terra)::DOUBLE AS mt
                FROM cm WHERE month IN (SELECT month FROM fm) GROUP BY ALL"""
        ).fetchnumpy()
        V, M, MT = year_cube(totals, ["v", "m", "mt"])

        fit_years = np.array(sorted({m // 100 for m in fit_months}))
        cmp_years = np.array(sorted({m // 100 for m in cmp_months}))
        rng = np.random.default_rng(int(hc["seed"]))
        boot = rng.integers(0, len(fit_years), size=(B, len(fit_years)))

        def fit(Mside: np.ndarray, use_years: np.ndarray, bootstrap: bool):
            # Bootstrap draws resample the fit years; indexes refer to the selected year axis.
            idx = boot if bootstrap else None
            return fit_table(V, Mside, region_ids, parent0, years, use_years, min_sum, idx, lo_pct, hi_pct)

        modis_fit = fit(M, fit_years, True)
        terra_fit = fit(MT, fit_years, True) if hc.get("terra_only_ratio", True) else modis_fit
        cmp_fit = fit(M, cmp_years, False) if len(cmp_years) else None
        log(f"global ratio per season (fit {fit_from} to {fit_to}): "
            + ", ".join(f"{SEASONS[s]} {modis_fit[4][0][s]:.3f} [{modis_fit[4][1][s]:.3f}, {modis_fit[4][2][s]:.3f}]" for s in range(4)))
        if cmp_fit is not None:
            log("global ratio per season (compare fit " + f"{cmp_from} to {cmp_to}): "
                + ", ".join(f"{SEASONS[s]} {cmp_fit[4][0][s]:.3f}" for s in range(4)))

        # ------------------------------------------------------------ apply
        rows = []
        for i, reg in enumerate(region_ids):
            for s in range(4):
                rows.append((int(reg), s, "modis", *(float(modis_fit[k][i, s]) for k in range(3))))
                rows.append((int(reg), s, "terra", *(float(terra_fit[k][i, s]) for k in range(3))))
        con.execute("CREATE TEMP TABLE ratio (region UBIGINT, season TINYINT, kind VARCHAR, r DOUBLE, lo DOUBLE, hi DOUBLE)")
        con.executemany("INSERT INTO ratio VALUES (?, ?, ?, ?, ?, ?)", rows)
        ref_int = month_int(first_ref)
        aqua_int = month_int(aqua_seam) if aqua_seam else 0
        start_y, start_m = int(start[:4]), int(start[5:7])
        cells_path = out / "cells.parquet"
        log("applying ratios and writing cells.parquet")
        con.execute(
            f"""COPY (
                  SELECT cm.cell6,
                         CAST((cm.month // 100 - {start_y}) * 12 + (cm.month % 100 - {start_m}) AS SMALLINT) AS mi,
                         CASE WHEN cm.month >= {ref_int} THEN cm.viirs10
                              ELSE CAST(round(10 * r.r * (CASE WHEN cm.month < {aqua_int} THEN cm.terra ELSE cm.modis END)) AS INTEGER) END AS h10,
                         CASE WHEN cm.month >= {ref_int} THEN cm.viirs10
                              ELSE CAST(round(10 * r.lo * (CASE WHEN cm.month < {aqua_int} THEN cm.terra ELSE cm.modis END)) AS INTEGER) END AS lo10,
                         CASE WHEN cm.month >= {ref_int} THEN cm.viirs10
                              ELSE CAST(round(10 * r.hi * (CASE WHEN cm.month < {aqua_int} THEN cm.terra ELSE cm.modis END)) AS INTEGER) END AS hi10,
                         cm.modis, cm.viirs10, cm.terra, cm.aqua, cm.snpp, cm.noaa20, cm.noaa21,
                         cm.dm_modis, {', '.join(f'cm.dm_{s}' for s in group)}
                  FROM cm
                  LEFT JOIN ratio r ON r.region = h3_cell_to_parent(cm.cell6, {region_res})
                       AND r.season = {SEASON_SQL.replace('month', 'cm.month')}
                       AND r.kind = CASE WHEN cm.month < {aqua_int} THEN 'terra' ELSE 'modis' END
                  ORDER BY cm.cell6, mi
                ) TO '{cells_path.as_posix()}' (FORMAT parquet, COMPRESSION zstd)"""
        )
        chk = con.execute(
            f"""SELECT count(*), count(*) FILTER (WHERE h10 IS NULL OR lo10 IS NULL OR hi10 IS NULL),
                       count(*) FILTER (WHERE lo10 > h10 OR hi10 < h10)
                FROM read_parquet('{cells_path.as_posix()}')"""
        ).fetchone()
        if chk[1] or chk[2]:
            raise BuildError(f"cells.parquet: {chk[1]} rows without a ratio, {chk[2]} rows with lo > h or hi < h")
        log(f"  {chk[0]:,} rows")

        # ------------------------------------------------------------ leave one year out (D9)
        log("leave-one-year-out")
        loyo_rows = []
        for held in fit_years:
            others = fit_years[fit_years != held]
            r_held = fit_table(V, M, region_ids, parent0, years, others, min_sum, None, lo_pct, hi_pct)[0]
            for i, reg in enumerate(region_ids):
                for s in range(4):
                    loyo_rows.append((int(held), int(reg), s, float(r_held[i, s])))
        con.execute("CREATE TEMP TABLE lr (year INTEGER, region UBIGINT, season TINYINT, r DOUBLE)")
        con.executemany("INSERT INTO lr VALUES (?, ?, ?, ?)", loyo_rows)
        fit_list = ", ".join(str(m) for m in fit_months)
        con.execute(
            f"""CREATE TEMP TABLE lp AS
                SELECT cm.cell6, cm.month, lr.r * cm.modis AS pred, cm.{ref_sat}::DOUBLE AS obs
                FROM cm JOIN lr ON lr.year = cm.month // 100
                     AND lr.region = h3_cell_to_parent(cm.cell6, {region_res})
                     AND lr.season = {SEASON_SQL.replace('month', 'cm.month')}
                WHERE cm.month IN ({fit_list}) AND (cm.modis > 0 OR cm.{ref_sat} > 0)"""
        )
        con.execute(
            """CREATE TEMP TABLE ring AS
               WITH p5 AS (SELECT DISTINCT h3_cell_to_parent(cell6, 5) AS unit FROM lp)
               SELECT unit, unnest(h3_grid_disk(h3_cell_to_center_child(unit, 6), 1)) AS cell6 FROM p5"""
        )
        unit_sql = {
            "res6": "SELECT cell6 AS unit, month, pred, obs FROM lp",
            "ring7": "SELECT ring.unit, lp.month, lp.pred, lp.obs FROM lp JOIN ring USING (cell6)",
            "res5": "SELECT h3_cell_to_parent(cell6, 5) AS unit, month, pred, obs FROM lp",
            "res4": "SELECT h3_cell_to_parent(cell6, 4) AS unit, month, pred, obs FROM lp",
            "region": f"SELECT h3_cell_to_parent(cell6, {region_res}) AS unit, month, pred, obs FROM lp",
        }
        # bias (sum predicted / sum observed) is the same at every scale because values add up. The
        # extra columns tell scales apart: the share of unit-months predicted 0 but observed above 0,
        # and the 75th percentile of predicted and of observed over the non-zero unit-months.
        loyo = []
        for scale, q in unit_sql.items():
            bias, mae, n, zp, p75p, p75o = con.execute(
                f"""WITH u AS (SELECT unit, month, sum(pred) AS pred, sum(obs) AS obs FROM ({q}) GROUP BY unit, month)
                    SELECT sum(pred) / NULLIF(sum(obs), 0), avg(abs(pred - obs)), count(*),
                           avg(CASE WHEN pred = 0 AND obs > 0 THEN 1.0 ELSE 0.0 END),
                           quantile_cont(pred, 0.75) FILTER (WHERE pred > 0),
                           quantile_cont(obs, 0.75) FILTER (WHERE obs > 0)
                    FROM u WHERE pred > 0 OR obs > 0"""
            ).fetchone()
            loyo.append({"scale": scale, "bias": round(float(bias or 0), 3), "mae": round(float(mae or 0), 2), "n": int(n),
                         "zero_pred_share": round(float(zp or 0), 3),
                         "p75_pred": round(float(p75p or 0), 2), "p75_obs": round(float(p75o or 0), 2)})
            log(f"  {scale}: bias {bias:.3f}, mae {mae:.2f}, n {n:,}, predicted 0 and observed > 0 {zp:.1%}, "
                f"p75 predicted {p75p:.1f} / observed {p75o:.1f}")

        # D9 breakdown: the pooled bias above is close to 1 by construction, so also report it per
        # held-out year, per season, and its spread over res 1 regions (regions with at least
        # loyo_region_min_obs observed cell-days over the fit months), plus the res 4 error per year.
        by_year = [
            {"year": int(y), "bias": round(float(b or 0), 3), "pred": round(float(p), 1), "obs": int(o),
             "mae_res4": round(float(e or 0), 2)}
            for y, b, p, o, e in con.execute(
                """WITH u AS (SELECT month // 100 AS year, h3_cell_to_parent(cell6, 4) AS unit, month,
                                     sum(pred) AS pred, sum(obs) AS obs FROM lp GROUP BY ALL)
                   SELECT year, sum(pred) / NULLIF(sum(obs), 0), sum(pred), sum(obs),
                          avg(abs(pred - obs)) FILTER (WHERE pred > 0 OR obs > 0)
                   FROM u GROUP BY year ORDER BY year"""
            ).fetchall()
        ]
        by_season = [
            {"season": SEASONS[int(s)], "bias": round(float(b or 0), 3)}
            for s, b in con.execute(
                f"""SELECT {SEASON_SQL}, sum(pred) / NULLIF(sum(obs), 0) FROM lp GROUP BY 1 ORDER BY 1"""
            ).fetchall()
        ]
        min_obs = float(hc.get("loyo_region_min_obs", 100))
        rb = np.array([r[0] for r in con.execute(
            f"""SELECT sum(pred) / sum(obs) FROM lp GROUP BY h3_cell_to_parent(cell6, {region_res})
                HAVING sum(obs) >= {min_obs}"""
        ).fetchall()], dtype=float)
        by_region = {
            "min_obs_cell_days": min_obs, "regions": int(len(rb)),
            "p10": round(float(np.percentile(rb, 10)), 3) if len(rb) else None,
            "median": round(float(np.median(rb)), 3) if len(rb) else None,
            "p90": round(float(np.percentile(rb, 90)), 3) if len(rb) else None,
            "share_within_10pct": round(float(np.mean(np.abs(rb - 1) <= 0.1)), 3) if len(rb) else None,
        }
        loyo_breakdown = {"by_year": by_year, "by_season": by_season, "by_region": by_region}
        log("  bias by held-out year: " + ", ".join(f"{r['year']} {r['bias']:.3f}" for r in by_year))
        log("  bias by season: " + ", ".join(f"{r['season']} {r['bias']:.3f}" for r in by_season))
        log(f"  bias over {by_region['regions']} res 1 regions: p10 {by_region['p10']}, median {by_region['median']}, "
            f"p90 {by_region['p90']}, within 10% {by_region['share_within_10pct']}")

        # Decision D4 measurement (a): per res 1 region, within the fit months, the zero share of
        # 7-cell place-months on MODIS against S-NPP. A 7-cell place is the 7 res 6 children of a
        # res 5 cell (its centre child plus ring 1). Places: those with any activity in the fit months.
        n_fit = len(fit_months)
        zr = con.execute(
            f"""WITH u AS (
                  SELECT h3_cell_to_parent(cell6, 5) AS unit, month, sum(modis) AS m, sum({ref_sat}) AS v
                  FROM cm WHERE month IN ({fit_list}) GROUP BY ALL)
                SELECT h3_cell_to_parent(unit, {region_res}) AS region, count(DISTINCT unit) AS places,
                       count(*) FILTER (WHERE m > 0) AS m_active, count(*) FILTER (WHERE v > 0) AS v_active,
                       count(*) FILTER (WHERE m = 0 AND v > 0) AS m0_v1
                FROM u GROUP BY 1 ORDER BY 1"""
        ).fetchall()
        zero_rows = []
        tot = [0, 0, 0, 0]
        for reg, places, ma, va, m0v1 in zr:
            pm = places * n_fit
            zm, zv = 1 - ma / pm, 1 - va / pm
            zero_rows.append({"region": hexid(reg), "places": int(places), "zero_modis": round(zm, 4), "zero_viirs": round(zv, 4),
                              "gap_points": round(100 * (zm - zv), 2), "modis0_viirs_active": round(m0v1 / pm, 4)})
            tot = [tot[0] + pm, tot[1] + ma, tot[2] + va, tot[3] + m0v1]
        gaps = np.array([r["gap_points"] for r in zero_rows])
        wts = np.array([r["places"] for r in zero_rows], dtype=float)
        zero_summary = {
            "place_months": int(tot[0]),
            "zero_modis": round(1 - tot[1] / tot[0], 4), "zero_viirs": round(1 - tot[2] / tot[0], 4),
            "gap_points": round(100 * ((1 - tot[1] / tot[0]) - (1 - tot[2] / tot[0])), 2),
            "modis0_viirs_active": round(tot[3] / tot[0], 4),
            "regions": len(zero_rows),
            "regions_gap_above_10": int((gaps > 10).sum()), "regions_gap_5_to_10": int(((gaps >= 5) & (gaps <= 10)).sum()),
            "regions_gap_below_5": int((gaps < 5).sum()),
            "places_in_regions_gap_above_10": round(float(wts[gaps > 10].sum() / wts.sum()), 3),
            "median_gap_points": round(float(np.median(gaps)), 2),
        }
        log(f"7-cell place-months, fit period: zero share MODIS {zero_summary['zero_modis']:.1%}, S-NPP {zero_summary['zero_viirs']:.1%}, "
            f"gap {zero_summary['gap_points']:.1f} points; regions with gap > 10: {zero_summary['regions_gap_above_10']}, "
            f"5 to 10: {zero_summary['regions_gap_5_to_10']}, < 5: {zero_summary['regions_gap_below_5']}")

        # Decision D4 measurement (b): relative band half-width (hi - lo) / (2 h) = (r_hi - r_lo) / (2 r)
        # per region and season, for the MODIS ratio actually applied (res 1, res 0 or global).
        band_rows = []
        for i, reg in enumerate(region_ids):
            for s in range(4):
                r, l_, h_ = modis_fit[0][i, s], modis_fit[1][i, s], modis_fit[2][i, s]
                band_rows.append({"region": hexid(reg), "season": SEASONS[s], "level": int(modis_fit[3][i, s]),
                                  "half_width": round(float((h_ - l_) / (2 * r)) if r > 0 else 0.0, 4)})
        hw = np.array([b["half_width"] for b in band_rows if b["level"] == 0])
        band_summary = {
            "strata_res1": int(len(hw)),
            "median": round(float(np.median(hw)), 4) if len(hw) else None,
            "p90": round(float(np.percentile(hw, 90)), 4) if len(hw) else None,
            "max": round(float(hw.max()), 4) if len(hw) else None,
            "global_by_season": {SEASONS[s]: round(float((modis_fit[4][2][s] - modis_fit[4][1][s]) / (2 * modis_fit[4][0][s])), 4)
                                 for s in range(4)},
        }
        log(f"band half-width, res 1 strata: median {band_summary['median']}, p90 {band_summary['p90']}, max {band_summary['max']}")

        # Outages for known_issues: months with a missing day or a low day (rows below
        # outage_low_day_share of the satellite's median daily rows over a centred window of
        # outage_window_days). A window wider than a month keeps a long outage from pulling down its
        # own reference: the Aqua outage of 16 August to 2 September 2020 fills half of August.
        daily = paths.atoms / "coverage_daily.parquet"
        low_share = float(hc.get("outage_low_day_share", 0.4))
        half_win = int(hc.get("outage_window_days", 91)) // 2
        low = {}
        if daily.exists():
            for sat, m, n_low in con.execute(
                f"""WITH d AS (SELECT satellite, strftime(acq_date, '%Y-%m') AS m, n_rows,
                                      median(n_rows) OVER (PARTITION BY satellite ORDER BY acq_date
                                          RANGE BETWEEN INTERVAL {half_win} DAYS PRECEDING
                                                    AND INTERVAL {half_win} DAYS FOLLOWING) AS md
                               FROM read_parquet('{daily.as_posix()}'))
                    SELECT satellite, m, count(*) FROM d WHERE n_rows < {low_share} * md GROUP BY ALL"""
            ).fetchall():
                low[(sat, m)] = int(n_low)
        outages = []
        for s in SATELLITES:
            ms = [m for m in record if covd.get((s, m), 0) > 0]
            if not ms:
                continue
            for m in ms:
                if m in (ms[0], ms[-1]):
                    continue  # a satellite's first and last months are partial by nature
                missing = record_days[m] - covd.get((s, m), 0)
                if missing > 0 or low.get((s, m), 0) > 0:
                    outages.append({"satellite": s, "month": m, "days_missing": int(missing),
                                    "low_days": low.get((s, m), 0), "record_days": record_days[m]})
        log(f"outage months (missing or low days): {len(outages)}")
        zero_modis = con.execute(
            f"SELECT avg(CASE WHEN modis = 0 AND {ref_sat} > 0 THEN 1 ELSE 0 END) FROM cm WHERE month IN ({fit_list}) AND (modis > 0 OR {ref_sat} > 0)"
        ).fetchone()[0]

        # ------------------------------------------------------------ diagnostics
        n20_vs_snpp = con.execute(
            f"""SELECT sum(noaa20)::DOUBLE / NULLIF(sum(snpp), 0) FROM cm
                WHERE month IN ({', '.join(str(month_int(m)) for m in record if nominal[('snpp', m)] and nominal[('noaa20', m)]) or '0'})"""
        ).fetchone()[0]
        n21_vs_n20 = con.execute(
            f"""SELECT sum(noaa21)::DOUBLE / NULLIF(sum(noaa20), 0) FROM cm
                WHERE month IN ({', '.join(str(month_int(m)) for m in record if nominal[('noaa21', m)] and nominal[('noaa20', m)]) or '0'})"""
        ).fetchone()[0]
        # Zero share of res 6 cell-months before and after the seam (input for decision D4).
        # Over res 6 cells that VIIRS sees at least once: share of cell-months with a zero harmonized
        # value, 2003-01 to 2011-12 against 2012-02 to 2025-12.
        n_before = month_index("2003-01", "2011-12") + 1
        n_after = month_index(first_ref, "2025-12") + 1
        zero_share = con.execute(
            f"""WITH c AS (SELECT DISTINCT cell6 FROM cm WHERE viirs10 > 0 AND month >= {ref_int}),
                     a AS (SELECT cm.cell6, cm.month FROM cm JOIN c USING (cell6)
                           WHERE (cm.month < {ref_int} AND cm.month >= 200301 AND (cm.modis > 0 OR cm.terra > 0))
                              OR (cm.month >= {ref_int} AND cm.month <= 202512 AND cm.viirs10 > 0))
                SELECT 1 - (SELECT count(*) FILTER (WHERE month < {ref_int}) FROM a)::DOUBLE / ((SELECT count(*) FROM c) * {n_before}),
                       1 - (SELECT count(*) FILTER (WHERE month >= {ref_int}) FROM a)::DOUBLE / ((SELECT count(*) FROM c) * {n_after})"""
        ).fetchone()
        log(f"NOAA-20 / S-NPP cell-days {n20_vs_snpp:.3f}, NOAA-21 / NOAA-20 {n21_vs_n20:.3f}, "
            f"zero-MODIS share {zero_modis:.3f}, zero share before / after seam {zero_share[0]:.3f} / {zero_share[1]:.3f}")

        # ------------------------------------------------------------ meta.json
        level_name = {0: None, 1: "res 0 fallback", 2: "global fallback"}
        ratio_rows = []
        for fit_obj, suffix in ((modis_fit, ""), (terra_fit, " (Terra only)")):
            ratio, lo, hi, level, g, p0 = fit_obj
            for s in range(4):
                ratio_rows.append({"region": "global", "season": SEASONS[s] + suffix, "ratio": round(float(g[0][s]), 3),
                                   "lo": round(float(g[1][s]), 3), "hi": round(float(g[2][s]), 3), "n_years": int(len(fit_years))})
            for p, (r0, l0, h0, m0) in sorted(p0.items()):
                for s in range(4):
                    if m0[s] >= min_sum:
                        ratio_rows.append({"region": hexid(p), "season": SEASONS[s] + suffix, "ratio": round(float(r0[s]), 3),
                                           "lo": round(float(l0[s]), 3), "hi": round(float(h0[s]), 3), "n_years": int(len(fit_years))})
            for i, reg in enumerate(region_ids):
                for s in range(4):
                    lab = SEASONS[s] + suffix + (f", {level_name[int(level[i, s])]}" if level[i, s] else "")
                    ratio_rows.append({"region": hexid(reg), "season": lab, "ratio": round(float(ratio[i, s]), 3),
                                       "lo": round(float(lo[i, s]), 3), "hi": round(float(hi[i, s]), 3), "n_years": int(len(fit_years))})
        if cmp_fit is not None:
            for s in range(4):
                ratio_rows.append({"region": "global", "season": f"{SEASONS[s]} (fit {cmp_from} to {cmp_to}, not applied)",
                                   "ratio": round(float(cmp_fit[4][0][s]), 3), "lo": round(float(cmp_fit[4][0][s]), 3),
                                   "hi": round(float(cmp_fit[4][0][s]), 3), "n_years": int(len(cmp_years))})
        n20_label = "NOAA-20 to S-NPP" + (" (applied)" if scale_on else " (not applied)")
        ratio, lo, hi, level, g, p0 = n20_fit
        for s in range(4):
            ratio_rows.append({"region": "global", "season": f"{SEASONS[s]} {n20_label}", "ratio": round(float(g[0][s]), 3),
                               "lo": round(float(g[1][s]), 3), "hi": round(float(g[2][s]), 3), "n_years": int(len(n20_years))})
        for i, reg in enumerate(region_ids):
            for s in range(4):
                lab = f"{SEASONS[s]} {n20_label}" + (f", {level_name[int(level[i, s])]}" if level[i, s] else "")
                ratio_rows.append({"region": hexid(reg), "season": lab, "ratio": round(float(ratio[i, s]), 3),
                                   "lo": round(float(lo[i, s]), 3), "hi": round(float(hi[i, s]), 3), "n_years": int(len(n20_years))})
        # Steps in h with the switch off, in S-NPP units: at NOAA-20's start h moves from S-NPP to
        # the mean of both; after S-NPP ends it is NOAA-20 alone.
        r_ns = float(n20_vs_snpp or 1)
        noaa20_to_snpp = {
            "applied": scale_on,
            "label": n20_label,
            "fit_months": [int_month(m) for m in both],
            "n_years": int(len(n20_years)),
            "global_scale_by_season": {SEASONS[s]: {"scale": round(float(g[0][s]), 3), "lo": round(float(g[1][s]), 3),
                                                     "hi": round(float(g[2][s]), 3)} for s in range(4)},
            "noaa20_over_snpp_all_seasons": round(r_ns, 3),
            "step_at_noaa20_start_switch_off": round((1 + r_ns) / 2, 3),
            "step_at_snpp_end_vs_previous_month_switch_off": round(2 * r_ns / (1 + r_ns), 3),
            "level_at_snpp_end_vs_snpp_units_switch_off": round(r_ns, 3),
            "strata": {"res1": int((level == 0).sum()), "res0_fallback": int((level == 1).sum()),
                       "global_fallback": int((level == 2).sum())},
        }
        log(f"switch off: step x{(1 + r_ns) / 2:.3f} at NOAA-20 start, x{2 * r_ns / (1 + r_ns):.3f} when S-NPP ends")
        levels = modis_fit[3]
        # Months from NOAA-20's first nominal month on where the VIIRS series uses one satellite
        # (nominal_day_share: one missing day drops a satellite from the mean).
        n20_first = first_month("noaa20", True) or end
        single_sat = [{"month": m, "used": group_used[m]} for m in record if m >= n20_first and len(group_used[m]) < len(group)]
        log(f"months from {n20_first} using fewer than {len(group)} VIIRS satellites: {len(single_sat)}"
            + (f" ({', '.join(x['month'] + ':' + '+'.join(x['used']) for x in single_sat)})" if single_sat else ""))
        meta = {
            "record": {"start": start, "end": end},
            "data_through": str(data_through),
            "record_days": record_days,
            "first_reference_month": first_ref,
            "fit_reference": ref_sat,
            "fit_months": [int_month(m) for m in fit_months],
            "fit_dropped_months": [int_month(m) for m in dropped],
            "satellites": {
                s: {"first": first_month(s, False), "first_nominal": first_month(s, True), "last": last_month(s)}
                for s in SATELLITES
            },
            "aqua_seam": aqua_seam,
            "viirs_group_used": group_used,
            "viirs_reduced_months": single_sat,
            "noaa20_to_snpp": noaa20_to_snpp,
            "outages": outages,
            "d4_zero_share": {"summary": zero_summary, "by_region": zero_rows},
            "d4_band_half_width": {"summary": band_summary, "by_region_season": band_rows},
            "coverage": [
                {"satellite": s, "month": m, "days_covered": covd.get((s, m), 0), "record_days": record_days[m],
                 "nominal": nominal[(s, m)]}
                for s in SATELLITES for m in record if covd.get((s, m), 0) > 0
            ],
            "nrt_months": sorted({int_month(r[1]) for r in cov if r[4] == "NRT"}),
            "ratios": ratio_rows,
            "loyo": loyo,
            "loyo_breakdown": loyo_breakdown,
            "strata": {
                "res1": int((levels == 0).sum()), "res0_fallback": int((levels == 1).sum()),
                "global_fallback": int((levels == 2).sum()),
            },
            "diagnostics": {
                "noaa20_over_snpp_cell_days": round(float(n20_vs_snpp or 0), 3),
                # The fit target is S-NPP alone; from NOAA-20's start h is the mean of the two, so h
                # steps by about (1 + ratio) / 2 there (decision D2).
                "implied_step_at_noaa20_start": round((1 + float(n20_vs_snpp or 1)) / 2, 3),
                "viirs_reduced_months_from_noaa20_start": len(single_sat),
                "noaa21_over_noaa20_cell_days": round(float(n21_vs_n20 or 0), 3),
                "zero_modis_share_fit_period": round(float(zero_modis or 0), 3),
                "zero_share_before_seam_2003_on": round(float(zero_share[0] or 0), 3),
                "zero_share_after_seam_to_2025": round(float(zero_share[1] or 0), 3),
                "cell_months": int(n_cm),
            },
            "settings": {k: hc[k] for k in hc},
        }
        (out / "meta.json").write_text(json.dumps(meta, indent=1, default=str), encoding="utf-8")
        info["cell_months"] = int(n_cm)
        info["strata"] = meta["strata"]
        info["loyo"] = loyo
        info["diagnostics"] = meta["diagnostics"]


if __name__ == "__main__":
    main_guard(main)
