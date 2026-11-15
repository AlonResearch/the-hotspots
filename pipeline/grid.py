"""Step 2: grid and aggregate. Detections to the atom table (res 6 cell x month x satellite).

Reads   processed/normalized/product=*/*.parquet
Writes  processed/atoms/product=*/<same name>.parquet   atom table, one file per normalized file
        processed/atoms/coverage.parquet                 days with data per satellite and month (unfiltered)
        processed/atoms/coverage_daily.parquet           rows per satellite and day (unfiltered)
        processed/atoms/nrt_static_mask.parquet          res 6 cells dropped from NRT months (filters.nrt_type_rule)

Atom table (pipeline/README.md, step grid): cell6 UBIGINT, month INTEGER (yyyymm), satellite VARCHAR,
active_days UTINYINT, day_mask UINTEGER (bit d-1 set when day d has a detection), n_det UINTEGER,
n_det_night UINTEGER, frp_max FLOAT, frp_sum FLOAT, processing VARCHAR (SP or NRT).
Only detections that pass the filters of config.toml count. Coarser cells are sums of res 6 cells,
so no other resolution is stored. The day is the UTC acq_date (decision D10).

Usage: python pipeline/grid.py [--data-root DIR] [--force]
"""

from __future__ import annotations

from common import BuildError, base_parser, connect, load_config, log, main_guard, resolve_paths, step


def sql_list(values) -> str:
    return ", ".join(f"'{v}'" if isinstance(v, str) else str(int(v)) for v in values)


def main() -> None:
    p = base_parser(__doc__.splitlines()[0])
    p.add_argument("--force", action="store_true", help="rewrite atom files that already exist")
    args = p.parse_args()
    cfg = load_config(args.config)
    paths = resolve_paths(cfg, args.data_root)
    src = paths.normalized
    files = sorted(src.glob("product=*/*.parquet"))
    files = [f for f in files if not f.name.startswith("_tmp_")]
    if not files:
        raise BuildError(f"no normalized files under {src}. Run pipeline/normalize.py first.")
    out = paths.atoms
    out.mkdir(parents=True, exist_ok=True)
    con = connect(args.threads, args.memory, paths.processed / "tmp", h3=True)
    f = cfg["filters"]
    g = cfg["grid"]
    if g.get("day", "utc") != "utc":
        raise BuildError("grid.day: only 'utc' is implemented (decision D10)")
    res = int(g["atom_res"])
    if res != 6:
        raise BuildError("grid.atom_res must be 6 (contract v1 atom_res)")
    conf = sql_list(f["confidence"])
    types = sql_list(f["types"])
    rule = f.get("nrt_type_rule", "static_mask")
    if rule not in ("static_mask", "none"):
        raise BuildError(f"filters.nrt_type_rule must be 'static_mask' or 'none', not {rule!r}")
    all_glob = f"{src.as_posix()}/product=*/[0-9]*.parquet"

    with step(paths, "grid", out) as info:
        # Days with data per satellite and month, before any filter (for nominal months, outages, partial months).
        con.execute(
            f"""COPY (
                  SELECT satellite, CAST(strftime(acq_date, '%Y%m') AS INTEGER) AS month,
                         count(DISTINCT acq_date) AS days_covered, max(acq_date) AS last_day,
                         min(acq_date) AS first_day, count(*) AS n_rows, max(processing) AS processing
                  FROM read_parquet('{all_glob}') GROUP BY ALL ORDER BY 1, 2
                ) TO '{(out / 'coverage.parquet').as_posix()}' (FORMAT parquet)"""
        )
        # Rows per satellite and day, before any filter (for outages that leave every day with some data).
        con.execute(
            f"""COPY (
                  SELECT satellite, acq_date, count(*) AS n_rows
                  FROM read_parquet('{all_glob}') GROUP BY ALL ORDER BY 1, 2
                ) TO '{(out / 'coverage_daily.parquet').as_posix()}' (FORMAT parquet)"""
        )
        log("coverage tables written")

        mask_path = out / "nrt_static_mask.parquet"
        if rule == "static_mask":
            y0, y1 = (int(x) for x in f["nrt_mask_years"])
            share = float(f["nrt_mask_min_share"])
            con.execute(
                f"""COPY (
                      SELECT h3_latlng_to_cell(lat, lon, {res}) AS cell6,
                             count(*) AS n_sp, count(*) FILTER (WHERE type NOT IN ({types})) AS n_static
                      FROM read_parquet('{all_glob}')
                      WHERE processing = 'SP' AND type IS NOT NULL AND confidence_class IN ({conf})
                        AND year(acq_date) BETWEEN {y0} AND {y1}
                      GROUP BY 1 HAVING n_static >= {share} * n_sp
                    ) TO '{mask_path.as_posix()}' (FORMAT parquet)"""
            )
            n_mask = con.execute(f"SELECT count(*) FROM read_parquet('{mask_path.as_posix()}')").fetchone()[0]
            log(f"NRT static mask: {n_mask:,} res 6 cells (type not in [{types}] for >= {share:.0%} of SP detections, {y0} to {y1})")
            info["nrt_mask_cells"] = n_mask
        else:
            con.execute(f"COPY (SELECT CAST(NULL AS UBIGINT) AS cell6 WHERE false) TO '{mask_path.as_posix()}' (FORMAT parquet)")
        con.execute(f"CREATE TEMP TABLE nrt_mask AS SELECT cell6 FROM read_parquet('{mask_path.as_posix()}')")

        total_in, total_kept, total_atoms = 0, 0, 0
        for path in files:
            product_dir = path.parent.name
            target = out / product_dir / path.name
            if target.exists() and not args.force:
                log(f"  skip {product_dir}/{path.name} (exists)")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_name("_tmp_" + target.name)
            con.execute(
                f"""COPY (
                      WITH d AS (
                        SELECT h3_latlng_to_cell(lat, lon, {res}) AS cell6, satellite, acq_date, daynight, frp, processing
                        FROM read_parquet('{path.as_posix()}')
                        WHERE confidence_class IN ({conf})
                          AND (type IN ({types}) OR (type IS NULL AND processing = 'NRT'))
                      )
                      SELECT cell6, CAST(strftime(acq_date, '%Y%m') AS INTEGER) AS month, satellite,
                             CAST(bit_count(bit_or(CAST(1 AS UINTEGER) << (day(acq_date) - 1))) AS UTINYINT) AS active_days,
                             bit_or(CAST(1 AS UINTEGER) << (day(acq_date) - 1)) AS day_mask,
                             CAST(count(*) AS UINTEGER) AS n_det,
                             CAST(count(*) FILTER (WHERE daynight = 'N') AS UINTEGER) AS n_det_night,
                             max(frp) AS frp_max, CAST(sum(frp) AS FLOAT) AS frp_sum,
                             max(processing) AS processing
                      FROM d
                      WHERE NOT (processing = 'NRT' AND cell6 IN (SELECT cell6 FROM nrt_mask))
                      GROUP BY cell6, month, satellite
                    ) TO '{tmp.as_posix()}' (FORMAT parquet, COMPRESSION zstd)"""
            )
            n_in = con.execute(f"SELECT count(*) FROM read_parquet('{path.as_posix()}')").fetchone()[0]
            n_atoms, n_kept = con.execute(f"SELECT count(*), sum(n_det) FROM read_parquet('{tmp.as_posix()}')").fetchone()
            tmp.replace(target)
            total_in += n_in
            total_kept += int(n_kept or 0)
            total_atoms += n_atoms
            log(f"  {product_dir}/{path.name}: {n_in:,} detections, {int(n_kept or 0):,} pass the filters, {n_atoms:,} atoms")
        info["detections_read"] = total_in
        info["detections_kept"] = total_kept
        info["atoms_written"] = total_atoms
        info["filters"] = {k: f[k] for k in ("confidence", "types", "nrt_type_rule")}


if __name__ == "__main__":
    main_guard(main)
