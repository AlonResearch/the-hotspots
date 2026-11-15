import time
from pathlib import Path

import duckdb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
FIRMS = ROOT / "data" / "datasets" / "FIRMS-2018-2026.parquet"
STAGE = ROOT / "data" / "work" / "stage1_cell_day_sensor.parquet"
WORK = ROOT / "data" / "work"
FIG = ROOT / "results" / "figures"
FIG.mkdir(parents=True, exist_ok=True)

con = duckdb.connect()
con.execute(f"SET memory_limit='5GB'; SET threads=12; SET temp_directory='{WORK / 'duckdb_tmp'}'")
con.execute("LOAD h3")
t0 = time.time()
q = lambda sql: con.execute(sql).df()


def section(title):
    print(f"\n=== {title}  [{time.time() - t0:.0f}s]", flush=True)


section("0. Merge check: MODIS archive vegetation detections, source CSV vs stage-1")
src = con.execute(f"""SELECT COUNT(*) FROM read_csv('{ROOT / 'data/datasets/MODIS-2018-2026.csv'}', header=true,
    columns={{'latitude':'DOUBLE','longitude':'DOUBLE','brightness':'DOUBLE','scan':'DOUBLE','track':'DOUBLE',
    'acq_date':'DATE','acq_time':'VARCHAR','satellite':'VARCHAR','instrument':'VARCHAR','confidence':'VARCHAR',
    'version':'VARCHAR','bright_t31':'DOUBLE','frp':'DOUBLE','daynight':'VARCHAR','type':'VARCHAR'}})
    WHERE TRY_CAST(confidence AS INTEGER) >= 30 AND type = '0'""").fetchone()[0]
stg = con.execute(f"SELECT SUM(n) FROM read_parquet('{STAGE}') WHERE sensor='MODIS' AND cls='veg'").fetchone()[0]
res = con.execute(f"SELECT MIN(h3_get_resolution(h3_string_to_h3(cell))), MAX(h3_get_resolution(h3_string_to_h3(cell))), "
                  f"COUNT(*) - COUNT(DISTINCT (cell, date)) FROM read_parquet('{FIRMS}')").fetchone()
print(f"source CSV = {src:,}   stage-1 = {stg:,}   {'MATCH' if src == stg else 'MISMATCH'}")
print(f"H3 resolution of all cells: {res[0]}..{res[1]}   duplicate (cell, date) rows: {res[2]}")

section("1. Global active cell-days per month (sum over all res-6 cells)")
g = q(f"""SELECT date_trunc('month', date)::DATE AS month, SUM((viirs_n > 0)::INT) AS viirs, SUM((modis_n > 0)::INT) AS modis,
          MAX(is_nrt) AS nrt FROM read_parquet('{FIRMS}') GROUP BY 1 ORDER BY 1""")
g["year"], g["mon"] = g.month.dt.year if hasattr(g.month, "dt") else None, None
g["month"] = g["month"].astype("datetime64[ns]")
g["year"], g["mon"] = g.month.dt.year, g.month.dt.month
print("VIIRS active cell-days, thousands (rows = year, cols = month):")
print((g.pivot(index="year", columns="mon", values="viirs") / 1000).round(0).to_string())
yr = g[(g.month >= "2018-04-01")].groupby("year")[["viirs", "modis"]].sum()
yr["modis/viirs"] = (yr.modis / yr.viirs).round(3)
print("\nYearly totals (2018 from Apr, 2026 to Nov 13):")
print(yr.to_string())
print(f"\nCorrelation of monthly global series VIIRS vs MODIS: {g.viirs.corr(g.modis):.3f}")

fig, ax = plt.subplots(figsize=(11, 4))
ax.plot(g.month, g.viirs / 1e3, label="VIIRS NOAA-20 (label)", color="#c0392b")
ax.plot(g.month, g.modis / 1e3, label="MODIS Terra+Aqua", color="#2c7fb8")
ax.axvspan(g.month[g.nrt == 1].min(), g.month.max(), color="grey", alpha=0.15, label="NRT (provisional)")
ax.set_ylabel("active cell-days per month (thousands)")
ax.set_title("Global vegetation-fire activity, H3 res-6 cell-days")
ax.legend()
fig.tight_layout()
fig.savefig(FIG / "01_global_monthly.png", dpi=130)

for r in (4, 5):
    section(f"2. Label at H3 res {r}")
    con.execute(f"""CREATE OR REPLACE TABLE m AS
        SELECT h3_cell_to_parent(h3_string_to_h3(cell), {r}) AS area, date_trunc('month', date)::DATE AS month,
               SUM((viirs_n > 0)::INT)::INT AS y, SUM((modis_n > 0)::INT)::INT AS x_modis,
               SUM(viirs_frp)::FLOAT AS frp_viirs, SUM(modis_frp)::FLOAT AS frp_modis, MAX(is_nrt)::TINYINT AS nrt
        FROM read_parquet('{FIRMS}') WHERE date < DATE '2026-11-01' GROUP BY 1, 2""")
    con.execute("""CREATE OR REPLACE TABLE grid AS
        WITH areas AS (SELECT DISTINCT area FROM m),
             months AS (SELECT range::DATE AS month FROM range(DATE '2018-04-01', DATE '2026-11-01', INTERVAL 1 MONTH))
        SELECT a.area, mo.month, COALESCE(m.y, 0) AS y, COALESCE(m.x_modis, 0) AS x_modis,
               COALESCE(m.frp_viirs, 0) AS frp_viirs, COALESCE(m.frp_modis, 0) AS frp_modis,
               COALESCE(m.nrt, (mo.month >= DATE '2026-08-01')::TINYINT) AS nrt
        FROM areas a CROSS JOIN months mo LEFT JOIN m USING (area, month)""")
    con.execute(f"COPY grid TO '{WORK / f'monthly_res{r}.parquet'}' (FORMAT parquet)")
    print(q("""SELECT COUNT(DISTINCT area) AS areas, COUNT(DISTINCT month) AS months, COUNT(*) AS rows,
                 ROUND(100 * AVG((y = 0)::INT), 1) AS zero_pct,
                 ROUND(AVG(y) FILTER (WHERE y > 0), 1) AS mean_if_active,
                 QUANTILE_CONT(y, 0.5) FILTER (WHERE y > 0) AS median_if_active,
                 QUANTILE_CONT(y, 0.9) FILTER (WHERE y > 0) AS p90_if_active, MAX(y) AS max
               FROM grid""").to_string(index=False))

    con.execute("""CREATE OR REPLACE TABLE w AS SELECT area, month(month) AS mon,
        SUM(y) FILTER (WHERE year(month) = 2025) AS y25, SUM(y) FILTER (WHERE year(month) = 2024) AS y24,
        AVG(y) FILTER (WHERE year(month) BETWEEN 2019 AND 2024) AS clim_mean,
        MEDIAN(y) FILTER (WHERE year(month) BETWEEN 2019 AND 2024) AS clim_med
        FROM grid GROUP BY 1, 2""")
    print("Predicting 2025 from earlier years only (MAE in cell-days; corr on log(1+y)):")
    print(q("""SELECT ROUND(AVG(ABS(y25)), 3) AS mae_always_zero, ROUND(AVG(ABS(y25 - y24)), 3) AS mae_last_year,
                 ROUND(AVG(ABS(y25 - clim_mean)), 3) AS mae_clim_mean, ROUND(AVG(ABS(y25 - clim_med)), 3) AS mae_clim_median,
                 ROUND(CORR(LN(1 + y25), LN(1 + y24)), 3) AS corr_last_year, ROUND(CORR(LN(1 + y25), LN(1 + clim_mean)), 3) AS corr_clim
               FROM w""").to_string(index=False))
    print(q("""WITH s AS (SELECT area, month(month) AS mon, LN(1 + y) AS ly FROM grid WHERE month < DATE '2026-01-01'),
                 c AS (SELECT ly, AVG(ly) OVER (PARTITION BY area, mon) AS cm, AVG(ly) OVER () AS gm FROM s)
               SELECT ROUND(1 - SUM((ly - cm) ^ 2) / SUM((ly - gm) ^ 2), 3) AS share_var_place_x_season,
                      ROUND(SUM((ly - cm) ^ 2) / SUM((ly - gm) ^ 2), 3) AS share_var_year_to_year
               FROM c""").to_string(index=False))

section("done")
