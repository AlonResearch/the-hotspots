import { useApp } from '../state/store';

/** Simple and scientific modes (plan 8.8). Changes what is shown, never the layout. */
export function ModeSwitch() {
  const mode = useApp((s) => s.mode);
  const setMode = useApp((s) => s.setMode);
  return (
    <div className="segmented" role="group" aria-label="Detail level">
      <button type="button" aria-pressed={mode === 'simple'} onClick={() => setMode('simple')}>
        Simple
      </button>
      <button type="button" aria-pressed={mode === 'sci'} onClick={() => setMode('sci')}>
        Scientific
      </button>
    </div>
  );
}
