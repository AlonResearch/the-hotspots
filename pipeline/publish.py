"""Step 4: publish the static JSON folder in data contract v1 (MVP plan section 4).

Reads   processed/harmonized/cells.parquet and meta.json, config.toml
Writes  <publish folder> (default web/public/firms):
          manifest.json, overview/r3/{month}.json, overview/r4/{month}.json,
          overview/r5/{res0 id}/{month}.json, detail/index.json, detail/{res3 id}.json,
          summary/global.json, places.json, method.json
The folder is built next to the target and swapped in when complete. An existing target is only
replaced when its manifest says "source": "firms" (so the fixtures are never overwritten by accident),
unless --force is given.

Overview, detail and summary values are sums of the same res 6 integers (tenths of active
cell-days), so contract rules 1 to 3 hold exactly. Check with:
  cd web && npm run validate-data -- public/firms

Usage: python pipeline/publish.py [--data-root DIR] [--out DIR] [--force]
"""

from __future__ import annotations

import calendar
import datetime as dt
import json
import shutil
from pathlib import Path

import numpy as np

from common import (
    SATELLITES,
    BuildError,
    base_parser,
    connect,
    human,
    load_config,
    log,
    main_guard,
    month_add,
    month_index,
    resolve_paths,
    step,
)

SAT_LABEL = {"terra": "Terra", "aqua": "Aqua", "snpp": "S-NPP", "noaa20": "NOAA-20", "noaa21": "NOAA-21"}


def hexid(x) -> str:
    return f"{int(x):015x}"


def tenths(a: np.ndarray) -> list:
    """Integer tenths to 1-decimal numbers (ints stay ints in JSON when whole)."""
    out = []
    for v in a.tolist():
        out.append(v // 10 if v % 10 == 0 else v / 10)
    return out


def write_json(root: Path, rel: str, value) -> int:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(value, separators=(",", ":"))
    path.write_text(text, encoding="utf-8")
    return len(text)


def ranges(months: list[str]) -> list[tuple[str, str]]:
    """Consecutive months grouped into (from, to) ranges."""
    out: list[tuple[str, str]] = []
    for m in months:
        if out and month_add(out[-1][1], 1) == m:
            out[-1] = (out[-1][0], m)
        else:
            out.append((m, m))
    return out


def bit(mask: str, day: str = "day") -> str:
    return f"(({mask} >> ({day} - 1)) & 1)"


def select_daily_cells(con, areas: list[dict]) -> int:
    """Temp table sel(cell6, area_0, area_1, ...): every active res 6 cell whose centre is in a daily area."""
    flags = ", ".join(
        f"(lng BETWEEN {a['bbox'][0]} AND {a['bbox'][2]} AND lat BETWEEN {a['bbox'][1]} AND {a['bbox'][3]}) AS area_{i}"
        for i, a in enumerate(areas)
    )
    con.execute(
        f"""CREATE OR REPLACE TEMP TABLE sel AS
            SELECT * FROM (
              SELECT cell6, {flags}
              FROM (SELECT DISTINCT cell6, h3_cell_to_lat(cell6) AS lat, h3_cell_to_lng(cell6) AS lng FROM c))
            WHERE {" OR ".join(f"area_{i}" for i in range(len(areas)))}"""
    )
    n = con.execute("SELECT count(*) FROM sel").fetchone()[0]
    for i, a in enumerate(areas):
        k = con.execute(f"SELECT count(*) FROM sel WHERE area_{i}").fetchone()[0]
        log(f"  daily area {a['name']}: {k:,} active res 6 cells")
    return int(n)


def make_daily(con, meta: dict, record: list[str], first_ref_mi: int, paths, region_res: int) -> None:
    """Temp table dd(cell6, mi, day, v10): each res 6 row's monthly h10 split over its UTC days.

    Day weights: before the first reference month, 1 on each day in the MODIS mask (Terra or Aqua);
    from it on, the VIIRS group weight of the month (mean of the satellites used) on each day in a
    satellite's mask, times the NOAA-20 scale when it is applied. h10 is split over the days in
    proportion to the weights and rounded with the largest-remainder rule, so the days of every
    row sum exactly to h10, and every sum of rows (overview cells, the world) is exact too.
    """
    rows = []
    for t, m in enumerate(record):
        if t < first_ref_mi:
            continue
        used = meta["viirs_group_used"][m]
        w = 1.0 / len(used) if used else 0.0
        rows.append((t, w if "snpp" in used else 0.0, w if "noaa20" in used else 0.0))
    con.execute("CREATE OR REPLACE TEMP TABLE dwp (mi SMALLINT, w_snpp DOUBLE, w_noaa20 DOUBLE)")
    con.executemany("INSERT INTO dwp VALUES (?, ?, ?)", rows)
    scale_path = paths.harmonized / "noaa20_scale.parquet"
    if scale_path.exists():
        con.execute(f"CREATE OR REPLACE TEMP TABLE sc AS SELECT * FROM read_parquet('{scale_path.as_posix()}')")
    else:
        con.execute("CREATE OR REPLACE TEMP TABLE sc (region UBIGINT, season TINYINT, f DOUBLE)")
    start = record[0]
    m0 = int(start[5:7]) - 1
    log("  daily: splitting monthly values over UTC days")
    con.execute(
        f"""CREATE OR REPLACE TEMP TABLE dd AS
            WITH r AS (
              SELECT c.cell6, c.mi, c.h10, c.dm_modis, c.dm_snpp, c.dm_noaa20,
                     COALESCE(dwp.w_snpp, 0) AS ws, COALESCE(dwp.w_noaa20, 0) * COALESCE(sc.f, 1) AS wn
              FROM c LEFT JOIN dwp USING (mi)
              LEFT JOIN sc ON sc.region = h3_cell_to_parent(c.cell6, {region_res})
                   AND sc.season = CAST((((c.mi + {m0}) % 12 + 1) % 12) // 3 AS TINYINT)
              WHERE c.h10 > 0 AND c.p3 IN (SELECT DISTINCT h3_cell_to_parent(cell6, 3) FROM sel)),
            u AS (
              SELECT *, CASE WHEN mi < {first_ref_mi} THEN dm_modis
                             ELSE (CASE WHEN ws > 0 THEN dm_snpp ELSE 0 END) | (CASE WHEN wn > 0 THEN dm_noaa20 ELSE 0 END) END AS um
              FROM r),
            e AS (
              SELECT cell6, mi, h10, unnest(list_filter(range(1, 32), lambda x: ((um >> (x - 1)) & 1) = 1)) AS day,
                     dm_modis, dm_snpp, dm_noaa20, ws, wn
              FROM u),
            x AS (
              SELECT cell6, mi, h10, day,
                     CASE WHEN mi < {first_ref_mi} THEN 1.0 ELSE ws * {bit('dm_snpp')} + wn * {bit('dm_noaa20')} END AS wt
              FROM e),
            y AS (
              SELECT *, h10 * wt / sum(wt) OVER (PARTITION BY cell6, mi) AS ex FROM x),
            z AS (
              SELECT *, floor(ex) AS fl FROM y),
            k AS (
              SELECT *, h10 - sum(fl) OVER (PARTITION BY cell6, mi) AS deficit,
                     row_number() OVER (PARTITION BY cell6, mi ORDER BY ex - fl DESC, day) AS rk
              FROM z)
            SELECT cell6, mi, CAST(day AS TINYINT) AS day,
                   CAST(fl + CASE WHEN rk <= deficit THEN 1 ELSE 0 END AS INTEGER) AS v10
            FROM k"""
    )
    con.execute("DELETE FROM dd WHERE v10 = 0")
    # Checks: every row with h10 > 0 has days, and its days sum exactly to h10.
    bad = con.execute(
        """SELECT count(*) FROM c LEFT JOIN (SELECT cell6, mi, sum(v10) s FROM dd GROUP BY ALL) d USING (cell6, mi)
           WHERE c.h10 > 0 AND COALESCE(d.s, -1) <> c.h10
             AND c.p3 IN (SELECT DISTINCT h3_cell_to_parent(cell6, 3) FROM sel)"""
    ).fetchone()[0]
    if bad:
        raise BuildError(f"daily: {bad} res 6 cell-months whose days do not sum to h")
    # Checks for the detail masks: they reproduce the monthly values.
    bad_m = con.execute(f"SELECT count(*) FROM c WHERE bit_count(dm_modis) <> modis").fetchone()[0]
    bad_s = con.execute("SELECT count(*) FROM c WHERE bit_count(dm_snpp) <> snpp OR bit_count(dm_noaa20) <> noaa20").fetchone()[0]
    bad_v = con.execute(
        f"""SELECT count(*) FROM c LEFT JOIN dwp USING (mi)
            LEFT JOIN sc ON sc.region = h3_cell_to_parent(c.cell6, {region_res})
                 AND sc.season = CAST((((c.mi + {m0}) % 12 + 1) % 12) // 3 AS TINYINT)
            WHERE c.mi >= {first_ref_mi}
              AND abs(10 * (COALESCE(dwp.w_snpp, 0) * bit_count(c.dm_snpp)
                            + COALESCE(dwp.w_noaa20, 0) * COALESCE(sc.f, 1) * bit_count(c.dm_noaa20)) - c.viirs10) > 0.5"""
    ).fetchone()[0]
    if bad_m or bad_s or bad_v:
        raise BuildError(f"daily masks: {bad_m} rows with bit_count(dm_modis) != modis, {bad_s} with S-NPP or NOAA-20 "
                         f"masks off their day counts, {bad_v} where the weights do not give viirs")
    n = con.execute("SELECT count(*) FROM dd").fetchone()[0]
    log(f"  daily: {n:,} (res 6 cell, UTC day) values; days sum to the month in every cell-month")


def daily_doc(meta: dict, record: list[str], first_ref_mi: int) -> dict:
    weights = {}
    for t, m in enumerate(record):
        if t >= first_ref_mi:
            used = meta["viirs_group_used"][m]
            weights[m] = {s: round(1.0 / len(used), 6) for s in used}
    return {
        "status": "v1 optional daily fields (proposed)",
        "days": "UTC acquisition dates (acq_date, decision D10). Day d of a month is bit d-1 of a mask",
        "where": "Only in the areas of manifest.daily: res 6 cells whose centre is in an area, and the res 3, 4 "
                 "and 5 cells that contain at least one of them",
        "fields": {
            "detail": "daily = {rows, dm_modis, dm_snpp, dm_noaa20}: rows lists the row positions (aligned with mi) of "
                      "the selected res 6 cells; each mask array is aligned with rows. MODIS is Terra or Aqua",
            "overview": "daily = {idx, d}: idx lists the positions in cell that have daily values; d[k] is the list of "
                        "[day, value] pairs of cell idx[k] for the whole cell (all its res 6 children); missing days are 0",
            "summary": "daily_areas = [{name, bbox, res6_cells, daily_start, daily_h}]: per area, the value of its "
                       "selected res 6 cells per UTC day to data_through",
        },
        "rule": (
            "Before first_reference_month a cell's monthly h is spread evenly over the days set in dm_modis "
            "(h x bit / modis). From it on, each day weighs the sum over the VIIRS group of weight x bit "
            "(weights below; NOAA-20 times its scale when the scale is applied), and h is spread in "
            "proportion. The overview and summary values are the largest-remainder rounding of that split "
            "in tenths, so a cell's days sum exactly to its monthly h. Values derived from the detail masks "
            "sum to h within 0.05 per cell."
        ),
        "noaa20_scale_applied": bool(meta["noaa20_to_snpp"]["applied"]),
        "viirs_weights": weights,
    }


def build_manifest(cfg: dict, meta: dict, r5_parts: list[str], detail_names: list[str]) -> dict:
    pc = cfg["publish"]
    hc = cfg["harmonize"]
    fc = cfg["filters"]
    start, end = meta["record"]["start"], meta["record"]["end"]
    first_ref = meta["first_reference_month"]
    record = [month_add(start, i) for i in range(month_index(start, end) + 1)]

    status_ranges = []
    if start < first_ref:
        status_ranges.append({"from": start, "to": month_add(first_ref, -1), "status": "estimated"})
    if meta["nrt_months"]:
        status_ranges.append({"from": min(meta["nrt_months"]), "to": end, "status": "provisional"})


    partial = []
    for m in record:
        dim = calendar.monthrange(int(m[:4]), int(m[5:7]))[1]
        if meta["record_days"][m] < dim:
            partial.append({"month": m, "days_covered": meta["record_days"][m], "days_in_month": dim})

    sats = meta["satellites"]
    seams = []
    if sats["aqua"]["first"] and start < sats["aqua"]["first"]:
        seams.append({"month": sats["aqua"]["first"], "label": "Aqua starts"})
    if meta.get("aqua_seam") and meta["aqua_seam"] != sats["aqua"]["first"]:
        seams.append({"month": meta["aqua_seam"], "label": "Terra-only ratio ends (Aqua nominal)"})
    seams.append({"month": first_ref, "label": "VIIRS starts (S-NPP)"})
    if sats["noaa20"]["first_nominal"]:
        seams.append({"month": sats["noaa20"]["first_nominal"], "label": "NOAA-20 added"})
    if sats["noaa21"]["first"]:
        seams.append({"month": sats["noaa21"]["first"], "label": "NOAA-21 in orbit (not in the VIIRS series)"})
    snpp_last = sats["snpp"]["last"]
    if snpp_last and snpp_last <= end:
        seams.append({"month": snpp_last, "label": "S-NPP ends"})
    seams = [s for s in seams if start <= s["month"] <= end]

    # Known issues: months inside a satellite's run with a missing day or a low day (harmonize outages).
    known = []
    low_share = hc.get("outage_low_day_share", 0.25)
    for s in SATELLITES:
        rows = sorted((o for o in meta["outages"] if o["satellite"] == s), key=lambda r: r["month"])
        for a, b in ranges([r["month"] for r in rows]):
            parts = []
            for r in rows:
                if not a <= r["month"] <= b:
                    continue
                bits = []
                if r["days_missing"]:
                    bits.append(f"{r['days_missing']} of {r['record_days']} days missing")
                if r["low_days"]:
                    bits.append(f"{r['low_days']} day{'s' if r['low_days'] > 1 else ''} with under {low_share:.0%} of the usual detections")
                parts.append(f"{r['month']}: {', '.join(bits)}")
            known.append({"from": a, "to": b, "satellite": s, "note": f"{SAT_LABEL[s]} outage ({'; '.join(parts)})"})
    if meta["nrt_months"]:
        rule = fc.get("nrt_type_rule")
        known.append({
            "from": min(meta["nrt_months"]), "to": end,
            "note": "Near real-time files (no type column): "
            + ("static sources masked with a mask built from the Standard files" if rule == "static_mask" else "no type filter"),
        })
    known.sort(key=lambda k: (k["from"], k["to"]))

    d = meta["diagnostics"]
    n20 = meta["noaa20_to_snpp"]
    notes = [
        "Real FIRMS data: MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m Collection 2 (S-NPP, NOAA-20, NOAA-21), "
        f"archive download, Standard files plus near real-time files for the latest months. Data through {meta['data_through']}.",
        "Per-cell harmonized values before " + first_ref + " come from a regional ratio. They are estimated, can exceed the "
        "days in the month, and are zero wherever MODIS saw nothing. Sums over areas are the reliable figure.",
        f"Band: {hc['band_low_pct']}th to {hc['band_high_pct']}th percentile of the regional ratio over {hc['bootstraps']} "
        "bootstrap resamples of the fit years. It is the calibration spread of the region, not a per-cell error. "
        "The leave-one-year-out table by scale gives the error by size of area.",
        f"Fit months: {len(meta['fit_months'])} months from {meta['fit_months'][0]} to {meta['fit_months'][-1]} where "
        f"{SAT_LABEL[meta['fit_reference']]}, Terra and Aqua are all nominal. Strata: {meta['strata']['res1']} res 1, "
        f"{meta['strata']['res0_fallback']} res 0 fallback, {meta['strata']['global_fallback']} global fallback "
        f"(minimum {hc['min_fit_cell_days']} MODIS cell-days).",
        f"A satellite is nominal in a month when it has data on at least {hc['nominal_day_share']:.0%} of the days. "
        f"Months from NOAA-20's start where the VIIRS series uses one satellite: {d['viirs_reduced_months_from_noaa20_start']}.",
        f"NOAA-20 / S-NPP cell-days: {n20['noaa20_over_snpp_all_seasons']}. The fit target is S-NPP alone, so with the "
        f"NOAA-20 scale {'applied' if n20['applied'] else 'not applied'} h steps by about x{n20['step_at_noaa20_start_switch_off']} "
        f"at {sats['noaa20']['first_nominal']} and by x{n20['step_at_snpp_end_vs_previous_month_switch_off']} when S-NPP ends "
        f"(decision D2: not applied).",
        f"Share of res 6 cell-months in the fit period with no MODIS day but an S-NPP day: {d['zero_modis_share_fit_period']:.0%}.",
        f"Baseline {pc['baseline']['start_year']} to {pc['baseline']['end_year']} (decision D4: "
        "VIIRS years only). 7-cell place-months in the fit period with no activity: "
        f"{meta['d4_zero_share']['summary']['zero_modis']:.0%} on MODIS, {meta['d4_zero_share']['summary']['zero_viirs']:.0%} on S-NPP.",
        "Days are UTC acquisition dates. Detail (res 6) covers: " + "; ".join(detail_names) + ".",
        *(["Optional daily fields (UTC days, proposed for contract v1) for "
           + ", ".join(a["name"] for a in pc["daily_areas"])
           + ": day masks in detail tiles, [day, value] pairs per overview cell, daily series in the summary. "
           "Rule and weights in method.json \"daily\"."]
          if pc.get("daily_areas") else []),
        "Method: the team decisions D1 to D17 of 2026-11-15 (MVP plan section 13, Contributor.md \"How the fire score works\").",
    ]
    return {
        "contract_version": 1,
        "source": pc["source"],
        "built_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_through": meta["data_through"],
        "atom_res": 6,
        "record": {"start": start, "end": end},
        "first_reference_month": first_ref,
        "status_ranges": status_ranges,
        "partial_months": partial,
        "seams": seams,
        "known_issues": known,
        "baseline": dict(pc["baseline"]),
        "classes": dict(pc["classes"]),
        "ladder": [dict(x) for x in pc["ladder"]],
        "ladder_hysteresis": pc["ladder_hysteresis"],
        "overview": {"r5_parts": r5_parts},
        "detail": {"tile_res": int(pc["detail_tile_res"]), "max_place_cells": int(pc["max_place_cells"])},
        "color": {"density_breaks": list(pc["density_breaks"])},
        "method": {
            "version": "firms-1 " + dt.date.today().isoformat(),
            "reference": f"VIIRS-equivalent ({SAT_LABEL[meta['fit_reference']]} units for the fit)",
            "transfer": (
                f"Ratio of {SAT_LABEL[meta['fit_reference']]} to MODIS active cell-days per H3 res {hc['region_res']} region "
                f"and season (DJF, MAM, JJA, SON), fitted on {hc['fit_from']} to {hc['fit_to']}, falling back to the res 0 "
                f"parent and then the globe. Separate Terra-only ratio before {meta['aqua_seam']}"
            ),
            "viirs_group": (
                "Mean of S-NPP and NOAA-20 over those nominal in the month, the one available otherwise. "
                "NOAA-21 in the per-satellite values only"
                + (". NOAA-20 scaled to S-NPP units" if n20["applied"] else "")
            ),
            "filters": (
                f"Type {', '.join(str(t) for t in fc['types'])} only, confidence "
                + " or ".join({"l": "low", "n": "nominal", "h": "high"}[c] for c in fc["confidence"])
                + f" (MODIS: nominal {fc['modis_low_below']} to {fc['modis_high_from'] - 1}, high {fc['modis_high_from']} and above)"
            ),
            "notes": notes,
        },
    }


def main() -> None:
    p = base_parser(__doc__.splitlines()[0])
    p.add_argument("--out", type=Path, default=None, help="publish folder (default from config: web/public/firms)")
    p.add_argument("--force", action="store_true", help="replace a target folder that is not a firms build")
    args = p.parse_args()
    cfg = load_config(args.config)
    pc = cfg["publish"]
    paths = resolve_paths(cfg, args.data_root, args.out)
    cells_path = paths.harmonized / "cells.parquet"
    meta_path = paths.harmonized / "meta.json"
    if not cells_path.exists() or not meta_path.exists():
        raise BuildError(f"{cells_path} or meta.json not found. Run pipeline/harmonize.py first.")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    target = paths.publish
    if target.exists() and not args.force:
        mf = target / "manifest.json"
        src = None
        if mf.exists():
            try:
                src = json.loads(mf.read_text(encoding="utf-8")).get("source")
            except json.JSONDecodeError:
                src = None
        if src != "firms" and any(target.iterdir()):
            raise BuildError(f"{target} exists and is not a firms build. Use another --out or pass --force.")
    tile_res = int(pc["detail_tile_res"])
    if tile_res != 3:
        raise BuildError("publish.detail_tile_res: only 3 is supported by the overview grouping here")
    building = target.with_name(target.name + ".building")
    if building.exists():
        shutil.rmtree(building)
    building.mkdir(parents=True)
    con = connect(args.threads, args.memory, paths.processed / "tmp", h3=True)
    start, end = meta["record"]["start"], meta["record"]["end"]
    n_months = month_index(start, end) + 1
    record = [month_add(start, i) for i in range(n_months)]
    first_ref_mi = month_index(start, meta["first_reference_month"])

    with step(paths, "publish", building) as info:
        con.execute(
            f"""CREATE TEMP TABLE c AS
                SELECT *, h3_cell_to_parent(cell6, 3) AS p3, h3_cell_to_parent(cell6, 4) AS p4,
                       h3_cell_to_parent(cell6, 5) AS p5, h3_cell_to_parent(cell6, 0) AS p0
                FROM read_parquet('{cells_path.as_posix()}')"""
        )
        bad = con.execute(f"SELECT count(*) FROM c WHERE mi >= {first_ref_mi} AND NOT (h10 = viirs10 AND lo10 = h10 AND hi10 = h10)").fetchone()[0]
        if bad:
            raise BuildError(f"{bad} res 6 rows break rule 3 (h = lo = hi = viirs from the first reference month)")
        bytes_by = {"r3": 0, "r4": 0, "r5": 0, "detail": 0, "summary": 0, "other": 0}

        # ---------------------------------------------------------------- daily values (optional fields)
        daily_areas = list(pc.get("daily_areas", []))
        daily_on = len(daily_areas) > 0
        group = list(cfg["harmonize"]["viirs_group"])
        n_sel = 0
        if daily_on:
            if group != ["snpp", "noaa20"]:
                raise BuildError("publish.daily_areas expects harmonize.viirs_group = ['snpp', 'noaa20']")
            n_sel = select_daily_cells(con, daily_areas)
            make_daily(con, meta, record, first_ref_mi, paths, int(cfg["harmonize"]["region_res"]))

        # ---------------------------------------------------------------- overview
        def overview(res: int, part_col: str | None = None):
            group_cols = f"p{res}" + (f", {part_col}" if part_col else "")
            order = f"mi, {f'{part_col}, ' if part_col else ''}p{res}"
            dsel_sql = (f"p{res} IN (SELECT DISTINCT h3_cell_to_parent(cell6, {res}) FROM sel)" if daily_on else "false")
            con.execute(
                f"""CREATE OR REPLACE TEMP TABLE ov AS
                    SELECT row_number() OVER (ORDER BY {order}) - 1 AS rn, *,
                           {dsel_sql} AS dsel
                    FROM (SELECT mi, {group_cols}, sum(h10) h, sum(lo10) lo, sum(hi10) hi, sum(modis) m, sum(viirs10) v
                          FROM c GROUP BY mi, {group_cols}
                          HAVING sum(h10) > 0 OR sum(modis) > 0 OR sum(viirs10) > 0)"""
            )
            rows = con.execute("SELECT * FROM ov ORDER BY rn").fetchnumpy()
            if daily_on:
                dly = con.execute(
                    f"""SELECT ov.rn, dd.day, sum(dd.v10) AS v FROM dd
                        JOIN ov ON ov.mi = dd.mi AND ov.p{res} = h3_cell_to_parent(dd.cell6, {res})
                        WHERE ov.dsel
                        GROUP BY ov.rn, dd.day ORDER BY ov.rn, dd.day"""
                ).fetchnumpy()
                rn = np.asarray(dly["rn"]).astype(np.int64)
                n = len(rows["rn"])
                # Check: for every cell with daily values, the days sum to its monthly h (exact, in
                # tenths). dd covers every res 6 child of these cells, not only the selected ones.
                sums = np.bincount(rn, weights=np.asarray(dly["v"], dtype=np.float64), minlength=n)
                h = np.asarray(rows["h"]).astype(np.int64)
                dsel = np.asarray(rows["dsel"]).astype(bool)
                off = np.nonzero(dsel & (np.abs(sums - h) > 0.5))[0]
                if len(off):
                    i = int(off[0])
                    raise BuildError(f"res {res}: daily values of {len(off)} cell-months do not sum to h "
                                     f"(first: row {i}, h {h[i] / 10}, days {sums[i] / 10})")
                log(f"  overview r{res}: daily values for {int(dsel.sum()):,} cell-months, each summing to its h")
                rows["_db"] = np.searchsorted(rn, np.arange(n + 1))
                rows["_dday"] = np.asarray(dly["day"]).astype(np.int64)
                rows["_dv"] = np.asarray(dly["v"]).astype(np.int64)
            return rows

        def emit(rows: dict, res: int, idx: np.ndarray, month: str) -> dict:
            out = {
                "month": month, "res": res,
                "cell": [hexid(x) for x in rows[f"p{res}"][idx]],
                "h": tenths(rows["h"][idx]), "lo": tenths(rows["lo"][idx]), "hi": tenths(rows["hi"][idx]),
                "modis": rows["m"][idx].astype(np.int64).tolist(), "viirs": tenths(rows["v"][idx]),
            }
            if daily_on:
                db, days, vals, dsel = rows["_db"], rows["_dday"], rows["_dv"], rows["dsel"]
                pos, d = [], []
                for j, i in enumerate(idx.tolist()):
                    if not dsel[i]:
                        continue
                    a, b = db[i], db[i + 1]
                    pos.append(j)
                    d.append([[int(x), y] for x, y in zip(days[a:b], tenths(vals[a:b]))])
                if pos:
                    out["daily"] = {"idx": pos, "d": d}
            return out

        max_file = {"r3": 0, "r4": 0, "r5": 0}
        for res in (3, 4):
            rows = overview(res)
            mis = np.asarray(rows["mi"])
            bounds = np.searchsorted(mis, np.arange(n_months + 1))
            for t, month in enumerate(record):
                idx = np.arange(bounds[t], bounds[t + 1])
                n = write_json(building, f"overview/r{res}/{month}.json", emit(rows, res, idx, month))
                bytes_by[f"r{res}"] += n
                max_file[f"r{res}"] = max(max_file[f"r{res}"], n)
            log(f"  overview r{res}: {len(mis):,} cell-months")

        rows = overview(5, "p0")
        active_parts = sorted({int(x) for x in rows["p0"]})
        detail_areas = pc["detail_areas"]

        # ---------------------------------------------------------------- detail tile choice
        p3 = con.execute("SELECT DISTINCT p3, h3_cell_to_lat(p3), h3_cell_to_lng(p3) FROM c").fetchall()
        tiles = sorted(
            int(x) for x, lat, lng in p3
            if any(a["bbox"][0] <= lng <= a["bbox"][2] and a["bbox"][1] <= lat <= a["bbox"][3] for a in detail_areas)
        )
        log(f"  detail: {len(tiles):,} of {len(p3):,} active res 3 cells are inside the detail areas")
        if pc.get("r5_parts", "all") == "all":
            r5_parts = active_parts
        elif pc["r5_parts"] == "detail":
            r5_parts = sorted({int(r[0]) for r in con.execute(
                "SELECT DISTINCT h3_cell_to_parent(unnest(?::UBIGINT[]), 0)", [tiles]).fetchall()})
        else:
            raise BuildError("publish.r5_parts must be 'all' or 'detail'")
        mis, parts = np.asarray(rows["mi"]), np.asarray(rows["p0"]).astype(np.uint64)
        for part in r5_parts:
            sel = np.nonzero(parts == np.uint64(part))[0]
            pm = mis[sel]
            bounds = np.searchsorted(pm, np.arange(n_months + 1))
            for t, month in enumerate(record):
                idx = sel[bounds[t]:bounds[t + 1]]
                n = write_json(building, f"overview/r5/{hexid(part)}/{month}.json", emit(rows, 5, idx, month))
                bytes_by["r5"] += n
                max_file["r5"] = max(max_file["r5"], n)
        log(f"  overview r5: {len(mis):,} cell-months in {len(r5_parts)} parts")

        # ---------------------------------------------------------------- detail tiles
        con.execute("CREATE TEMP TABLE dt (p3 UBIGINT)")
        con.executemany("INSERT INTO dt VALUES (?)", [(t,) for t in tiles])
        dsel_sql = "c.cell6 IN (SELECT cell6 FROM sel)" if daily_on else "false"
        d = con.execute(
            f"""SELECT c.p3, c.cell6, c.mi, c.h10, c.lo10, c.hi10, c.modis, c.viirs10, c.terra, c.aqua, c.snpp, c.noaa20, c.noaa21,
                       c.dm_modis, c.dm_snpp, c.dm_noaa20, {dsel_sql} AS dsel
                FROM c JOIN dt USING (p3) ORDER BY c.p3, c.cell6, c.mi"""
        ).fetchnumpy()
        p3a = np.asarray(d["p3"]).astype(np.uint64)
        tb = np.searchsorted(p3a, np.asarray(tiles, dtype=np.uint64))
        tb = np.append(tb, len(p3a))
        max_tile = 0
        written_tiles = []
        for k, tile in enumerate(tiles):
            a, b = tb[k], tb[k + 1]
            if a == b:
                continue
            cells = np.asarray(d["cell6"][a:b]).astype(np.uint64)
            change = np.nonzero(np.diff(cells))[0] + 1
            offsets = [0, *change.tolist(), int(b - a)]
            obj = {
                "parent": hexid(tile), "res": 6, "start": start, "n_months": n_months,
                "cells": [hexid(x) for x in cells[[0, *change.tolist()]]],
                "offsets": offsets,
                "mi": d["mi"][a:b].astype(np.int64).tolist(),
                "h": tenths(d["h10"][a:b]), "lo": tenths(d["lo10"][a:b]), "hi": tenths(d["hi10"][a:b]),
                "modis": d["modis"][a:b].astype(np.int64).tolist(), "viirs": tenths(d["viirs10"][a:b]),
                "sat": {s: d[s][a:b].astype(np.int64).tolist() for s in SATELLITES},
            }
            if daily_on:
                rows_sel = np.nonzero(np.asarray(d["dsel"][a:b]).astype(bool))[0]
                if len(rows_sel):
                    obj["daily"] = {"rows": rows_sel.tolist(),
                                    **{k: np.asarray(d[k][a:b])[rows_sel].astype(np.int64).tolist()
                                       for k in ("dm_modis", "dm_snpp", "dm_noaa20")}}
            n = write_json(building, f"detail/{hexid(tile)}.json", obj)
            bytes_by["detail"] += n
            max_tile = max(max_tile, n)
            written_tiles.append(hexid(tile))
        bytes_by["other"] += write_json(building, "detail/index.json", {"tile_res": tile_res, "tiles": written_tiles})
        log(f"  detail: {len(written_tiles)} tiles, {human(bytes_by['detail'])}, largest {human(max_tile)}")

        # ---------------------------------------------------------------- summary, places, method, manifest
        s = con.execute(
            f"""SELECT mi, sum(h10) h, sum(lo10) lo, sum(hi10) hi, sum(modis) m, sum(viirs10) v,
                       {', '.join(f'sum({x}) {x}' for x in SATELLITES)}
                FROM c GROUP BY mi ORDER BY mi"""
        ).fetchnumpy()
        dense = {k: np.zeros(n_months, dtype=np.int64) for k in ("h", "lo", "hi", "m", "v", *SATELLITES)}
        for k in dense:
            dense[k][np.asarray(s["mi"]).astype(int)] = np.asarray(s[k]).astype(np.int64)
        summary = {
            "start": start, "n_months": n_months,
            "h": tenths(dense["h"]), "lo": tenths(dense["lo"]), "hi": tenths(dense["hi"]),
            "modis": dense["m"].tolist(), "viirs": tenths(dense["v"]),
            "sat": {x: dense[x].tolist() for x in SATELLITES},
        }
        if daily_on:
            # One dense series per daily area (its selected res 6 cells), per UTC day to data_through.
            day0 = dt.date(int(start[:4]), int(start[5:7]), 1)
            last = dt.date.fromisoformat(meta["data_through"])
            n_days = (last - day0).days + 1
            series_out = []
            for ai, area in enumerate(daily_areas):
                series = np.zeros(n_days, dtype=np.int64)
                g = con.execute(
                    f"SELECT dd.mi, dd.day, sum(dd.v10) v FROM dd JOIN sel USING (cell6) WHERE sel.area_{ai} GROUP BY ALL"
                ).fetchnumpy()
                for t, dday, v in zip(np.asarray(g["mi"]).tolist(), np.asarray(g["day"]).tolist(), np.asarray(g["v"]).tolist()):
                    m = record[t]
                    date = dt.date(int(m[:4]), int(m[5:7]), int(dday))
                    if date > last:
                        raise BuildError(f"daily value after data_through on {date}")
                    series[(date - day0).days] += int(v)
                # Check: the days of each month sum to the area's monthly h (exact, in tenths).
                hm = con.execute(f"SELECT mi, sum(h10) FROM c JOIN sel USING (cell6) WHERE sel.area_{ai} GROUP BY mi").fetchall()
                hmap = {int(t): int(v) for t, v in hm}
                for t, m in enumerate(record):
                    a0 = (dt.date(int(m[:4]), int(m[5:7]), 1) - day0).days
                    b0 = min(n_days, a0 + calendar.monthrange(int(m[:4]), int(m[5:7]))[1])
                    if int(series[a0:b0].sum()) != hmap.get(t, 0):
                        raise BuildError(f"summary: daily values of {area['name']} in {m} sum to {series[a0:b0].sum() / 10}, "
                                         f"h is {hmap.get(t, 0) / 10}")
                n_cells = con.execute(f"SELECT count(*) FROM sel WHERE area_{ai}").fetchone()[0]
                series_out.append({"name": area["name"], "bbox": list(area["bbox"]), "res6_cells": int(n_cells),
                                   "daily_start": day0.isoformat(), "daily_h": tenths(series)})
                log(f"  summary: daily series for {area['name']} ({n_cells:,} res 6 cells), days sum to each month")
            summary["daily_areas"] = series_out
        bytes_by["summary"] += write_json(building, "summary/global.json", summary)
        bytes_by["other"] += write_json(building, "places.json", [dict(x) for x in pc["places"]])
        method = {"ratios": meta["ratios"], "loyo": meta["loyo"], "loyo_breakdown": meta.get("loyo_breakdown"),
                  "noaa20_to_snpp": meta["noaa20_to_snpp"], "diagnostics": meta["diagnostics"],
                  "d4_zero_share": meta["d4_zero_share"]["summary"],
                  "d4_band_half_width": meta["d4_band_half_width"]["summary"]}
        if daily_on:
            method["daily"] = daily_doc(meta, record, first_ref_mi)
        bytes_by["other"] += write_json(building, "method.json", method)
        names = [a["name"] for a in detail_areas]
        manifest = build_manifest(cfg, meta, [hexid(x) for x in r5_parts], names)
        if daily_on:
            manifest["daily"] = {
                "areas": [{"name": a["name"], "bbox": list(a["bbox"])} for a in daily_areas],
                "res6_cells": int(n_sel),
                "days": "utc",
            }
        bytes_by["other"] += write_json(building, "manifest.json", manifest)
        (building / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        # Outages inside baseline years (not excluded from baselines: that is an app decision).
        b = pc["baseline"]
        in_base = [o for o in meta["outages"] if b["start_year"] <= int(o["month"][:4]) <= b["end_year"]]
        info["outages_in_baseline_years"] = in_base
        log(f"  {len(in_base)} outage satellite-months fall in baseline years {b['start_year']} to {b['end_year']}: "
            + ", ".join(f"{SAT_LABEL[o['satellite']]} {o['month']}" for o in in_base))
        info["bytes"] = bytes_by
        info["largest_file_bytes"] = {**max_file, "detail": max_tile}
        info["detail_tiles"] = len(written_tiles)
        info["r5_parts"] = len(r5_parts)
        info["files"] = sum(1 for _ in building.rglob("*.json"))
        info["daily_res6_cells"] = int(n_sel)
        log(f"  {info['files']:,} files: r3 {human(bytes_by['r3'])}, r4 {human(bytes_by['r4'])}, r5 {human(bytes_by['r5'])}, "
            f"detail {human(bytes_by['detail'])}, summary {human(bytes_by['summary'])}, other {human(bytes_by['other'])}; "
            f"largest r3 {human(max_file['r3'])}, r4 {human(max_file['r4'])}, r5 {human(max_file['r5'])}, detail {human(max_tile)}")

    # Swap in the new folder.
    if target.exists():
        old = target.with_name(target.name + ".old")
        if old.exists():
            shutil.rmtree(old)
        target.rename(old)
        building.rename(target)
        shutil.rmtree(old)
    else:
        building.rename(target)
    log(f"published to {target}")


if __name__ == "__main__":
    main_guard(main)
