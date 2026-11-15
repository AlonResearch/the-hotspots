/**
 * Bottom sheet for the place panel on phones (plan 8.9): three stops, peek (place name
 * and summary sentence), half and full. Tap the handle to step through them, or drag it.
 */
import { useRef, useState, type ReactNode } from 'react';
import { useApp } from '../state/store';

const ORDER = ['peek', 'half', 'full'] as const;
const LABEL = { peek: 'small', half: 'half height', full: 'full height' } as const;

export function BottomSheet({ children }: { children: ReactNode }) {
  const stop = useApp((s) => s.sheet);
  const setSheet = useApp((s) => s.setSheet);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const [dragH, setDragH] = useState<number | null>(null);

  const next = () => setSheet(ORDER[(ORDER.indexOf(stop) + 1) % ORDER.length]!);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { y: e.clientY, h: el.getBoundingClientRect().height, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 6) d.moved = true;
    if (d.moved) setDragH(Math.max(80, d.h + dy));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      next();
      return;
    }
    const parent = ref.current?.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
    const share = (dragH ?? d.h) / parent;
    setSheet(share < 0.3 ? 'peek' : share < 0.7 ? 'half' : 'full');
    setDragH(null);
  };

  return (
    <div
      ref={ref}
      className={`sheet sheet-${stop}`}
      style={dragH !== null ? { height: dragH, transition: 'none' } : undefined}
    >
      <button
        type="button"
        className="sheet-handle"
        aria-label={`Panel is ${LABEL[stop]}. Tap to change.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setDragH(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            next();
          }
        }}
      >
        <span aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}
