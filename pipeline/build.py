"""Runs the whole data build in order, then the contract validator.

  normalize -> grid -> harmonize -> publish -> npm run validate-data

Each step is its own script and reads the previous step's output from disk, so any step can be
rerun alone. Arguments after the step list are passed to every step (for example --data-root).

Usage: python pipeline/build.py [--from STEP] [--skip-validate] [--data-root DIR] [--out DIR] [--force]
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = ["normalize", "grid", "harmonize", "publish"]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--from", dest="start", choices=STEPS, default="normalize", help="first step to run")
    p.add_argument("--skip-validate", action="store_true", help="do not run npm run validate-data at the end")
    p.add_argument("--data-root", default=None)
    p.add_argument("--out", default=None, help="publish folder (publish step only)")
    p.add_argument("--config", default=None)
    p.add_argument("--force", action="store_true", help="rewrite existing normalize and grid outputs")
    args = p.parse_args()
    common = []
    if args.data_root:
        common += ["--data-root", args.data_root]
    if args.config:
        common += ["--config", args.config]
    for name in STEPS[STEPS.index(args.start):]:
        extra = list(common)
        if args.force and name in ("normalize", "grid"):
            extra.append("--force")
        if name == "publish" and args.out:
            extra += ["--out", args.out]
        print(f"=== {name}", flush=True)
        r = subprocess.run([sys.executable, str(HERE / f"{name}.py"), *extra])
        if r.returncode != 0:
            print(f"Step {name} failed (exit {r.returncode}). Fix it and rerun with --from {name}.", file=sys.stderr)
            return r.returncode
    if args.skip_validate:
        return 0
    sys.path.insert(0, str(HERE))
    import tomllib

    from common import resolve_paths

    cfg = tomllib.loads(Path(args.config or HERE / "config.toml").read_text(encoding="utf-8"))
    out = resolve_paths(cfg, None, Path(args.out) if args.out else None).publish
    npm = shutil.which("npm")
    if npm is None:
        print("npm not found: run `cd web && npm run validate-data -- <publish folder>` yourself.", file=sys.stderr)
        return 1
    print(f"=== validate-data {out}", flush=True)
    return subprocess.run([npm, "run", "validate-data", "--", str(out)], cwd=HERE.parent / "web").returncode


if __name__ == "__main__":
    sys.exit(main())
