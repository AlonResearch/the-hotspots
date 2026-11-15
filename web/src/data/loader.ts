/**
 * Fetches and validates data files (plan 7.3): in-memory LRU caches, request
 * de-duplication, and abort of requests that every caller has given up on.
 */
import type { z } from 'zod';
import {
  DetailIndex,
  DetailTile,
  Manifest,
  MethodTables,
  Overview,
  Places,
  Summary,
  formatIssues,
  paths,
} from './contract';
import { toTileData, type TileData } from './tile';

export const DATA_BASE: string = (import.meta.env?.VITE_DATA_BASE as string | undefined) ?? '/data';

export type DataErrorKind = 'network' | 'http' | 'json' | 'schema' | 'missing';

export class DataError extends Error {
  constructor(
    readonly path: string,
    readonly kind: DataErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DataError';
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

class Lru<V> {
  private map = new Map<string, V>();
  constructor(private capacity: number) {}
  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
  set(key: string, v: V): void {
    this.map.delete(key);
    this.map.set(key, v);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

interface InFlight<T> {
  promise: Promise<T>;
  controller: AbortController;
  waiters: number;
}

/** Loads a file, validates it, converts it, and caches the result. */
class Source<T> {
  private inflight = new Map<string, InFlight<T>>();
  constructor(
    private cache: Lru<T>,
    private load: (path: string, signal: AbortSignal) => Promise<T>,
  ) {}

  cached(path: string): T | undefined {
    return this.cache.get(path);
  }

  get(path: string, signal?: AbortSignal): Promise<T> {
    const hit = this.cache.get(path);
    if (hit !== undefined) return Promise.resolve(hit);
    let f = this.inflight.get(path);
    if (!f) {
      const controller = new AbortController();
      const promise = this.load(path, controller.signal).then(
        (v) => {
          this.inflight.delete(path);
          this.cache.set(path, v);
          return v;
        },
        (e: unknown) => {
          this.inflight.delete(path);
          throw e;
        },
      );
      f = { promise, controller, waiters: 0 };
      this.inflight.set(path, f);
    }
    const entry = f;
    entry.waiters++;
    if (!signal) return entry.promise;
    if (signal.aborted) {
      this.release(path, entry);
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        this.release(path, entry);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      entry.promise.then(
        (v) => {
          signal.removeEventListener('abort', onAbort);
          resolve(v);
        },
        (e: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(e);
        },
      );
    });
  }

  private release(path: string, entry: InFlight<T>): void {
    entry.waiters--;
    if (entry.waiters <= 0 && this.inflight.get(path) === entry) {
      entry.controller.abort();
      this.inflight.delete(path);
    }
  }
}

export async function fetchJson<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
  optional = false,
): Promise<T | null> {
  const url = `${DATA_BASE.replace(/\/$/, '')}/${path}`;
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new DataError(path, 'network', `Could not reach ${path}`);
  }
  if (res.status === 404 && optional) return null;
  if (!res.ok) {
    throw new DataError(
      path,
      res.status === 404 ? 'missing' : 'http',
      `${path}: HTTP ${res.status}`,
      res.status,
    );
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch (e) {
    if (isAbort(e)) throw e;
    // Dev servers answer unknown paths with index.html; treat that as missing for optional files.
    if (optional) return null;
    throw new DataError(path, 'json', `${path} is not valid JSON`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.error(`Data file ${path} does not match the contract:\n${formatIssues(parsed.error)}`);
    throw new DataError(path, 'schema', `${path} does not match the data contract`);
  }
  return parsed.data;
}

async function required<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const v = await fetchJson(path, schema, signal);
  if (v === null) throw new DataError(path, 'missing', `${path} is missing`);
  return v;
}

type OverviewT = z.infer<typeof Overview>;
const loadOverview = (p: string, s: AbortSignal) => required(p, Overview, s);
/** 24 months per resolution. Res 5 holds one file per res 0 part, so its cache is larger. */
const overviewSources = {
  3: new Source<OverviewT>(new Lru(24), loadOverview),
  4: new Source<OverviewT>(new Lru(24), loadOverview),
  5: new Source<OverviewT>(new Lru(24 * 8), loadOverview),
};
const tileSource = new Source<TileData>(new Lru(80), async (p, s) =>
  toTileData(await required(p, DetailTile, s)),
);

export const loader = {
  manifest: (signal?: AbortSignal) => required(paths.manifest, Manifest, signal),
  summary: (signal?: AbortSignal) => required(paths.summary, Summary, signal),
  places: (signal?: AbortSignal) => required(paths.places, Places, signal),
  detailIndex: (signal?: AbortSignal) => required(paths.detailIndex, DetailIndex, signal),
  method: (signal?: AbortSignal) => fetchJson(paths.method, MethodTables, signal, true),

  overview(res: 3 | 4, month: string, signal?: AbortSignal) {
    return overviewSources[res].get(paths.overview(res, month), signal);
  },
  overviewR5(part: string, month: string, signal?: AbortSignal) {
    return overviewSources[5].get(paths.overviewR5(part, month), signal);
  },
  overviewCached(res: 3 | 4, month: string) {
    return overviewSources[res].cached(paths.overview(res, month));
  },
  overviewR5Cached(part: string, month: string) {
    return overviewSources[5].cached(paths.overviewR5(part, month));
  },
  tile(parent: string, signal?: AbortSignal) {
    return tileSource.get(paths.detailTile(parent), signal);
  },
  tileCached(parent: string) {
    return tileSource.cached(paths.detailTile(parent));
  },
};
