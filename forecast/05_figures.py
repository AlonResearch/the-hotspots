from pathlib import Path

import duckdb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap, LogNorm

ROOT = Path(__file__).resolve().parents[1]
FIG = ROOT / "results" / "figures"
FIG.mkdir(parents=True, exist_ok=True)
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
INK, INK2, MUTED, GRID, AXIS, SURF, NEUTRAL = "#0b0b0b", "#52514e", "#898781", "#e1e0d9", "#c3c2b7", "#fcfcfb", "#b9b8b1"
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
plt.rcParams.update({"figure.facecolor": SURF, "axes.facecolor": SURF, "savefig.facecolor": SURF, "font.size": 10,
                     "axes.edgecolor": AXIS, "axes.labelcolor": INK2, "xtick.color": MUTED, "ytick.color": MUTED,
                     "text.color": INK, "axes.spines.top": False, "axes.spines.right": False, "axes.grid": True,
                     "grid.color": GRID, "grid.linewidth": 0.6, "axes.axisbelow": True, "lines.linewidth": 2,
                     "axes.titlesize": 12, "axes.titleweight": "bold", "axes.titlelocation": "left", "legend.frameon": False})


def save(fig, name):
    fig.tight_layout()
    fig.savefig(FIG / name, dpi=140)
    plt.close(fig)


con = duckdb.connect()
con.execute("SET memory_limit='4GB'; SET threads=8")

g = con.execute(f"""SELECT date_trunc('month', date)::DATE AS month, SUM((viirs_n > 0)::INT) AS viirs,
                    SUM((modis_n > 0)::INT) AS modis FROM read_parquet('{ROOT / 'data/datasets/FIRMS-2018-2026.parquet'}')
                    WHERE date < DATE '2026-11-01' GROUP BY 1 ORDER BY 1""").df()
g["month"] = pd.to_datetime(g.month)
fig, ax = plt.subplots(figsize=(10, 3.6))
ax.axvspan(pd.Timestamp("2026-08-01"), g.month.max(), color=GRID, alpha=0.7, lw=0)
ax.text(pd.Timestamp("2026-07-15"), 830, "NRT", color=MUTED, ha="right", va="top", fontsize=9)
ax.plot(g.month, g.viirs / 1e3, color=BLUE, label="VIIRS NOAA-20 (label)")
ax.plot(g.month, g.modis / 1e3, color=ORANGE, label="MODIS Terra + Aqua")
ax.text(g.month.iloc[-1], g.viirs.iloc[-1] / 1e3, "  VIIRS", color=INK2, va="center")
ax.text(g.month.iloc[-1], g.modis.iloc[-1] / 1e3, "  MODIS", color=INK2, va="center")
ax.set_ylim(0, 850); ax.set_xlim(g.month.min(), pd.Timestamp("2027-04-01"))
ax.set_ylabel("active cell-days per month (thousands)")
ax.set_title("Vegetation-fire activity repeats every year: peak in August, minimum in May")
ax.legend(loc="upper left", ncol=2)
save(fig, "fig1_global_monthly.png")

yrs = list(range(2018, 2027))
terra = [10.71, 10.75, 10.77, 10.75, 10.50, 10.31, 10.06, 9.68, 9.70]
aqua = [13.55, 13.52, 13.52, 13.51, 13.61, 13.77, 14.14, 14.67, 15.32]
ratio = [0.365, 0.353, 0.341, 0.347, 0.337, 0.358, 0.355, 0.334, 0.303]
fig, (a1, a2) = plt.subplots(1, 2, figsize=(10, 3.4))
a1.plot(yrs, aqua, color=BLUE, marker="o", ms=5, label="Aqua")
a1.plot(yrs, terra, color=ORANGE, marker="o", ms=5, label="Terra")
a1.text(2026.15, aqua[-1], "Aqua 15:19", color=INK2, va="center"); a1.text(2026.15, terra[-1], "Terra 09:42", color=INK2, va="center")
a1.set_xlim(2017.7, 2027.9); a1.set_yticks([9, 10, 11, 12, 13, 14, 15, 16]); a1.set_yticklabels([f"{h}:00" for h in range(9, 17)])
a1.set_ylabel("mean local overpass time (daytime)"); a1.set_title("MODIS satellites drift from their orbits"); a1.legend(loc="center left")
a2.plot(yrs, ratio, color=BLUE, marker="o", ms=5)
a2.set_ylim(0.25, 0.40); a2.set_ylabel("MODIS / VIIRS active cell-days"); a2.set_title("…so MODIS sees a shrinking share of fires")
a2.text(2026, 0.303, " 0.30", color=INK2, va="center"); a2.text(2018, 0.372, "0.37", color=INK2, ha="center")
a2.set_xlim(2017.7, 2026.9)
save(fig, "fig2_modis_drift.png")

import json
M = json.load(open(ROOT / "results" / "metrics.json"))["test"]
order = ["always 0", "same month last year", "climatology mean", "climatology median", "LightGBM median (p50)"]
names = ["Always 0", "Same month last year", "Climatology mean", "Climatology median", "LightGBM median (ours)"]
fig, axes = plt.subplots(1, 2, figsize=(10, 3.2), sharey=True)
for ax, key, ttl in zip(axes, ["2025 (full year)", "2026 Jan-Oct"], ["Test year 2025 (12 months)", "Test year 2026 (Jan–Oct)"]):
    v = [M[key][k]["MAE"] for k in order]
    bars = ax.barh(names[::-1], v[::-1], color=[BLUE] + [NEUTRAL] * 4, height=0.62)
    for b, x in zip(bars, v[::-1]):
        ax.text(x + 0.08, b.get_y() + b.get_height() / 2, f"{x:.2f}", va="center", color=INK)
    ax.set_xlim(0, 8.4); ax.set_title(ttl); ax.set_xlabel("mean absolute error (active cell-days, lower is better)")
    ax.grid(axis="y", visible=False); ax.tick_params(axis="y", colors=INK2)
save(fig, "fig3_test_mae.png")

t = pd.read_parquet(ROOT / "results" / "test_predictions_res4.parquet")
s = t.groupby(["year", "month"])[["target", "clim_mean"]].sum().reset_index()
s["x"] = pd.to_datetime(dict(year=s.year, month=s.month, day=1))
fig, ax = plt.subplots(figsize=(10, 3.4))
ax.plot(s.x, s.target / 1e3, color=BLUE, marker="o", ms=4, label="Observed")
ax.plot(s.x, s.clim_mean / 1e3, color=ORANGE, marker="o", ms=4, label="Forecast (made 31 Oct of the year before)")
ax.text(s.x.iloc[-1], s.target.iloc[-1] / 1e3, "  Observed", color=INK2, va="center")
ax.text(s.x.iloc[-1], s.clim_mean.iloc[-1] / 1e3 - 25, "  Forecast", color=INK2, va="center")
ax.set_ylim(0, 850); ax.set_xlim(s.x.min() - pd.Timedelta(days=20), pd.Timestamp("2027-02-01"))
ax.set_ylabel("active cell-days (thousands)"); ax.legend(loc="lower left", ncol=2)
err25 = 100 * np.mean(np.abs(s.clim_mean / s.target - 1)[s.year == 2025]); err26 = 100 * np.mean(np.abs(s.clim_mean / s.target - 1)[s.year == 2026])
ax.set_title(f"Held-out years: global monthly totals, average error {err25:.0f} % (2025) and {err26:.0f} % (2026)")
save(fig, "fig4_test_global.png")

f = pd.read_parquet(ROOT / "results" / "forecast_2027_res4.parquet")
h = con.execute(f"""SELECT year(month) AS yr, month(month) AS m, SUM(y) AS y FROM read_parquet('{ROOT / 'data/work/monthly_res4.parquet'}')
                    WHERE year(month) BETWEEN 2019 AND 2025 GROUP BY 1, 2""").df().pivot(index="m", columns="yr", values="y") / 1e3
o = f.groupby("month")["clim_mean"].sum() / 1e3
fig, ax = plt.subplots(figsize=(10, 3.6))
ax.fill_between(range(1, 13), h.min(axis=1), h.max(axis=1), color=BLUE, alpha=0.18, lw=0, label="Observed range 2019–2025")
ax.plot(range(1, 13), o.values, color=BLUE, marker="o", ms=5, label="2027 forecast")
for m, v in o.items():
    ax.text(m, v + 22, f"{v:.0f}", ha="center", color=INK, fontsize=9)
ax.set_xticks(range(1, 13)); ax.set_xticklabels(MONTHS); ax.set_ylim(0, 900)
ax.set_ylabel("active cell-days (thousands)"); ax.legend(loc="lower right")
ax.set_title(f"2027 outlook, world total: {o.sum() / 1e3:.2f} million active cell-days")
save(fig, "fig5_outlook_2027.png")

a = f.groupby(["area_id", "lat", "lon"], as_index=False)["pred_p50"].sum()
quiet, act = a[a.pred_p50 < 1], a[a.pred_p50 >= 1].sort_values("pred_p50")
cmap = LinearSegmentedColormap.from_list("blue", ["#86b6ef", "#3987e5", "#1c5cab", "#0d366b"])
fig, ax = plt.subplots(figsize=(10, 4.6))
ax.scatter(quiet.lon, quiet.lat, s=0.6, color=GRID, lw=0)
sc = ax.scatter(act.lon, act.lat, s=1.6, c=act.pred_p50, cmap=cmap, norm=LogNorm(1, 1000), lw=0)
cb = fig.colorbar(sc, ax=ax, fraction=0.025, pad=0.01); cb.set_label("forecast active cell-days in 2027 (per ~1,770 km² area)"); cb.outline.set_visible(False)
ax.set_xlim(-180, 180); ax.set_ylim(-58, 78); ax.set_aspect(1.25); ax.grid(False)
ax.set_xlabel("longitude"); ax.set_ylabel("latitude")
ax.set_title(f"Where burning is expected in 2027 ({len(act):,} areas active, {len(quiet):,} quiet)")
save(fig, "fig6_map_2027.png")

print("2027 world total per month (thousand cell-days):", {MONTHS[m - 1]: round(v) for m, v in o.items()})
print(f"2027 world total: {o.sum() * 1e3:,.0f}   history 2019-2025 yearly totals: {(h.sum() * 1e3).round(0).to_dict()}")
band = pd.cut(f.lat.abs(), [0, 23.5, 45, 90], labels=["tropics", "mid", "high"], include_lowest=True)
print("share of 2027 total by latitude band:", (100 * f.groupby(band, observed=True).clim_mean.sum() / f.clim_mean.sum()).round(1).to_dict())
print(f"areas with forecast >= 1 cell-day in 2027: {len(act):,} of {len(a):,}")
pm = f.groupby("month").apply(lambda d: (d.pred_p50 >= 0.5).sum(), include_groups=False)
print("areas expected active per month (p50 >= 0.5):", {MONTHS[m - 1]: int(v) for m, v in pm.items()})
p = f[(f.lat.between(44.0, 46.5)) & (f.lon.between(6.6, 9.2))]
print(f"\nPiedmont box (lat 44.0-46.5, lon 6.6-9.2): {p.area_id.nunique()} res-4 areas")
print(p.groupby("month")[["pred_p10", "pred_p50", "pred_p90", "clim_mean"]].sum().round(1).T.to_string())
top = f.assign(box=(np.floor(f.lat / 10) * 10).astype(int).astype(str) + "," + (np.floor(f.lon / 10) * 10).astype(int).astype(str)) \
       .groupby("box").clim_mean.sum().sort_values(ascending=False).head(6)
print("\ntop 10x10 deg boxes (lat,lon of SW corner), 2027 total thousand cell-days:", (top / 1e3).round(0).to_dict())
