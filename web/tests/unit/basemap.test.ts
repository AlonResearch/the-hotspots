import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMapStyle,
  CELLS_BEFORE_ID,
  CELLS_BEFORE_ID_LOCAL,
  chooseBasemap,
  DETAIL_LAYERS,
  localStyle,
  onlineStyle,
} from '../../src/map/basemap';

describe('basemap choice (plan 8.10)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('falls back to the local basemap when the network is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(chooseBasemap()).resolves.toBe('local');
  });

  it('falls back when the online tiles do not answer within 4 s', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      ),
    );
    const choice = chooseBasemap();
    await vi.advanceTimersByTimeAsync(4001);
    await expect(choice).resolves.toBe('local');
  });

  it('uses the online basemap when it answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    await expect(chooseBasemap()).resolves.toBe('online');
  });

  it('the local style has land, lakes and borders', () => {
    const style = localStyle() as { layers: { id: string }[] };
    expect(style.layers.map((l) => l.id)).toEqual(['water', 'land', 'lakes', 'borders']);
  });

  it('cells go under roads, borders and names in both basemaps (D22, D23)', () => {
    const online = onlineStyle() as { layers: { id: string; type: string }[] };
    const ids = online.layers.map((l) => l.id);
    const at = ids.indexOf(CELLS_BEFORE_ID);
    expect(at).toBeGreaterThan(0);
    // Everything above the cells is a line or a label; nothing above them is a fill.
    expect(online.layers.slice(at).every((l) => l.type === 'line' || l.type === 'symbol')).toBe(
      true,
    );
    const local = localStyle() as { layers: { id: string }[] };
    expect(local.layers.map((l) => l.id)).toContain(CELLS_BEFORE_ID_LOCAL);
  });

  it('the quiet preset hides only the detail layers', () => {
    const vis = (preset: 'detailed' | 'quiet') =>
      Object.fromEntries(
        (
          onlineStyle(preset) as { layers: { id: string; layout?: { visibility?: string } }[] }
        ).layers.map((l) => [l.id, l.layout?.visibility ?? 'visible']),
      );
    const detailed = vis('detailed');
    const quiet = vis('quiet');
    for (const id of DETAIL_LAYERS) {
      expect(detailed[id], id).toBe('visible');
      expect(quiet[id], id).toBe('none');
    }
    for (const id of ['land', 'water', 'admin-0', 'label-country', 'label-city']) {
      expect(quiet[id], id).toBe('visible');
    }
  });

  it('switching the preset on a map only touches the detail layers', () => {
    const set: Record<string, unknown> = {};
    applyMapStyle(
      { getLayer: () => ({}), setLayoutProperty: (id, _k, v) => (set[id] = v) },
      'quiet',
    );
    expect(Object.keys(set).sort()).toEqual([...DETAIL_LAYERS].sort());
    expect(new Set(Object.values(set))).toEqual(new Set(['none']));
  });
});
