import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "data" / "work"
SRC = WORK / "monthly_res4.parquet"

con = duckdb.connect()
con.execute(f"SET memory_limit='5GB'; SET threads=12; SET temp_directory='{WORK / 'duckdb_tmp'}'")
con.execute("LOAD h3")
t0 = time.time()

con.execute(f"""
CREATE TABLE base AS
SELECT area, month, year(month) AS yr, month(month) AS m,
       (y * f)::FLOAT AS y, x_modis::FLOAT AS x_modis, (frp_viirs * f)::FLOAT AS frp_viirs, nrt
FROM (SELECT *, CASE strftime(month, '%Y-%m') WHEN '2023-07' THEN 31.0 / 27 WHEN '2023-09' THEN 30.0 / 29
                                              WHEN '2024-02' THEN 29.0 / 28 ELSE 1.0 END AS f
      FROM read_parquet('{SRC}'))
""")
print(f"base rows: {con.execute('SELECT COUNT(*) FROM base').fetchone()[0]:,}  "
      f"areas: {con.execute('SELECT COUNT(DISTINCT area) FROM base').fetchone()[0]:,}")

con.execute("""CREATE TABLE loc AS SELECT DISTINCT area, h3_cell_to_lat(area)::FLOAT AS lat,
               h3_cell_to_lng(area)::FLOAT AS lon, h3_h3_to_string(area) AS area_id FROM base""")

feats = []
for Y in range(2020, 2028):
    cut = f"DATE '{Y - 1}-11-01'"
    con.execute(f"""
    CREATE OR REPLACE TABLE f{Y} AS
    WITH H AS (SELECT * FROM base WHERE month < {cut}),
    clim AS (
        SELECT area, m,
               AVG(y) AS clim_mean, MEDIAN(y) AS clim_median, MAX(y) AS clim_max, STDDEV_SAMP(y) AS clim_std,
               AVG((y > 0)::INT) AS clim_active_share, COUNT(*) AS clim_n_years,
               arg_max(y, month) AS last_same,
               AVG(x_modis) AS modis_clim_mean, AVG(frp_viirs) AS frp_clim_mean
        FROM H GROUP BY area, m),
    rec AS (
        SELECT area,
               SUM(y) FILTER (WHERE month >= ({cut} - INTERVAL 3 MONTH)) AS recent3,
               SUM(y) FILTER (WHERE month >= ({cut} - INTERVAL 12 MONTH)) AS last12,
               SUM(y) FILTER (WHERE m IN (8, 9, 10) AND yr < {Y - 1}) / {Y - 1 - 2018} AS clim3_prior,
               SUM(x_modis) / (SUM(y) + 1) AS modis_ratio
        FROM H GROUP BY area),
    fy AS (SELECT area, year(month + INTERVAL 2 MONTH) AS fy, SUM(y) AS tot FROM H GROUP BY 1, 2 HAVING fy >= 2019),
    tr AS (SELECT area, regr_slope(tot, fy) AS fy_slope, AVG(tot) FILTER (WHERE fy < {Y - 1}) AS fy_mean_prior
           FROM fy GROUP BY area),
    tgt AS (SELECT area, m, y AS target, nrt AS target_nrt FROM base WHERE yr = {Y})
    SELECT {Y}::SMALLINT AS year, c.area, l.area_id, c.m::TINYINT AS month, (c.m + 2)::TINYINT AS lead,
           SIN(2 * PI() * c.m / 12)::FLOAT AS month_sin, COS(2 * PI() * c.m / 12)::FLOAT AS month_cos,
           l.lat, l.lon,
           c.clim_mean::FLOAT AS clim_mean, c.clim_median::FLOAT AS clim_median, c.clim_max::FLOAT AS clim_max,
           c.clim_std::FLOAT AS clim_std, c.clim_active_share::FLOAT AS clim_active_share,
           c.clim_n_years::TINYINT AS clim_n_years, c.last_same::FLOAT AS last_same,
           r.recent3::FLOAT AS recent3, ((r.recent3 + 1) / (r.clim3_prior + 1))::FLOAT AS recent3_ratio,
           r.last12::FLOAT AS last12, ((r.last12 + 1) / (t.fy_mean_prior + 1))::FLOAT AS last12_ratio,
           t.fy_slope::FLOAT AS fy_slope,
           c.modis_clim_mean::FLOAT AS modis_clim_mean, r.modis_ratio::FLOAT AS modis_ratio,
           c.frp_clim_mean::FLOAT AS frp_clim_mean,
           g.target, g.target_nrt
    FROM clim c JOIN rec r USING (area) LEFT JOIN tr t USING (area) JOIN loc l USING (area)
    LEFT JOIN tgt g ON g.area = c.area AND g.m = c.m
    """)
    n, nt = con.execute(f"SELECT COUNT(*), COUNT(target) FROM f{Y}").fetchone()
    print(f"[{time.time() - t0:4.0f}s] target year {Y}: cut-off {Y - 1}-10-31, rows {n:,}, with known target {nt:,}", flush=True)
    feats.append(f"SELECT * FROM f{Y}")

con.execute(f"CREATE TABLE allf AS {' UNION ALL '.join(feats)}")
con.execute("""ALTER TABLE allf ADD COLUMN split VARCHAR;
UPDATE allf SET split = CASE WHEN year <= 2024 THEN 'train' WHEN year IN (2025, 2026) THEN 'test' ELSE 'predict' END""")
con.execute(f"COPY (SELECT * FROM allf WHERE year <= 2026 AND target IS NOT NULL) TO '{WORK / 'train_res4.parquet'}' (FORMAT parquet)")
con.execute(f"COPY (SELECT * EXCLUDE (target, target_nrt) FROM allf WHERE year = 2027) TO '{WORK / 'features_2027_res4.parquet'}' (FORMAT parquet)")

print("\nRows per split:")
print(con.execute("""SELECT split, MIN(year) AS from_year, MAX(year) AS to_year, COUNT(*) AS rows,
                     ROUND(100 * AVG((target = 0)::INT), 1) AS zero_target_pct, ROUND(AVG(target), 2) AS mean_target,
                     SUM(target_nrt) AS nrt_target_rows
                     FROM allf WHERE target IS NOT NULL OR split = 'predict' GROUP BY split ORDER BY from_year""").df().to_string(index=False))
print("\nMissing values per feature (all rows):")
cols = [c[0] for c in con.execute("DESCRIBE allf").fetchall() if c[0] not in ("year", "area", "area_id", "split")]
nulls = con.execute("SELECT " + ", ".join(f"ROUND(100 * AVG(({c} IS NULL)::INT), 1) AS {c}" for c in cols) + " FROM allf").df().T
print(nulls[nulls[0] > 0].rename(columns={0: "pct_missing"}).to_string())
print(f"\nfeature count: {len(cols) - 2} (+ target, target_nrt)   [{time.time() - t0:.0f}s]")
