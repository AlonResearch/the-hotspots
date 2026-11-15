"""Figure 1 of Whitepaper.md: yearly world totals of the raw record (MODIS, then VIIRS), MODIS alone and the harmonized score.

Reads web/public/firms/summary/global.json (published by pipeline/publish.py).
Writes assets/whitepaper_fig1_series.png.

Usage: python scripts/whitepaper_figure.py
"""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "web/public/firms/summary/global.json"
OUT = ROOT / "assets/whitepaper_fig1_series.png"

SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e1e0d9"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"


def yearly(values, start_year, start_month, years):
    out = []
    for y in years:
        t0 = (y - start_year) * 12 + (1 - start_month)
        out.append(sum(values[t0 : t0 + 12]) / 1e6)
    return out


def main() -> None:
    g = json.loads(SRC.read_text(encoding="utf-8"))
    sy, sm = int(g["start"][:4]), int(g["start"][5:7])
    years = list(range(2001, 2026))
    h, lo, hi = (yearly(g[k], sy, sm, years) for k in ("h", "lo", "hi"))
    ref = (2012 - sy) * 12 + (2 - sm)  # first observed VIIRS month, 2012-02
    stitched_m = [m if t < ref else v for t, (m, v) in enumerate(zip(g["modis"], g["viirs"]))]
    stitched = yearly(stitched_m, sy, sm, years)
    modis = yearly(g["modis"], sy, sm, years)

    fig, ax = plt.subplots(figsize=(9, 4.6), dpi=150)
    fig.patch.set_facecolor(SURFACE)
    ax.set_facecolor(SURFACE)
    ax.fill_between(years, lo, hi, color=BLUE, alpha=0.18, linewidth=0)
    ax.plot(years, stitched, color=ORANGE, linewidth=4.5)
    ax.plot(years, h, color=BLUE, linewidth=2)
    ax.plot(years, modis, color=AQUA, linewidth=2, linestyle=(0, (4, 2)))
    ax.axvline(2012, color=INK2, linewidth=1, linestyle=":")
    ax.text(2012.15, max(hi) * 1.02, "VIIRS starts (2012)", color=INK2, fontsize=8, va="bottom")

    ax.text(2001.2, max(hi) * 1.04, "Harmonized score (shaded: band of estimated years)", color=INK, fontsize=9)
    ax.text(2001.2, stitched[4] + 0.35, "Raw record as usually shown: MODIS, then VIIRS", color=INK, fontsize=9)
    ax.text(2016.2, h[-1] - 0.85, "From 2012 both are observed VIIRS and coincide", color=INK2, fontsize=8)
    ax.text(2013.2, modis[13] - 0.75, "MODIS alone (Terra or Aqua)", color=INK, fontsize=9)

    ax.set_xlim(2000.5, 2025.5)
    ax.set_ylim(0, max(hi) * 1.1)
    ax.set_ylabel("Million active cell-days per year", color=INK2, fontsize=9)
    ax.grid(axis="y", color=GRID, linewidth=0.6)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=8, length=0)
    ax.set_title("World, 2001 to 2025: the raw record jumps in 2012, the harmonized score does not",
                 loc="left", color=INK, fontsize=10)
    fig.tight_layout()
    fig.savefig(OUT, facecolor=SURFACE)
    print(f"wrote {OUT}")
    print("year h lo hi stitched modis")
    for row in zip(years, h, lo, hi, stitched, modis):
        print(*[round(x, 2) if isinstance(x, float) else x for x in row])


if __name__ == "__main__":
    main()
