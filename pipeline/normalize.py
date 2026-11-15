"""Step 1: normalize the raw FIRMS CSV files into one schema, written as Parquet.

Reads   raw/archive/DL_FIRE_*/fire_archive_*.csv and fire_nrt_*.csv (primary source), and
        raw/firms/{PRODUCT}/{PRODUCT}_{YYYY-MM}.csv (Area API months) only for (product, month)
        pairs that no archive file covers.
Writes  processed/normalized/product={modis|snpp|noaa20|noaa21}/{year}_{SP|NRT}_{file id}.parquet
        One file per source CSV (an archive request is one product and one calendar year).

Schema (pipeline/README.md, normalize): satellite, sensor_group, lat, lon, acq_date, acq_time, confidence_class,
frp, daynight, type, processing, source_file. The measured file differences are applied here:
acq_time is parsed from padded text or an integer, satellite codes are mapped explicitly
(Terra/T, Aqua/A, SNPP/N, N20/1, N21/2), and NRT files without a type column get type NULL.

Usage: python pipeline/normalize.py [--data-root DIR] [--force]
"""

from __future__ import annotations

import re
from pathlib import Path

from common import BuildError, base_parser, connect, human, load_config, log, main_guard, resolve_paths, step

PRODUCT_OF_PREFIX = {"M-C61": "modis", "SV-C2": "snpp", "J1V-C2": "noaa20", "J2V-C2": "noaa21"}
PRODUCT_OF_API = {
    "MODIS_SP": "modis",
    "MODIS_NRT": "modis",
    "VIIRS_SNPP_SP": "snpp",
    "VIIRS_SNPP_NRT": "snpp",
    "VIIRS_NOAA20_SP": "noaa20",
    "VIIRS_NOAA20_NRT": "noaa20",
    "VIIRS_NOAA21_SP": "noaa21",
    "VIIRS_NOAA21_NRT": "noaa21",
}
ALLOWED_SATS = {"modis": ("terra", "aqua"), "snpp": ("snpp",), "noaa20": ("noaa20",), "noaa21": ("noaa21",)}

SAT_CASE = """CASE trim(CAST(satellite AS VARCHAR))
    WHEN 'Terra' THEN 'terra' WHEN 'T' THEN 'terra'
    WHEN 'Aqua' THEN 'aqua' WHEN 'A' THEN 'aqua'
    WHEN 'SNPP' THEN 'snpp' WHEN 'N' THEN 'snpp'
    WHEN 'N20' THEN 'noaa20' WHEN '1' THEN 'noaa20'
    WHEN 'N21' THEN 'noaa21' WHEN '2' THEN 'noaa21'
    ELSE NULL END"""


def header(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        return [c.strip() for c in f.readline().strip().split(",")]


def select_sql(path: Path, product: str, processing: str, cfg: dict) -> str:
    cols = header(path)
    required = {"latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp", "daynight"}
    missing = required - set(cols)
    if missing:
        raise BuildError(f"{path}: missing columns {sorted(missing)}")
    low = int(cfg["filters"]["modis_low_below"])
    high = int(cfg["filters"]["modis_high_from"])
    type_expr = "TRY_CAST(type AS TINYINT)" if "type" in cols else "CAST(NULL AS TINYINT)"
    if product == "modis":
        conf = (
            f"CASE WHEN TRY_CAST(confidence AS INTEGER) IS NULL THEN NULL "
            f"WHEN CAST(confidence AS INTEGER) < {low} THEN 'l' "
            f"WHEN CAST(confidence AS INTEGER) < {high} THEN 'n' ELSE 'h' END"
        )
    else:
        conf = "CASE lower(trim(CAST(confidence AS VARCHAR))) WHEN 'l' THEN 'l' WHEN 'n' THEN 'n' WHEN 'h' THEN 'h' WHEN 'low' THEN 'l' WHEN 'nominal' THEN 'n' WHEN 'high' THEN 'h' ELSE NULL END"
    src = path.as_posix().replace("'", "''")
    types = "{'acq_time': 'VARCHAR', 'confidence': 'VARCHAR', 'satellite': 'VARCHAR', 'version': 'VARCHAR', 'acq_date': 'DATE'}"
    return f"""
        SELECT
          {SAT_CASE} AS satellite,
          '{'modis' if product == 'modis' else 'viirs'}' AS sensor_group,
          CAST(latitude AS DOUBLE) AS lat,
          CAST(longitude AS DOUBLE) AS lon,
          acq_date,
          CAST(lpad(trim(CAST(acq_time AS VARCHAR)), 4, '0') AS SMALLINT) AS acq_time,
          {conf} AS confidence_class,
          CAST(frp AS FLOAT) AS frp,
          CAST(daynight AS VARCHAR) AS daynight,
          {type_expr} AS type,
          '{processing}' AS processing,
          '{path.name}' AS source_file
        FROM read_csv('{src}', header = true, types = {types})
    """


def convert(con, path: Path, product: str, processing: str, out_dir: Path, cfg: dict, force: bool) -> dict:
    file_id = re.sub(r"[^A-Za-z0-9_-]", "_", path.stem)
    tmp = out_dir / f"product={product}" / f"_tmp_{file_id}.parquet"
    existing = list((out_dir / f"product={product}").glob(f"*_{processing}_{file_id}.parquet"))
    if existing and not force:
        log(f"  skip {path.name} (exists: {existing[0].name})")
        return {"file": path.name, "skipped": True}
    for e in existing:
        e.unlink()
    tmp.parent.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY ({select_sql(path, product, processing, cfg)}) TO '{tmp.as_posix()}' (FORMAT parquet, COMPRESSION zstd)")
    stats = con.execute(
        f"""SELECT count(*), min(acq_date), max(acq_date),
                   count(*) FILTER (WHERE satellite IS NULL),
                   count(*) FILTER (WHERE confidence_class IS NULL),
                   count(*) FILTER (WHERE acq_time IS NULL OR acq_time < 0 OR acq_time > 2359),
                   list(DISTINCT satellite)
            FROM read_parquet('{tmp.as_posix()}')"""
    ).fetchone()
    rows, dmin, dmax, bad_sat, bad_conf, bad_time, sats = stats
    if bad_sat or bad_time:
        tmp.unlink()
        raise BuildError(f"{path}: {bad_sat} rows with an unknown satellite code, {bad_time} with a bad acq_time")
    unexpected = [s for s in sats if s not in ALLOWED_SATS[product]]
    if unexpected:
        tmp.unlink()
        raise BuildError(f"{path}: satellites {unexpected} do not belong to product {product}")
    final = out_dir / f"product={product}" / f"{dmin.year}_{processing}_{file_id}.parquet"
    tmp.replace(final)
    log(f"  {path.name}: {rows:,} rows, {dmin} to {dmax}, {human(final.stat().st_size)}"
        + (f", {bad_conf} rows without a confidence class" if bad_conf else ""))
    return {"file": path.name, "rows": rows, "min": str(dmin), "max": str(dmax), "bytes": final.stat().st_size,
            "no_confidence": bad_conf}


def main() -> None:
    p = base_parser(__doc__.splitlines()[0])
    p.add_argument("--force", action="store_true", help="rewrite files that already exist")
    args = p.parse_args()
    cfg = load_config(args.config)
    paths = resolve_paths(cfg, args.data_root)
    archive = paths.raw / "archive"
    if not archive.is_dir():
        raise BuildError(f"raw archive folder not found: {archive}. Pass --data-root to the folder holding raw/.")
    out = paths.normalized
    out.mkdir(parents=True, exist_ok=True)
    con = connect(args.threads, args.memory, paths.processed / "tmp")

    with step(paths, "normalize", out) as info:
        files = []
        for folder in sorted(archive.glob("DL_FIRE_*")):
            m = re.match(r"DL_FIRE_(.+)_\d+$", folder.name)
            if not m or m.group(1) not in PRODUCT_OF_PREFIX:
                raise BuildError(f"unknown archive folder {folder.name}")
            product = PRODUCT_OF_PREFIX[m.group(1)]
            for csv in sorted(folder.glob("*.csv")):
                if csv.name.startswith("fire_archive_"):
                    files.append((csv, product, "SP"))
                elif csv.name.startswith("fire_nrt_"):
                    files.append((csv, product, "NRT"))
                else:
                    raise BuildError(f"unexpected file {csv}")
        if not files:
            raise BuildError(f"no CSV files under {archive}")
        log(f"{len(files)} archive CSV files")
        results = [convert(con, f, prod, proc, out, cfg, args.force) for f, prod, proc in files]

        # Months each product already has from the archive.
        covered = {
            (r[0], r[1])
            for r in con.execute(
                f"""SELECT DISTINCT regexp_extract(filename, 'product=([a-z0-9]+)', 1) AS product,
                           strftime(acq_date, '%Y-%m') AS month
                    FROM read_parquet('{out.as_posix()}/product=*/*.parquet', filename = true)"""
            ).fetchall()
        }
        api_used, api_skipped = [], 0
        api_root = paths.raw / "firms"
        if cfg["normalize"].get("use_api_months", True) and api_root.is_dir():
            for prod_dir in sorted(d for d in api_root.iterdir() if d.is_dir()):
                product = PRODUCT_OF_API.get(prod_dir.name)
                if product is None:
                    continue
                processing = "NRT" if prod_dir.name.endswith("_NRT") else "SP"
                for csv in sorted(prod_dir.glob(f"{prod_dir.name}_*.csv")):
                    month = csv.stem[-7:]
                    if (product, month) in covered:
                        api_skipped += 1
                        continue
                    results.append(convert(con, csv, product, processing, out, cfg, args.force))
                    api_used.append(csv.name)
        log(f"API month files used: {len(api_used)}, skipped because the archive covers them: {api_skipped}")

        # Check: SP and NRT must not overlap in time for any product.
        overlap = con.execute(
            f"""WITH r AS (
                  SELECT regexp_extract(filename, 'product=([a-z0-9]+)', 1) AS product, processing,
                         min(acq_date) AS dmin, max(acq_date) AS dmax
                  FROM read_parquet('{out.as_posix()}/product=*/*.parquet', filename = true)
                  GROUP BY ALL)
                SELECT s.product, s.dmax, n.dmin FROM r s JOIN r n USING (product)
                WHERE s.processing = 'SP' AND n.processing = 'NRT' AND n.dmin <= s.dmax"""
        ).fetchall()
        if overlap:
            raise BuildError(f"SP and NRT rows overlap: {overlap}. Deduplicate before continuing.")
        totals = con.execute(
            f"""SELECT satellite, processing, count(*), min(acq_date), max(acq_date)
                FROM read_parquet('{out.as_posix()}/product=*/*.parquet') GROUP BY ALL ORDER BY 1, 2"""
        ).fetchall()
        for t in totals:
            log(f"  {t[0]:7s} {t[1]:3s} {t[2]:>13,} rows  {t[3]} to {t[4]}")
        info["rows"] = sum(t[2] for t in totals)
        info["files"] = len(results)
        info["api_files_used"] = api_used
        info["coverage"] = [
            {"satellite": t[0], "processing": t[1], "rows": t[2], "from": str(t[3]), "to": str(t[4])} for t in totals
        ]


if __name__ == "__main__":
    main_guard(main)
