/** Typed copy of styles/tokens.css for code that cannot read CSS variables (deck.gl, MapLibre, SVG). */
export type RGB = [number, number, number];

function hex(value: string): RGB {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const color = {
  ash: '#ECEEE9',
  surface: '#FBFBF8',
  well: '#EEF0EB',
  water: '#BACAD2',
  ink: '#1F2A2B',
  inkMuted: '#55615F',
  teal: '#16657D',
  ember: ['#F6D978', '#F0A848', '#DE6F36', '#BA4128', '#842320', '#46141A'] as const,
} as const;

export const rgb = {
  ink: hex(color.ink),
  teal: hex(color.teal),
  ember: color.ember.map(hex) as RGB[],
  /** Outline of active cells: the darkest ember step, so it reads warm and meets 3:1 (U4). */
  cellOutline: hex(color.ember[5]),
};

export const opacity = {
  /** Fill of the contribution cells (the place in focus). */
  cell: 0.9,
  /**
   * Fill by displayed resolution (D24): lighter as you zoom in, so roads, villages and names
   * show through where people look for their own place. The warm outline keeps the 3:1 edge.
   */
  cellByRes: { 3: 0.85, 4: 0.8, 5: 0.7, 6: 0.6 } as Record<number, number>,
  dimmed: 0.35,
  /**
   * Low-confidence values (D27): fill multiplied by this in the strip, calendar and map, so
   * their height or colour does not read as comparable with observed months.
   */
  lowConfidence: 0.4,
  outline: 0.6,
  grid: 0.11,
} as const;

/** The colour a fill shows over land at an opacity (for the legend swatches). */
export function overLand(hexColor: string, alpha: number): string {
  const a = hex(hexColor);
  const b = hex(color.ash);
  const mix = a.map((v, i) => Math.round(v * alpha + b[i]! * (1 - alpha)));
  return `rgb(${mix.join(' ')})`;
}
export const motion = { fast: 200, strip: 300 } as const;
