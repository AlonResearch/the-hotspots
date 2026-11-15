/**
 * Play (plan 8.6): one month every 700 ms, waits for the map files of each month,
 * prefetches the next 3, and stops at the last month.
 */
import { useEffect } from 'react';
import { addMonths } from '../data/months';
import { loadRows } from '../map/cellData';
import { useApp } from '../state/store';

const STEP_MS = 700;
const PREFETCH = 3;

export function usePlay(): void {
  const playing = useApp((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      while (!cancelled) {
        const { month, data, filePlan, setMonth, setPlaying } = useApp.getState();
        if (!data) return;
        const end = data.manifest.record.end;
        if (month >= end) {
          setPlaying(false);
          return;
        }
        const next = addMonths(month, 1);
        const started = performance.now();
        if (filePlan) {
          for (let i = 2; i <= PREFETCH + 1; i++) {
            const m = addMonths(month, i);
            if (m <= end) void loadRows(filePlan, m, data.manifest).catch(() => undefined);
          }
          try {
            await loadRows(filePlan, next, data.manifest, controller.signal);
          } catch {
            // A failed month still advances; the layer keeps the previous frame and shows a toast.
          }
        }
        const wait = STEP_MS - (performance.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (cancelled || !useApp.getState().playing) return;
        setMonth(next);
      }
    };
    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [playing]);
}
