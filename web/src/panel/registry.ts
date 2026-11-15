/**
 * Panel slot registry (plan section 9). Adding a feature later means changing one
 * row and supplying the component; the panel, the store and the map stay as they are.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Place } from '../grid/place';
import type { Mode } from '../state/url';
import type { PlaceData, SlotId } from '../state/store';

export interface SectionProps {
  place: Place;
  data: PlaceData;
  month: string;
  mode: Mode;
}

export type SlotStatus = 'live' | 'demo' | 'planned';
/** The map layer an open section asks for. 'contributions' is the History recolour (8.7). */
export type MapLayerId = 'activity' | 'contributions';

export interface SectionSlot {
  id: SlotId;
  title: string;
  status: SlotStatus;
  order: { simple: number; sci: number };
  mapLayer?: MapLayerId;
  /** Opened when a place is chosen. */
  openByDefault?: boolean;
  component: LazyExoticComponent<ComponentType<SectionProps>>;
}

export const SLOTS: readonly SectionSlot[] = [
  {
    id: 'outlook',
    title: 'Next 12 months',
    status: 'live',
    order: { simple: 1, sci: 2 },
    component: lazy(() => import('./sections/OutlookSection')),
  },
  {
    id: 'why',
    title: 'Why',
    status: 'demo',
    order: { simple: 2, sci: 3 },
    component: lazy(() => import('./sections/Insight/WhySection')),
  },
  {
    id: 'actions',
    title: 'What to do',
    status: 'demo',
    order: { simple: 3, sci: 4 },
    component: lazy(() => import('./sections/Insight/ActionsSection')),
  },
  {
    id: 'history',
    title: 'History',
    status: 'live',
    order: { simple: 4, sci: 1 },
    mapLayer: 'contributions',
    openByDefault: true,
    component: lazy(() => import('./sections/History/HistorySection')),
  },
];

export const SHOW_PLANNED = import.meta.env.VITE_SHOW_PLANNED === '1';

/** Slots to render in a mode, in order. Planned slots only with VITE_SHOW_PLANNED=1. */
export function visibleSlots(mode: Mode, showPlanned = SHOW_PLANNED): SectionSlot[] {
  return SLOTS.filter((s) => s.status !== 'planned' || showPlanned).sort(
    (a, b) => a.order[mode] - b.order[mode],
  );
}

/** The section opened when a place is chosen (History), else the first live one. */
export function defaultSection(mode: Mode): SlotId | null {
  const shown = visibleSlots(mode, false);
  return (shown.find((s) => s.openByDefault) ?? shown.find((s) => s.status === 'live'))?.id ?? null;
}

export function slotById(id: SlotId | null): SectionSlot | undefined {
  return SLOTS.find((s) => s.id === id);
}
