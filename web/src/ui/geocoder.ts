/**
 * Geocoder (plan 8.5, decision D14 default): Photon, 5 results, 4 s timeout.
 * Called only when the user presses Enter, because it sends the typed text to a third party.
 */
export interface GeoResult {
  name: string;
  detail: string;
  lat: number;
  lon: number;
}

const PHOTON = 'https://photon.komoot.io/api/';
const TIMEOUT_MS = 4000;

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
}

export class GeocoderOffline extends Error {}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const url = `${PHOTON}?q=${encodeURIComponent(query)}&limit=5&lang=en`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new GeocoderOffline(`HTTP ${res.status}`);
    const body = (await res.json()) as { features?: PhotonFeature[] };
    return (body.features ?? []).flatMap((f) => {
      const c = f.geometry?.coordinates;
      const p = f.properties ?? {};
      if (!c || !p.name) return [];
      const detail = [p.state, p.country].filter(Boolean).join(', ');
      return [{ name: p.name, detail, lat: c[1], lon: c[0] }];
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new GeocoderOffline(e instanceof Error ? e.message : 'offline');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
