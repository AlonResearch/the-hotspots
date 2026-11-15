import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DS = ROOT / "data" / "datasets"
TMP = ROOT / "data" / "work" / "duckdb_tmp"
TMP.mkdir(parents=True, exist_ok=True)
STAGE = ROOT / "data" / "work" / "stage1_cell_day_sensor.parquet"
OUT_PQ = DS / "FIRMS-2018-2026.parquet"
OUT_CSV = DS / "FIRMS-2018-2026.csv"

COLS = ("{'latitude':'DOUBLE','longitude':'DOUBLE','brightness':'DOUBLE','scan':'DOUBLE','track':'DOUBLE',"
        "'acq_date':'DATE','acq_time':'VARCHAR','satellite':'VARCHAR','instrument':'VARCHAR',"
        "'confidence':'VARCHAR','version':'VARCHAR','bright_t31':'DOUBLE','frp':'DOUBLE',"
        "'daynight':'VARCHAR','type':'VARCHAR'}")

con = duckdb.connect()
con.execute(f"SET memory_limit='6GB'; SET threads=12; SET temp_directory='{TMP}'; SET preserve_insertion_order=false;")
con.execute("LOAD h3")
t0 = time.time()

def log(msg):
    print(f"[{time.time() - t0:6.0f}s] {msg}", flush=True)

con.execute(f"""
COPY (
  WITH src AS (
    SELECT 'MODIS' AS sensor, latitude, longitude, acq_date, frp, daynight, type
    FROM read_csv('{DS / "MODIS-2018-2026.csv"}', header=true, columns={COLS})
    WHERE TRY_CAST(confidence AS INTEGER) >= 30
    UNION ALL
    SELECT 'VIIRS', latitude, longitude, acq_date, frp, daynight, type
    FROM read_csv('{DS / "VIIRS-2018-2026.csv"}', header=true, columns={COLS})
    WHERE confidence IN ('n', 'h')
  )
  SELECT h3_latlng_to_cell(latitude, longitude, 6) AS cell, acq_date AS date, sensor,
         CASE WHEN type = '0' THEN 'veg' WHEN type IN ('1','2','3') THEN 'nonveg' ELSE 'nrt' END AS cls,
         COUNT(*)::INTEGER AS n, SUM(frp)::FLOAT AS frp, SUM((daynight = 'N')::INTEGER)::INTEGER AS night
  FROM src GROUP BY ALL
) TO '{STAGE}' (FORMAT parquet)
""")
log(f"stage 1 written: {con.execute(f'SELECT COUNT(*) FROM read_parquet(\'{STAGE}\')').fetchone()[0]:,} rows")

con.execute(f"""
COPY (
  WITH s AS (SELECT * FROM read_parquet('{STAGE}')),
  mask AS (
    SELECT cell FROM s WHERE cls IN ('veg', 'nonveg') GROUP BY cell
    HAVING SUM(n) FILTER (WHERE cls = 'nonveg') > 0.5 * SUM(n)
  ),
  kept AS (
    SELECT * FROM s WHERE cls = 'veg'
    UNION ALL
    SELECT * FROM s WHERE cls = 'nrt' AND cell NOT IN (SELECT cell FROM mask)
  )
  SELECT h3_h3_to_string(cell) AS cell, date,
         COALESCE(SUM(n)     FILTER (WHERE sensor = 'MODIS'), 0)::INTEGER AS modis_n,
         ROUND(COALESCE(SUM(frp) FILTER (WHERE sensor = 'MODIS'), 0), 2)  AS modis_frp,
         COALESCE(SUM(night) FILTER (WHERE sensor = 'MODIS'), 0)::INTEGER AS modis_night,
         COALESCE(SUM(n)     FILTER (WHERE sensor = 'VIIRS'), 0)::INTEGER AS viirs_n,
         ROUND(COALESCE(SUM(frp) FILTER (WHERE sensor = 'VIIRS'), 0), 2)  AS viirs_frp,
         COALESCE(SUM(night) FILTER (WHERE sensor = 'VIIRS'), 0)::INTEGER AS viirs_night,
         MAX((cls = 'nrt')::INTEGER)::TINYINT AS is_nrt
  FROM kept GROUP BY cell, date
  ORDER BY date, cell
) TO '{OUT_PQ}' (FORMAT parquet)
""")
masked = con.execute(f"""SELECT COUNT(*) FROM (SELECT cell FROM read_parquet('{STAGE}') WHERE cls IN ('veg','nonveg')
                         GROUP BY cell HAVING SUM(n) FILTER (WHERE cls='nonveg') > 0.5 * SUM(n))""").fetchone()[0]
log(f"stage 2 written: {OUT_PQ.name}; masked non-vegetation cells: {masked:,}")

con.execute(f"COPY (SELECT * FROM read_parquet('{OUT_PQ}')) TO '{OUT_CSV}' (HEADER, DELIMITER ',')")
log(f"CSV written: {OUT_CSV.name}")

print(con.execute(f"""
SELECT COUNT(*) AS rows, MIN(date) AS first, MAX(date) AS last, COUNT(DISTINCT cell) AS cells,
       SUM((modis_n > 0 AND viirs_n > 0)::INT) AS both_sensors,
       SUM((modis_n > 0 AND viirs_n = 0)::INT) AS modis_only,
       SUM((modis_n = 0 AND viirs_n > 0)::INT) AS viirs_only,
       SUM(is_nrt) AS nrt_rows, SUM(modis_n) AS modis_detections, SUM(viirs_n) AS viirs_detections
FROM read_parquet('{OUT_PQ}')""").df().T.to_string())
log("done")
