/**
 * Assembles a static deploy folder (app + data) for a free static host.
 *
 * Usage: npm run build-deploy -- [--data <data folder>] [--out <folder>] [--keep-r5]
 *                                [--detail-zoom <z>] [--data-base <url>]
 *
 *   --data         data folder to copy (default public/firms). It is only read, never changed.
 *   --out          deploy folder (default deploy/site). It is emptied first.
 *   --keep-r5      keep overview/r5 (33,491 files on the real build). Without it the copy drops
 *                  r5 and its manifest goes from res 4 straight to res 6, so the whole site fits
 *                  under the 20,000 file limit of Cloudflare Pages.
 *   --detail-zoom  min zoom of res 6 when r5 is dropped (default 8.5, see web/README.md "Deploy").
 *   --data-base    data served from another origin (for example an R2 bucket). The app is built
 *                  with VITE_DATA_BASE set to it and no data is copied.
 *   --clip         w,s,e,n: fine detail (r5, res 6 tiles) only for this lon/lat box, the rest of the
 *                  world at res 3 and 4 (see scripts/clip-data.ts).
 *                  Keeps r5 and the ladder as built. Example for Italy: 6.6,35.4,18.6,47.1
 *   --base         sub-path the site is served from, for example /the-hotspots/ on GitHub
 *                  Pages. Sets the Vite base and the data URL.
 *   --view         default map view z/lat/lon when the link has none, for example 6/42.5/12.5.
 *   --readme       file copied to README.md in the deploy folder.
 *
 * Writes `_headers`, `404.html` and `.nojekyll` (Cloudflare Pages, Netlify, GitHub Pages), then
 * checks the file count and file sizes against the Cloudflare Pages and GitHub Pages limits.
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { clipData, type Box } from './clip-data';

const PAGES_MAX_FILES = 20_000;
const PAGES_MAX_FILE_BYTES = 25 * 1024 * 1024;
const GITHUB_MAX_SITE_BYTES = 1e9;
const GITHUB_MAX_FILE_BYTES = 50 * 1024 * 1024;
/** public/ entries that are data folders, never shipped through the Vite public copy. */
const DATA_DIRS = /^(data|firms)(\..*)?$/;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function fail(msg: string): never {
  console.error(`build-deploy: ${msg}`);
  process.exit(1);
}

const webRoot = resolve(import.meta.dirname, '..');
const out = resolve(webRoot, arg('out') ?? 'deploy/site');
const dataBase = arg('data-base');
const clipArg = arg('clip');
const clip = clipArg ? (clipArg.split(',').map(Number) as Box) : null;
if (clip && (clip.length !== 4 || !clip.every(Number.isFinite))) fail('--clip must be w,s,e,n');
const keepR5 = flag('keep-r5') || clip !== null;
const base = arg('base') ?? '/';
if (!base.startsWith('/') || !base.endsWith('/')) fail('--base must start and end with /');
const view = arg('view');
const readme = arg('readme');
const detailZoom = Number(arg('detail-zoom') ?? '8.5');
if (!Number.isFinite(detailZoom)) fail('--detail-zoom must be a number');

const dataSrc = dataBase ? null : resolve(webRoot, arg('data') ?? 'public/firms');
if (dataSrc && !existsSync(join(dataSrc, 'manifest.json'))) {
  fail(`no manifest.json in ${dataSrc}. Pass the real build with --data <folder>.`);
}
if (out === webRoot || out === resolve(webRoot, 'public') || (dataSrc && out.startsWith(dataSrc))) {
  fail(`refusing to write to ${out}`);
}

// 1. App build. publicDir is off (HOTSPOTS_NO_PUBLIC) so a data symlink in public/ is not copied.
console.log(`Building the app into ${out}`);
const env: NodeJS.ProcessEnv = {
  ...process.env,
  HOTSPOTS_NO_PUBLIC: '1',
  HOTSPOTS_BASE: base,
  VITE_DATA_BASE: dataBase ?? `${base}data`,
};
if (view) env.VITE_DEFAULT_VIEW = view;
else delete env.VITE_DEFAULT_VIEW;
const vite = join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const build = spawnSync(process.execPath, [vite, 'build', '--outDir', out, '--emptyOutDir'], {
  cwd: webRoot,
  env,
  stdio: 'inherit',
});
if (build.status !== 0) fail('vite build failed');

// 2. Static files from public/ other than data (the basemap).
for (const entry of readdirSync(join(webRoot, 'public'))) {
  if (DATA_DIRS.test(entry)) continue;
  cpSync(join(webRoot, 'public', entry), join(out, entry), { recursive: true, dereference: true });
}

// 3. Data, copied (never moved). The manifest of the copy is rewritten when r5 is dropped.
if (dataSrc && clip) {
  console.log(`Copying data from ${dataSrc} clipped to ${clip.join(',')}`);
  const st = clipData(dataSrc, join(out, 'data'), clip);
  console.log(
    `Kept ${st.detailTiles} detail tiles, ${st.r5Parts} r5 parts, presets: ${st.places.join(', ')}`,
  );
} else if (dataSrc) {
  const dataOut = join(out, 'data');
  console.log(`Copying data from ${dataSrc}${keepR5 ? '' : ' (without overview/r5)'}`);
  const r5 = join(dataSrc, 'overview', 'r5');
  cpSync(dataSrc, dataOut, {
    recursive: true,
    dereference: true,
    filter: (src) =>
      keepR5 || !(src === r5 || src.startsWith(r5 + '\\') || src.startsWith(r5 + '/')),
  });
  const manifest = JSON.parse(readFileSync(join(dataSrc, 'manifest.json'), 'utf8')) as {
    source: string;
    ladder: { res: number; min_zoom: number; source: string }[];
    overview: { r5_parts: string[] };
  };
  if (manifest.source !== 'firms')
    console.warn(`Warning: manifest source is "${manifest.source}", not "firms"`);
  if (!keepR5) {
    manifest.ladder = manifest.ladder
      .filter((l) => l.res !== 5)
      .map((l) => (l.res === 6 ? { ...l, min_zoom: Math.max(l.min_zoom, detailZoom) } : l));
    manifest.overview.r5_parts = [];
    writeFileSync(join(dataOut, 'manifest.json'), JSON.stringify(manifest));
    console.log(
      `Manifest ladder in the copy: ${manifest.ladder.map((l) => `res ${l.res} from z${l.min_zoom}`).join(', ')}`,
    );
  }
}

// 4. Host files. Same syntax on Cloudflare Pages and Netlify. The 404 page stops the hosts from
// answering a missing data file with index.html.
writeFileSync(
  join(out, '_headers'),
  [
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/data/*',
    '  Cache-Control: public, max-age=3600',
    '',
  ].join('\n'),
);
writeFileSync(
  join(out, '404.html'),
  `<!doctype html><meta charset="utf-8"><title>Not found</title><p>Not found. <a href="${base}">The Hotspots</a></p>
`,
);
writeFileSync(join(out, '.nojekyll'), '');
if (readme) cpSync(resolve(webRoot, readme), join(out, 'README.md'));

// 5. Limits.
rmSync(join(out, '.vite'), { recursive: true, force: true });
let files = 0;
let bytes = 0;
let largest = { size: 0, path: '' };
let overGithubFile = false;
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue; // the gh-pages folder keeps its own history
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const s = statSync(p).size;
      files++;
      bytes += s;
      if (s > largest.size) largest = { size: s, path: p };
      if (s > GITHUB_MAX_FILE_BYTES) overGithubFile = true;
    }
  }
};
walk(out);
console.log(
  `${basename(out)}: ${files} files, ${(bytes / 1e9).toFixed(2)} GB, largest ${(largest.size / 1e6).toFixed(2)} MB (${largest.path.slice(out.length + 1)})`,
);
if (files > PAGES_MAX_FILES || largest.size > PAGES_MAX_FILE_BYTES) {
  console.warn(
    `Over the Cloudflare Pages free limits (${PAGES_MAX_FILES} files, 25 MiB per file). Use another host or drop --keep-r5.`,
  );
  if (!keepR5) process.exit(1);
} else {
  console.log('Within the Cloudflare Pages free limits.');
}
if (bytes > GITHUB_MAX_SITE_BYTES || overGithubFile) {
  console.warn('Over the GitHub Pages limits (1 GB site, 50 MB per file).');
} else {
  console.log('Within the GitHub Pages limits.');
}
