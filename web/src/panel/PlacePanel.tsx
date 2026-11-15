import { Suspense, useEffect } from 'react';
import { monthStatus } from '../data/months';
import { useApp, useData } from '../state/store';
import { analysisLine, cellsBounds, placeTitle, SMALL_AREA_MESSAGE } from './placeText';
import { BottomSheet } from '../ui/BottomSheet';
import { StatusMarker } from '../ui/StatusMarker';
import { useIsMobile } from '../ui/useIsMobile';
import { defaultSection, slotById, visibleSlots } from './registry';

/** Place header and the section slots from the registry (plan 7.3 and 9). */
export function PlacePanel() {
  const place = useApp((s) => s.place);
  const placeData = useApp((s) => s.placeData);
  const mode = useApp((s) => s.mode);
  const month = useApp((s) => s.month);
  const outlookMonth = useApp((s) => s.outlookMonth);
  const openSection = useApp((s) => s.openSection);
  const setOpenSection = useApp((s) => s.setOpenSection);
  const setPlace = useApp((s) => s.setPlace);
  const flyTo = useApp((s) => s.flyTo);
  const reloadPlace = useApp((s) => s.reloadPlace);
  const { manifest } = useData();
  const mobile = useIsMobile();

  // Opening a place opens the first live section of the mode.
  useEffect(() => {
    if (place && !slotById(openSection)) setOpenSection(defaultSection(mode));
  }, [place, mode, openSection, setOpenSection]);

  if (!place) return null;
  const status = outlookMonth && placeData?.forecast ? 'forecast' : monthStatus(manifest, month);

  const panel = (
    <aside className="panel" id="place-panel" aria-labelledby="place-title" tabIndex={-1}>
      <div className="panel-header">
        <div className="panel-title-row">
          <h2 id="place-title" className="place-title">
            {placeTitle(place)}
          </h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Clear place"
            title="Clear place (Escape)"
            onClick={() => setPlace(null)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </div>
        {placeData && (
          <>
            <p className="caption">
              {analysisLine(place, placeData)} <StatusMarker kind={status} />
            </p>
            {placeData.expanded && <p className="caption note">{SMALL_AREA_MESSAGE}</p>}
            <button
              type="button"
              className="link-button"
              onClick={() => flyTo({ bounds: cellsBounds(placeData.cells) })}
            >
              Zoom to place
            </button>
          </>
        )}
      </div>

      <div className="panel-body">
        {!placeData || placeData.status === 'loading' ? (
          <p className="muted" role="status">
            Loading the history of this place...
          </p>
        ) : placeData.status === 'unavailable' ? (
          <p className="notice-inline" role="status">
            History is not available for this area in this build.
          </p>
        ) : placeData.status === 'error' ? (
          <div className="notice-inline is-error" role="alert">
            <p>{placeData.error ?? 'Could not load the history for this place.'}</p>
            <button type="button" className="button" onClick={reloadPlace}>
              Retry
            </button>
          </div>
        ) : (
          visibleSlots(mode).map((slot) => {
            if (slot.status === 'planned') {
              return (
                <section
                  key={slot.id}
                  className="section is-planned"
                  aria-label={`${slot.title} (planned)`}
                >
                  <h3 className="section-title">{slot.title}</h3>
                </section>
              );
            }
            const open = openSection === slot.id;
            const Body = slot.component;
            return (
              <section key={slot.id} className="section">
                <h3 className="section-title">
                  <button
                    type="button"
                    className="section-toggle"
                    aria-expanded={open}
                    aria-controls={`section-${slot.id}`}
                    onClick={() => setOpenSection(open ? null : slot.id)}
                  >
                    {slot.title}
                    {slot.status === 'demo' && <StatusMarker kind="demo" />}
                  </button>
                </h3>
                <div id={`section-${slot.id}`} hidden={!open}>
                  {open && (
                    <Suspense fallback={<p className="muted">Loading...</p>}>
                      <Body place={place} data={placeData} month={month} mode={mode} />
                    </Suspense>
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>
    </aside>
  );
  return mobile ? <BottomSheet>{panel}</BottomSheet> : panel;
}
