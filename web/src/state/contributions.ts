/**
 * Contributions of the place's cells to the selected month (plan 6.6 and 8.7.6),
 * shared by the History list and the map recolour.
 */
import { cellToParent } from 'h3-js';
import { useMemo } from 'react';
import { loader } from '../data/loader';
import { monthToIndex } from '../data/months';
import { entryAt, findCell } from '../data/tile';
import type { DrawCell } from '../map/CellLayer';
import { cellAlpha, fillColor } from '../map/density';
import { slotById } from '../panel/registry';
import { contributions, type Contributions } from '../stats/contributions';
import { useApp } from './store';

export function usePlaceContributions(): Contributions | null {
  const placeData = useApp((s) => s.placeData);
  const month = useApp((s) => s.month);
  const data = useApp((s) => s.data);
  return useMemo(() => {
    if (!data || !placeData || placeData.status !== 'ready' || placeData.cells.length < 2)
      return null;
    const t = monthToIndex(data.manifest.record.start, month);
    const tileRes = data.manifest.detail.tile_res;
    const valueOf = (cell: string) => {
      const tile = loader.tileCached(cellToParent(cell, tileRes));
      if (!tile) return 0;
      const k = findCell(tile, cell);
      if (k < 0) return 0;
      const i = entryAt(tile, k, t);
      return i < 0 ? 0 : tile.h[i]!;
    };
    return contributions(placeData.cells, valueOf, placeData.centre, placeData.partlyOutside);
  }, [data, placeData, month]);
}

/** Cells for the map recolour: share over the largest share, in 5 ember steps. */
export function shareCells(c: Contributions): DrawCell[] {
  const max = c.rows[0]?.share ?? 0;
  return c.rows.map((r) => {
    const k = max > 0 ? Math.min(5, Math.max(1, Math.ceil((r.share / max) * 5))) : 1;
    return {
      cell: r.cell,
      value: r.value,
      densityValue: r.share,
      k,
      color: fillColor(k, cellAlpha(6)),
    };
  });
}

/** True when the open section asks for the contributions layer and the user has not turned it off. */
export function useContributionsLayerOn(): boolean {
  const openSection = useApp((s) => s.openSection);
  const show = useApp((s) => s.showContributions);
  const ready = useApp((s) => s.placeData?.status === 'ready');
  return Boolean(ready && show && slotById(openSection)?.mapLayer === 'contributions');
}
