import { useEffect } from 'react';
import { useApp } from '../state/store';

const NOTICE_MS = 6000;

/** One toast at a time: messages for refused areas, failed files and search. */
export function Notices() {
  const notice = useApp((s) => s.notice);
  const clear = useApp((s) => s.clearNotice);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clear, NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice, clear]);
  if (!notice) return null;
  return (
    <div
      className={`toast ${notice.tone === 'error' ? 'is-error' : ''}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
    >
      <span>{notice.text}</span>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={clear}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
    </div>
  );
}
