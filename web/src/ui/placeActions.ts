/** Place actions shared by search, presets and location. */
import { useApp } from '../state/store';

const round4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function choosePoint(lat: number, lon: number, label: string): void {
  const s = useApp.getState();
  s.flyTo({ center: [lon, lat], zoom: 9 });
  s.setPlace({ kind: 'point', lat: round4(lat), lon: round4(lon), label });
}

export function requestMyLocation(): void {
  const { notify } = useApp.getState();
  if (!('geolocation' in navigator)) {
    notify('This browser cannot share a location. Search or click the map instead.', 'error');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => choosePoint(pos.coords.latitude, pos.coords.longitude, 'My location'),
    (err) =>
      notify(
        err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. Search or click the map instead.'
          : 'Your location could not be found. Search or click the map instead.',
        'error',
      ),
    { timeout: 10000, maximumAge: 600000 },
  );
}
