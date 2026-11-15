# The Hotspots web app (map and historical view)

The local MVP of the map and the History view, built from `Vision Docs/MVP Implementation Plan.md`.
It is a static site: the data build writes JSON files, the app reads them. There is no backend.

It runs on either of two data folders in the same file contract (version 1): the **real build**
from `pipeline/` (FIRMS 2000-11 to 2026-11, see "Switch between fixtures and real data"), or
**fixtures**: simulated fires in six synthetic regions from a deterministic generator, used by the
tests. The app shows a "Fixture data" badge on fixtures. The extreme months in the fixtures are
synthetic test events, not real fires.

## Run

Node 22.12 or newer (tested with Node 24).

```text
cd web
npm ci
npm run fixtures      # writes public/data (about 26 MB, about 20 s), then checks it
npm run dev           # http://127.0.0.1:5288
```

`npm run build` writes a static site to `dist/` (type check first). `npm run preview` serves it
on http://127.0.0.1:5289.

## Test

```text
npm run test          # Vitest unit tests (math, contract, grid, URL, CSV, basemap choice)
npm run lint          # ESLint, Prettier check and TypeScript
npx playwright install chromium webkit   # once
npm run e2e           # Playwright UI checks, plan section 12.2 (needs the fixtures)
npm run validate-data # checks public/data, or a folder given after --
```

The UI checks start their own dev server on port 5290 with the bundled basemap
(`VITE_BASEMAP=local`) and use a test hook (`window.__hotspots`: drawn resolution, drawn cell
count, place cells) that exists only in development builds, because WebGL content cannot be read
from the page.

## Phones

Every feature works by touch on a phone (plan 8.9). Under 768 px the panel becomes a bottom sheet
(peek, half, full, from its handle), the strip docks at the bottom, and the strip options (Raw /
Harmonized, seam check) open from the button next to Play. A swipe on a list, the panel, the
calendar or the strip only scrolls; items act on a tap. The legend folds away.

`tests/e2e/mobile.spec.ts` checks this with real touch gestures in Chromium and in WebKit
(Safari's engine) at 375 x 667, 320 x 568 and landscape 667 x 375. Run the WebKit part with
`npx playwright install webkit` once, then `npm run e2e`. The swipe checks run in Chromium only,
because they send touch input through the Chrome DevTools Protocol.

To try it on a real phone on the same network: `npx vite --host 0.0.0.0` and open the printed
network address. Real devices have not been tried yet.

## Design

The design direction (audience, tone, colour, type, layout, motion) is in [DESIGN.md](DESIGN.md).
Colours, sizes and motion are tokens in `src/styles/tokens.css`, with a typed copy in
`src/styles/tokens.ts` for the map layers and SVG charts. Change both together. The colour breaks
of the cell layer come from `manifest.color.density_breaks`, not from the tokens.

## Switch between fixtures and real data

The two data sets live side by side under `public/` (both git-ignored):

| Folder         | Written by                                       | Run the app with                    |
| -------------- | ------------------------------------------------ | ----------------------------------- |
| `public/data`  | `npm run fixtures`                               | `npm run dev` (default)             |
| `public/firms` | `pipeline/publish.py` (see `pipeline/README.md`) | `VITE_DATA_BASE=/firms npm run dev` |

On Windows PowerShell: `$env:VITE_DATA_BASE='/firms'; npm run dev` (and
`Remove-Item Env:VITE_DATA_BASE` to go back). In Git Bash, prefix `MSYS_NO_PATHCONV=1`: without it
Git Bash turns `/firms` into `C:/Program Files/Git/firms` and the app cannot find the manifest. The tests (`npm run test`, `npm run e2e`) always use
the fixtures in `public/data`, so keep `npm run fixtures` run once.

1. Build the real data: from the repository root, `python pipeline/build.py --data-root <folder
with raw/>`. It ends with the contract check.
2. Check any folder yourself: `npm run validate-data -- public/firms`. It checks every file
   against its schema and the cross-file rules (overview equals the detail sums, the world summary
   equals the res 3 sums, `h = lo = hi = viirs` from the first reference month). On the real build
   it reads 36,000 files and takes several minutes.
3. Start the app with `VITE_DATA_BASE=/firms`.

The real build is about 2.6 GB, so `npm run build` copies it into `dist/` too. Move `public/firms`
out of `public/` before a deploy build that should not carry it.

No code changes are needed. The "Fixture data" badge disappears when `manifest.json` says
`"source": "firms"`. Every method choice the app depends on (baseline years, class percentiles,
the zoom ladder, colour breaks, partial months, status ranges, seams, known issues) is read from
`manifest.json`.

## Forecast (outlook)

The app shows a forecast for the months after the record when the data folder has a `forecast/`
folder. Without it nothing about a forecast is shown.

| File                               | Content                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| `forecast/manifest.json`           | Months, world totals, the model, its test results            |
| `forecast/map/r{3,4}/YYYY-MM.json` | Median forecast per cell, for the map                        |
| `forecast/r4/<res 1 parent>.json`  | 10%, 50% and 90% values per res 4 area and month, for places |

- **Fixtures** write a stand-in (quantiles of the simulated 2012 to 2025 values per res 4 area). It
  is not a forecast.
- **Real forecast**: the prediction model is in `forecast/` at the repository root (see `Prediction.md`).
  It writes `results/forecast_2027_res4.csv` and `results/metrics.json`. Import that output (one row
  per res 4 area and month) into the real build:

  ```text
  npm run import-forecast -- --csv <path>/results/forecast_2027_res4.csv --metrics <path>/results/metrics.json
  ```

  It writes `public/firms/forecast` (485 files, 17 MB for 2027; `--out` picks another data folder).

What the app does with it:

- **Time strip**: the forecast months follow "now" as greyed, see-through bars in a dashed frame.
  The button next to the place name ("2027 forecast") makes the forecast year the whole strip, one
  wide bar per month; press it again for the whole record. Right arrow from the last month of the
  record enters the forecast.
- **Calendar**: a new row for the forecast year, greyed with dashed edges.
- **Map**: while a forecast month is selected, the map shows the forecast at res 4 (res 3 when
  zoomed out), greyed and see-through. The model forecasts res 4 areas, so the map does not go
  finer.
- **Simple mode**: a sentence ("About 12 active cell-days expected, about the usual for August"),
  the likely range and the usual value. **Scientific mode** adds the 10% to 90% range on the strip
  and chart, a table by month, the model, the held-out test results and a forecast CSV.
- **A place inside part of a res 4 area** takes the share of the area's activity it had in the same
  calendar month of the baseline years (`src/stats/forecast.ts`). Parts of an area add up to the
  area forecast. This is an app-side rule.
- The selected forecast month is in the URL as `outlook=YYYY-MM`. The record month stays in
  `month=`.

## Deploy (static host)

The real build is 2.78 GB in 47,789 files (detail 1.63 GB in 13,184 files, overview 1.13 GB in
34,117 files of which r5 is 794 MB in 33,491 files, forecast 17 MB in 485 files; largest file
1.5 MB). Cloudflare Pages takes at most 20,000 files per site on the free plan (25 MiB per file),
so the deploy copy leaves out `overview/r5`:

```text
cd web
npm ci
npm run build-deploy -- --data <real build folder>     # writes deploy/site
npx vite preview --outDir deploy/site                  # check it on http://127.0.0.1:5289
npx wrangler login                                     # opens the browser, free Cloudflare account
npx wrangler pages project create the-hotspots --production-branch main   # once
npx wrangler pages deploy deploy/site --project-name the-hotspots --branch main
```

`build-deploy` (`scripts/build-deploy.ts`) builds the app into `deploy/site`, copies `public/`
without the data folders, copies the data folder (it only reads it) to `deploy/site/data`, writes
`_headers` and `404.html`, and checks the Cloudflare Pages limits. In the copied `manifest.json`
the ladder goes from res 4 straight to res 6 and `overview.r5_parts` is empty, so the app never
asks for r5. What the site loses: between zoom 6 and 8.5 the map shows res 4 cells (about 40 km
across) instead of res 5. Res 6 starts at zoom 8.5 instead of 7.5 (`--detail-zoom`), because at
zoom 7.5 a large screen over a fire-dense region can need more than the 60 detail tiles the map
loads at once, and without r5 that view would be empty. Place history, daily views and the
forecast are unchanged.

Other options of the script:

- `--keep-r5`: copy everything (47,800 files). Too many for Cloudflare Pages; works on a host
  without a file count limit, for example Netlify (`npx netlify deploy --prod --dir deploy/site`).
  `_headers` and `404.html` use the same syntax there.
- `--data-base <url>`: build the app for data served from another origin (for example a public
  Cloudflare R2 bucket holding the whole build, with a CORS rule that allows the site). No data is
  copied.

### GitHub Pages (the submitted site)

GitHub Pages takes at most 1 GB per site, so this build has the whole world at the coarse map
levels and full detail only for Italy:

```text
cd web
MSYS_NO_PATHCONV=1 npx tsx scripts/build-deploy.ts --data <real build folder> --out deploy/gh-pages \
  --clip 6.6,35.4,18.6,47.1 --base /the-hotspots/ --view 6/42.5/12.5 --readme scripts/demo-README.md
```

(`MSYS_NO_PATHCONV=1` only in Git Bash, which would otherwise rewrite `/the-hotspots/`.)

- `--clip` (`scripts/clip-data.ts`): copied whole are the manifest, method, world summary, overview
  r3 and r4 and the forecast. Overview r5 is kept for the res 0 parts that reach the box, and detail
  tiles (res 6, place history and daily views) for the res 3 cells that reach it. The copied
  manifest and detail index list only those files. On the real build: 94 detail tiles, 3 r5 parts,
  2,183 files, 0.40 GB.
- Outside Italy: the map shows res 3 and 4 cells everywhere and res 5 around Italy (Europe and the
  Mediterranean). Closer in, the legend says "Detail is not available here in this build". A place
  outside Italy shows "History is not available for this area in this build"; the strip shows the
  world. The world totals and the 2027 forecast map work everywhere.
- `--base /the-hotspots/` serves the app from `https://alonresearch.github.io/the-hotspots/`;
  `--view` sets the map view for links without one. The folder gets `.nojekyll`.
- Check it: `HOTSPOTS_BASE=/the-hotspots/ npx vite preview --outDir deploy/gh-pages` and open
  `http://127.0.0.1:5289/the-hotspots/`.
- Publish: the folder is pushed as an orphan `gh-pages` branch (its own history, no source), and
  Pages is set to that branch, path `/`. To redeploy, rerun the build command (Vite keeps the
  folder's `.git`), then:

  ```text
  cd deploy/gh-pages
  git add -A && git commit -m "Rebuild" && git push https://github.com/AlonResearch/the-hotspots.git gh-pages
  ```

  Pages rebuilds in about a minute.

## Next 12 months

The Next 12 months section lists the place's forecast month by month, with the month of most
expected activity (`src/panel/sections/OutlookSection.tsx`). A tap shows that month on the strip,
calendar and map. For the four demo places below it adds one line, marked "Demo". Without forecast
files it says so.

## Why and What to do (demo)

The "Why" and "What to do" panel sections are a demo of how the Insight Engine should work
(`Vision Docs/Insight Engine.md`). They have content for Turin, Milan, Monte Barone and Foggia and
are marked "Demo". The rules are in `src/insight/demo.ts`. No driver data (weather, soil moisture,
vegetation) and no model is behind them. The four places are in the search list.

## Settings

| Variable            | Default | Effect                                                                              |
| ------------------- | ------- | ----------------------------------------------------------------------------------- |
| `VITE_DATA_BASE`    | `/data` | Where the data files are served                                                     |
| `VITE_BASEMAP`      | online  | `local` forces the bundled Natural Earth basemap                                    |
| `VITE_SHOW_PLANNED` | off     | `1` shows panel sections with status `planned` as dashed outlines (none at present) |

The forecast is read from `<VITE_DATA_BASE>/forecast`.

The map style (Detailed or Quiet, in the More menu) is a viewer preference kept in the browser
(`localStorage`, key `hotspots.mapStyle`), not in the URL. It only changes the online basemap.

## Daily views

Daily views exist only where the build has the optional daily fields (Piemonte in the real build, a small west-Piemonte box in the fixtures). Controls are hidden elsewhere, classes stay monthly, and days are UTC. In the History section, the daily curve shows a running total or a 5-day sum with a day picker. On the map, "Day by day" steps or plays through the month day by day.

## Where things are

| Folder           | Content                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `src/data`       | Contract schemas (zod), month helpers, loader with caches, typed detail tiles, validator, forecast |
| `src/stats`      | Place sums, baseline, classes, wording, typical and unusual months, contributions, seam check, CSV |
| `src/grid`       | Zoom ladder, place resolution, overlap fill, areas and directions                                  |
| `src/state`      | Store, URL hash, place loading, contributions                                                      |
| `src/map`        | Map stage, basemap, cell layer, legend, drawing, outlines                                          |
| `src/panel`      | Place panel, slot registry, History section                                                        |
| `src/strip`      | Time strip and play                                                                                |
| `src/styles`     | Design tokens, base and layout styles                                                              |
| `scripts`        | `make-fixtures.ts`, `validate-data.ts`, `import-forecast.ts`, `forecast-files.ts`                  |
| `public/basemap` | Natural Earth 1:50m land, borders and lakes (public domain)                                        |

Panel sections plug in through `src/panel/registry.ts` (status `live`, `demo` or `planned`, and a
component). Next 12 months and History are live; Why and What to do are demo. The forecast is shown inside the History section and on the strip; the
strip takes its future months from the forecast files.

## Known limits of this build

- The fixture notes below are about `public/data`. The real build (`public/firms`) has res 6
  detail and place history for the whole world (decision D8).
- The Langhe and Susa Valley presets have no activity in the fixture record (Piemonte is the
  zero-heavy region), so they show the empty-record sentence.
- The plan's fixture detection rates give an expected raw seam step of 0.90 / 0.61 = 1.48, under
  the plan's own check of 1.5. The generator keeps both and uses seed 1, where the simulated
  activity rises a little across 2012 and the check passes.
- MapLibre is pinned to 5.x: deck.gl 9.4 does not work with MapLibre 6 in interleaved mode.
- Calendar cells are 30 px high on phones but about 20 to 24 px wide (12 columns on a narrow
  screen). Each month can also be chosen on the strip and in the unusual months list, with full
  size targets.
