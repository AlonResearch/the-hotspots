"""Resumable, throttled worldwide NASA FIRMS active-fire downloader.

Run from the repository root:

    python -I scripts/download_firms.py [options]

Reads the MAP_KEY from the FIRMS_MAP_KEY environment variable or from the
FIRMS_MAP_KEY=... line in the repo-level .env file. The key is never logged.

Output: data/raw/firms/{PRODUCT}/{PRODUCT}_{YYYY-MM}.csv, one file per month,
built from consecutive Area API requests of at most 5 days each (single header).
A month is written to a .part file and renamed when complete, so a rerun skips
finished months and redoes only the interrupted one.

Download order (the "plan"):
  1. 2012-01 .. 2020-12: MODIS_SP and VIIRS_SNPP_SP, same month for both, month by month.
  2. VIIRS_NOAA20_SP backfill 2018-04 .. 2020-12, then 2021-01 to the end of SP:
     MODIS_SP, VIIRS_SNPP_SP, VIIRS_NOAA20_SP, month by month.
  3. VIIRS_NOAA21_SP (2023-03 to the end of SP).
  4. NRT tails: the months after each SP product ends, from the NRT products.
  5. MODIS_SP 2000-11 .. 2011-12.
"""

import argparse
import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.request

BASE = "https://firms.modaps.eosdis.nasa.gov"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "raw", "firms")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")
LOG_PATH = os.path.join(OUT_DIR, "download.log")
PID_PATH = os.path.join(OUT_DIR, "download.pid")

TX_PER_DAY = 36          # measured: about 36 transactions per world-day
WINDOW_DAYS = 5          # world requests allow 1..5 days
STATUS_POLL_SECONDS = 30
MAX_RETRIES = 6
TIMEOUT = 300

# Fallback ranges, used only if the data_availability call fails.
FALLBACK = {
    "MODIS_SP": ("2000-11-01", "2026-08-31"),
    "MODIS_NRT": ("2026-09-01", "2026-11-14"),
    "VIIRS_SNPP_SP": ("2012-01-20", "2026-07-31"),
    "VIIRS_SNPP_NRT": ("2026-08-01", "2026-11-02"),
    "VIIRS_NOAA20_SP": ("2018-04-01", "2026-07-31"),
    "VIIRS_NOAA20_NRT": ("2026-08-01", "2026-11-14"),
    "VIIRS_NOAA21_SP": ("2023-03-01", "2026-07-31"),
    "VIIRS_NOAA21_NRT": ("2026-08-01", "2026-11-14"),
}
BASES = ["MODIS", "VIIRS_SNPP", "VIIRS_NOAA20", "VIIRS_NOAA21"]

_log_file = None
_key = ""


def log(msg):
    line = f"{dt.datetime.now().isoformat(timespec='seconds')} {msg}"
    if _key:
        line = line.replace(_key, "***")
    print(line, flush=True)
    if _log_file:
        _log_file.write(line + "\n")


def load_key(var="FIRMS_MAP_KEY"):
    key = os.environ.get(var, "").strip()
    if key:
        return key
    env = os.path.join(ROOT, ".env")
    if os.path.exists(env):
        with open(env, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(var + "="):
                    return line.split("=", 1)[1].strip().strip("'\"")
    return ""


def http_get_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "hotspots-firms-downloader"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def ymd(s):
    return dt.date.fromisoformat(s)


def month_add(d, n):
    m = d.year * 12 + d.month - 1 + n
    return dt.date(m // 12, m % 12 + 1, 1)


def month_end(d):
    return month_add(d, 1) - dt.timedelta(days=1)


def months(a, b):
    """First days of all months from the month of a through the month of b."""
    d = dt.date(a.year, a.month, 1)
    while d <= b:
        yield d
        d = month_add(d, 1)


def get_availability(key):
    try:
        text = http_get_text(f"{BASE}/api/data_availability/csv/{key}/ALL")
        lines = text.strip().splitlines()
        if not lines[0].startswith("data_id"):
            raise ValueError("unexpected availability response")
        out = {}
        for ln in lines[1:]:
            p = ln.split(",")
            if len(p) >= 3:
                out[p[0]] = (p[1], p[2])
        for k, v in FALLBACK.items():
            if k not in out:
                out[k] = v
        return {k: (ymd(a), ymd(b)) for k, (a, b) in out.items()}, "api"
    except Exception as e:  # network or format problem: fall back, say so
        log(f"availability lookup failed ({type(e).__name__}), using built-in ranges")
        return {k: (ymd(a), ymd(b)) for k, (a, b) in FALLBACK.items()}, "fallback"


def build_plan(avail, products, start, end):
    """Return an ordered list of (product, first_day_of_month, win_start, win_end)."""
    sp = {b: avail[f"{b}_SP"] for b in BASES}
    nrt = {}
    for b in BASES:
        a, z = avail[f"{b}_NRT"]
        nrt[b] = (max(a, sp[b][1] + dt.timedelta(days=1)), z)

    def rng(product):
        b, kind = product.rsplit("_", 1)
        return sp[b] if kind == "SP" else nrt[b]

    plan, seen = [], set()

    def add(product, m):
        lo, hi = rng(product)
        a = max(lo, m, start)
        z = min(hi, month_end(m), end)
        if a > z or product not in products or (product, m) in seen:
            return
        seen.add((product, m))
        plan.append((product, m, a, z))

    sp_end = max(v[1] for v in sp.values())
    # 1. overlap years, MODIS + SNPP interleaved
    for m in months(dt.date(2012, 1, 1), dt.date(2020, 12, 31)):
        for p in ("MODIS_SP", "VIIRS_SNPP_SP"):
            add(p, m)
    # 2. NOAA-20 backfill, then 2021 to end of SP for the three products
    for m in months(dt.date(2018, 4, 1), dt.date(2020, 12, 31)):
        add("VIIRS_NOAA20_SP", m)
    for m in months(dt.date(2021, 1, 1), sp_end):
        for p in ("MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP"):
            add(p, m)
    # 3. NOAA-21 SP
    for m in months(sp["VIIRS_NOAA21"][0], sp_end):
        add("VIIRS_NOAA21_SP", m)
    # 4. NRT tails
    nrt_start = min(v[0] for v in nrt.values())
    nrt_end = max(v[1] for v in nrt.values())
    for m in months(nrt_start, nrt_end):
        for b in BASES:
            add(f"{b}_NRT", m)
    # 5. old MODIS last
    for m in months(sp["MODIS"][0], dt.date(2011, 12, 31)):
        add("MODIS_SP", m)
    return plan


def windows(a, z):
    d = a
    while d <= z:
        n = min(WINDOW_DAYS, (z - d).days + 1)
        yield d, n
        d += dt.timedelta(days=n)


def current_transactions(key):
    """Return (current, limit) from the key status endpoint, or None on failure."""
    try:
        j = json.loads(http_get_text(f"{BASE}/mapserver/mapkey_status/?MAP_KEY={key}"))
        return int(j["current_transactions"]), int(j["transaction_limit"])
    except Exception:
        return None


def wait_for_headroom(key, cost, cap):
    announced = False
    while True:
        st = current_transactions(key)
        if st is None:
            log("status endpoint unavailable, waiting 60s")
            time.sleep(60)
            continue
        cur, _limit = st
        if cur + cost <= cap:
            return cur
        if not announced:
            log(f"throttle: {cur} transactions in window, need {cost} more under cap {cap}, waiting")
            announced = True
        time.sleep(STATUS_POLL_SECONDS)


def fetch_window(key, product, d, n, part, cap, write_header):
    """Append one window to the open .part file. Returns rows added. Raises on error."""
    wait_for_headroom(key, TX_PER_DAY * n, cap)
    url = f"{BASE}/api/area/csv/{key}/{product}/world/{n}/{d.isoformat()}"
    req = urllib.request.Request(url, headers={"User-Agent": "hotspots-firms-downloader"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        header = r.readline()
        if not header.startswith(b"latitude,longitude"):
            body = (header + r.read(300)).decode("utf-8", "replace").strip().replace("\n", " ")
            raise RuntimeError(f"not a CSV header: {body[:150]}")
        header_text = header.decode("ascii", "replace").strip()
        if write_header:
            part.write(header_text.encode("ascii", "replace") + b"\n")
        rows, last = 0, b"\n"
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            part.write(chunk)
            rows += chunk.count(b"\n")
            last = chunk[-1:]
        if last != b"\n":
            part.write(b"\n")
            rows += 1
    return rows, header_text


def load_manifest():
    try:
        with open(MANIFEST, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_manifest(m):
    tmp = MANIFEST + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=1, sort_keys=True)
    os.replace(tmp, MANIFEST)


def download_month(key, product, m, a, z, cap):
    pdir = os.path.join(OUT_DIR, product)
    os.makedirs(pdir, exist_ok=True)
    final = os.path.join(pdir, f"{product}_{m:%Y-%m}.csv")
    part = final + ".part"
    t0 = time.time()
    rows_total, header = 0, None
    with open(part, "wb") as f:
        for d, n in windows(a, z):
            for attempt in range(MAX_RETRIES + 1):
                pos = f.tell()
                try:
                    rows, h = fetch_window(key, product, d, n, f, cap, header is None)
                    if header is None:
                        header = h
                    break
                except Exception as e:
                    f.truncate(pos)
                    f.seek(pos)
                    msg = str(e).replace(key, "***")
                    if attempt == MAX_RETRIES:
                        raise RuntimeError(f"{product} {d} +{n}d failed: {type(e).__name__}: {msg}")
                    wait = min(600, 30 * 2 ** attempt)
                    if "exceed" in msg.lower() or "429" in msg:
                        wait = max(wait, 300)
                    log(f"retry {attempt + 1}/{MAX_RETRIES} {product} {d} +{n}d: {type(e).__name__}: {msg[:150]}; sleeping {wait}s")
                    time.sleep(wait)
            rows_total += rows
    return part, final, rows_total, header, time.time() - t0


def main():
    global _log_file, _key
    ap = argparse.ArgumentParser(description="Worldwide FIRMS monthly CSV downloader (resumable, throttled).")
    ap.add_argument("--products", default="all",
                    help="comma list of bases (MODIS, VIIRS_SNPP, VIIRS_NOAA20, VIIRS_NOAA21) or full names such as MODIS_SP; default all")
    ap.add_argument("--start", default="2000-01-01", help="clip to dates on or after YYYY-MM-DD")
    ap.add_argument("--end", default=dt.date.today().isoformat(), help="clip to dates on or before YYYY-MM-DD")
    ap.add_argument("--skip-years", default="",
                    help="comma list of years to leave out, for years already fetched from the archive download (for example 2018,2019,2023)")
    ap.add_argument("--key-var", default="FIRMS_MAP_KEY",
                    help="name of the .env variable holding the MAP_KEY to use (default FIRMS_MAP_KEY)")
    ap.add_argument("--shard", default="",
                    help="I/N: run only every Nth planned month starting at I (0-based). Run one process per key, "
                         "each with its own --key-var and a different I, to split the work across keys")
    ap.add_argument("--dry-run", action="store_true", help="print the plan and estimated cost, download nothing")
    ap.add_argument("--max-transactions-per-window", type=int, default=4500,
                    help="stay under this many transactions per 10 minutes (key limit is 5000)")
    args = ap.parse_args()

    _key = load_key(args.key_var)
    if not _key:
        sys.exit(f"No MAP_KEY in {args.key_var}. Put {args.key_var}=... in .env or set the environment variable. "
                 "Free key: https://firms.modaps.eosdis.nasa.gov/api/map_key/")
    start, end = ymd(args.start), ymd(args.end)

    allp = [f"{b}_{k}" for b in BASES for k in ("SP", "NRT")]
    if args.products == "all":
        products = set(allp)
    else:
        products = set()
        for tok in (t.strip() for t in args.products.split(",") if t.strip()):
            hit = [p for p in allp if p == tok or p.rsplit("_", 1)[0] == tok]
            if not hit:
                sys.exit(f"unknown product: {tok}")
            products.update(hit)

    os.makedirs(OUT_DIR, exist_ok=True)
    avail, src = get_availability(_key)
    plan = build_plan(avail, products, start, end)
    skip_years = {int(y) for y in args.skip_years.split(",") if y.strip()}
    if skip_years:
        plan = [t for t in plan if t[1].year not in skip_years]

    if args.shard:
        global MANIFEST, LOG_PATH, PID_PATH
        si, sn = (int(x) for x in args.shard.split("/"))
        if not (0 <= si < sn):
            sys.exit("--shard must be I/N with 0 <= I < N")
        plan = plan[si::sn]
        MANIFEST = os.path.join(OUT_DIR, f"manifest.shard{si}.json")
        LOG_PATH = os.path.join(OUT_DIR, f"download.shard{si}.log")
        PID_PATH = os.path.join(OUT_DIR, f"download.shard{si}.pid")

    manifest = load_manifest()

    def done(product, m, z):
        final = os.path.join(OUT_DIR, product, f"{product}_{m:%Y-%m}.csv")
        if not os.path.exists(final):
            return False
        e = manifest.get(f"{product}/{m:%Y-%m}")
        return e is None or ymd(e["end"]) >= z

    todo = [t for t in plan if not done(t[0], t[1], t[3])]
    days = sum((z - a).days + 1 for _, _, a, z in todo)
    tx = days * TX_PER_DAY
    hours = tx / args.max_transactions_per_window * 10 / 60
    summary = (f"plan: {len(plan)} product-months, {len(plan) - len(todo)} already done, "
               f"{len(todo)} to download, {days} product-days, about {tx} transactions, "
               f"at least {hours:.1f} h at the rate limit (availability: {src})")
    if args.dry_run:
        print(summary)
        for p, m, a, z in todo:
            print(f"  {p:18s} {m:%Y-%m} {a} .. {z}")
        return

    _log_file = open(LOG_PATH, "a", encoding="utf-8", buffering=1)
    with open(PID_PATH, "w") as f:
        f.write(str(os.getpid()))
    try:
        log(summary)
        failed = []
        for i, (product, m, a, z) in enumerate(todo, 1):
            try:
                part, final, rows, header, secs = download_month(_key, product, m, a, z, args.max_transactions_per_window)
                os.replace(part, final)
                size = os.path.getsize(final)
                manifest[f"{product}/{m:%Y-%m}"] = {
                    "rows": rows, "bytes": size, "start": a.isoformat(), "end": z.isoformat(),
                    "finished_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                }
                save_manifest(manifest)
                log(f"[{i}/{len(todo)}] done {product} {m:%Y-%m}: {rows} rows, {size / 1e6:.1f} MB, {secs:.0f}s")
            except Exception as e:
                failed.append((product, f"{m:%Y-%m}"))
                log(f"[{i}/{len(todo)}] FAILED {product} {m:%Y-%m}: {str(e)[:300]}")
                try:
                    os.remove(os.path.join(OUT_DIR, product, f"{product}_{m:%Y-%m}.csv.part"))
                except OSError:
                    pass
        log(f"finished. failed months: {failed if failed else 'none'}. Rerun to retry failed months.")
    finally:
        try:
            os.remove(PID_PATH)
        except OSError:
            pass


if __name__ == "__main__":
    main()
