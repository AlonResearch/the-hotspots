/**
 * Parses "lat, lon" in decimal degrees (plan 8.5), also with N/S/E/W:
 * "37.6, 14.2", "37.6 14.2", "37.6N 14.2E", "11.5 S, 54.5 W", "-11.5,-54.5".
 */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const t = text.trim().toUpperCase().replace(/°/g, ' ');
  const m = t.match(/^([+-]?\d+(?:\.\d+)?)\s*([NS])?\s*[,;\s]\s*([+-]?\d+(?:\.\d+)?)\s*([EW])?$/);
  if (!m) return null;
  let lat = Number(m[1]);
  let lon = Number(m[3]);
  const ns = m[2];
  const ew = m[4];
  if (ns === 'S') lat = -Math.abs(lat);
  if (ns === 'N') lat = Math.abs(lat);
  if (ew === 'W') lon = -Math.abs(lon);
  if (ew === 'E') lon = Math.abs(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function formatCoordinates(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}
