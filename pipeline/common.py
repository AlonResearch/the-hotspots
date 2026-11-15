"""Shared helpers for the data build: settings, paths, DuckDB connection, step log."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import time
import tomllib
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

REPO = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = Path(__file__).resolve().parent / "config.toml"

SATELLITES = ("terra", "aqua", "snpp", "noaa20", "noaa21")
SENSOR_GROUP = {"terra": "modis", "aqua": "modis", "snpp": "viirs", "noaa20": "viirs", "noaa21": "viirs"}


class BuildError(RuntimeError):
    """A failed check or missing input. The message says what to do."""


@dataclass
class Paths:
    raw: Path
    processed: Path
    publish: Path

    @property
    def normalized(self) -> Path:
        return self.processed / "normalized"

    @property
    def atoms(self) -> Path:
        return self.processed / "atoms"

    @property
    def harmonized(self) -> Path:
        return self.processed / "harmonized"

    @property
    def build_log(self) -> Path:
        return self.processed / "build_log.json"


def base_parser(description: str) -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=description)
    p.add_argument("--config", type=Path, default=DEFAULT_CONFIG, help="settings file (default: pipeline/config.toml)")
    p.add_argument(
        "--data-root",
        type=Path,
        default=None,
        help="folder that holds raw/ and processed/ (default: <repo>/data). "
        "Use the main checkout's data folder when running from a worktree.",
    )
    p.add_argument("--threads", type=int, default=None, help="DuckDB threads (default: all cores)")
    p.add_argument("--memory", default="12GB", help="DuckDB memory limit (default: 12GB)")
    return p


def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise BuildError(f"settings file not found: {path}")
    with path.open("rb") as f:
        return tomllib.load(f)


def resolve_paths(cfg: dict[str, Any], data_root: Path | None, publish: Path | None = None) -> Paths:
    def rel(p: str) -> Path:
        q = Path(p)
        return q if q.is_absolute() else REPO / q

    if data_root is not None:
        raw = data_root / "raw"
        processed = data_root / "processed"
    else:
        raw = rel(cfg["paths"]["raw"])
        processed = rel(cfg["paths"]["processed"])
    out = publish if publish is not None else rel(cfg["paths"]["publish"])
    return Paths(raw=raw.resolve(), processed=processed.resolve(), publish=out.resolve())


def connect(threads: int | None, memory: str, temp_dir: Path, h3: bool = False):
    import duckdb

    temp_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"SET memory_limit = '{memory}'")
    con.execute(f"SET temp_directory = '{temp_dir.as_posix()}'")
    con.execute("SET preserve_insertion_order = false")
    if threads:
        con.execute(f"SET threads = {int(threads)}")
    if h3:
        try:
            con.execute("LOAD h3")
        except Exception:
            try:
                con.execute("INSTALL h3 FROM community; LOAD h3;")
            except Exception as e:  # noqa: BLE001
                raise BuildError(
                    "Could not load the DuckDB h3 community extension. It is downloaded once on first use; "
                    f"check the network and retry. ({e})"
                ) from e
    return con


def dir_size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024
    return f"{n:.1f} TB"


def log(msg: str) -> None:
    print(f"[{dt.datetime.now():%H:%M:%S}] {msg}", flush=True)


@contextmanager
def step(paths: Paths, name: str, output: Path) -> Iterator[dict[str, Any]]:
    """Times a step and records run time and output size in processed/build_log.json."""
    started = time.time()
    extra: dict[str, Any] = {}
    log(f"step {name}: start")
    yield extra
    secs = time.time() - started
    size = dir_size(output) if output.exists() else 0
    entry = {
        "finished_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "seconds": round(secs, 1),
        "output": str(output),
        "output_bytes": size,
        **extra,
    }
    paths.processed.mkdir(parents=True, exist_ok=True)
    data: dict[str, Any] = {}
    if paths.build_log.exists():
        try:
            data = json.loads(paths.build_log.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
    data[name] = entry
    paths.build_log.write_text(json.dumps(data, indent=2), encoding="utf-8")
    log(f"step {name}: done in {secs:.1f} s, output {human(size)} at {output}")


def main_guard(fn) -> None:
    try:
        fn()
    except BuildError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("Interrupted.", file=sys.stderr)
        sys.exit(130)


def month_add(month: str, n: int) -> str:
    y, m = int(month[:4]), int(month[5:7])
    k = y * 12 + (m - 1) + n
    return f"{k // 12:04d}-{k % 12 + 1:02d}"


def month_index(start: str, month: str) -> int:
    return (int(month[:4]) * 12 + int(month[5:7])) - (int(start[:4]) * 12 + int(start[5:7]))


def month_int(month: str) -> int:
    """'2012-02' -> 201202 (the atom table's month key)."""
    return int(month[:4]) * 100 + int(month[5:7])


def int_month(v: int) -> str:
    return f"{v // 100:04d}-{v % 100:02d}"


def env_flag(name: str) -> bool:
    return os.environ.get(name, "") not in ("", "0", "false")
