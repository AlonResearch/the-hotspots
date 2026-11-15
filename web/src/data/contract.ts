/**
 * Data contract, version 1 (MVP Implementation Plan, section 4).
 * The same schemas type the app, check the fixtures and check the real build.
 */
import { z } from 'zod';

export const CONTRACT_VERSION = 1;

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const H3_RE = /^[0-9a-f]{15}$/;

export const Month = z.string().regex(MONTH_RE, 'expected a month as YYYY-MM');
export const H3Id = z.string().regex(H3_RE, 'expected a 15-character lowercase hex H3 id');
const Value = z.number().finite().nonnegative();
const Values = z.array(Value);

export const SAT_KEYS = ['terra', 'aqua', 'snpp', 'noaa20', 'noaa21'] as const;
export type SatKey = (typeof SAT_KEYS)[number];
export const Sat = z.partialRecord(z.enum(SAT_KEYS), Values);

export const MonthStatus = z.enum(['estimated', 'provisional']);
export type MonthStatusValue = z.infer<typeof MonthStatus> | 'observed';

/** Months as text compare correctly as strings because they are zero padded. */
function monthLe(a: string, b: string): boolean {
  return a <= b;
}

/**
 * Optional daily fields (plan 4.6, "v1 optional daily fields (proposed)", written by the data
 * build). Only for the areas of manifest.daily; absent elsewhere and in older builds, and the
 * app then hides every daily control. Days are UTC acquisition dates; day d is bit d - 1.
 */
const BBox = z
  .tuple([z.number(), z.number(), z.number(), z.number()])
  .refine(([w, s, e, n]) => w < e && s < n, 'bbox must be [west, south, east, north]');
export const DailyArea = z.object({ name: z.string().min(1), bbox: BBox });
export type DailyArea = z.infer<typeof DailyArea>;
export const ManifestDaily = z.object({
  areas: z.array(DailyArea).min(1),
  res6_cells: z.number().int().nonnegative(),
  days: z.literal('utc'),
});
/** A day mask: 31 bits, bit d - 1 for day d. */
const Mask = z
  .number()
  .int()
  .min(0)
  .max(2 ** 31 - 1);

export const Manifest = z
  .object({
    contract_version: z.literal(CONTRACT_VERSION),
    source: z.enum(['fixture', 'firms']),
    built_at: z.string().min(1),
    data_through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a date as YYYY-MM-DD'),
    atom_res: z.literal(6),
    record: z.object({ start: Month, end: Month }),
    first_reference_month: Month,
    status_ranges: z.array(z.object({ from: Month, to: Month, status: MonthStatus })),
    partial_months: z.array(
      z.object({
        month: Month,
        days_covered: z.number().int().nonnegative(),
        days_in_month: z.number().int().min(28).max(31),
      }),
    ),
    seams: z.array(z.object({ month: Month, label: z.string().min(1) })),
    known_issues: z.array(
      z.object({
        from: Month,
        to: Month,
        satellite: z.enum(SAT_KEYS).optional(),
        note: z.string().min(1),
      }),
    ),
    baseline: z.object({
      start_year: z.number().int(),
      end_year: z.number().int(),
      min_years: z.number().int().positive(),
      exclude_target_year: z.boolean(),
    }),
    classes: z.object({
      p_low: z.number().min(0).max(100),
      p_high: z.number().min(0).max(100),
      p_very_high: z.number().min(0).max(100),
      min_normal_for_ratio: z.number().nonnegative(),
    }),
    ladder: z
      .array(
        z.object({
          res: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
          min_zoom: z.number(),
          source: z.enum(['overview', 'detail']),
        }),
      )
      .min(1),
    ladder_hysteresis: z.number().nonnegative(),
    overview: z.object({ r5_parts: z.array(H3Id) }),
    detail: z.object({
      tile_res: z.number().int().min(0).max(5),
      max_place_cells: z.number().int().positive(),
    }),
    color: z.object({ density_breaks: z.array(z.number().positive()).length(5) }),
    method: z.object({
      version: z.string().min(1),
      reference: z.string(),
      transfer: z.string(),
      viirs_group: z.string(),
      filters: z.string(),
      notes: z.array(z.string()).optional(),
    }),
    daily: ManifestDaily.optional(),
  })
  .superRefine((m, ctx) => {
    if (!monthLe(m.record.start, m.record.end)) {
      ctx.addIssue({ code: 'custom', path: ['record'], message: 'record.start is after end' });
    }
    if (m.baseline.start_year > m.baseline.end_year) {
      ctx.addIssue({ code: 'custom', path: ['baseline'], message: 'start_year is after end_year' });
    }
    const { p_low, p_high, p_very_high } = m.classes;
    if (!(p_low < p_high && p_high < p_very_high)) {
      ctx.addIssue({
        code: 'custom',
        path: ['classes'],
        message: 'need p_low < p_high < p_very_high',
      });
    }
    const ranges = [...m.status_ranges].sort((a, b) => a.from.localeCompare(b.from));
    ranges.forEach((r, i) => {
      if (!monthLe(r.from, r.to)) {
        ctx.addIssue({ code: 'custom', path: ['status_ranges', i], message: 'from is after to' });
      }
      const next = ranges[i + 1];
      if (next && !(r.to < next.from)) {
        ctx.addIssue({ code: 'custom', path: ['status_ranges'], message: 'ranges overlap' });
      }
    });
    m.ladder.forEach((l, i) => {
      const prev = m.ladder[i - 1];
      if (prev && !(prev.min_zoom < l.min_zoom && prev.res < l.res)) {
        ctx.addIssue({
          code: 'custom',
          path: ['ladder', i],
          message: 'ladder must ascend in min_zoom and res',
        });
      }
    });
    const b = m.color.density_breaks;
    b.forEach((v, i) => {
      const prev = b[i - 1];
      if (prev !== undefined && !(prev < v)) {
        ctx.addIssue({
          code: 'custom',
          path: ['color', 'density_breaks', i],
          message: 'breaks must ascend',
        });
      }
    });
  });
export type Manifest = z.infer<typeof Manifest>;

type Ctx = z.RefinementCtx;

function sameLength(ctx: Ctx, n: number, arrays: Record<string, unknown[] | undefined>): void {
  for (const [key, arr] of Object.entries(arrays)) {
    if (arr && arr.length !== n) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `length ${arr.length}, expected ${n}`,
      });
    }
  }
}

function bandOrder(ctx: Ctx, v: { h: number[]; lo: number[]; hi: number[] }, eps = 1e-9): void {
  for (let i = 0; i < v.h.length; i++) {
    const h = v.h[i]!;
    const lo = v.lo[i];
    const hi = v.hi[i];
    if (lo !== undefined && lo > h + eps) {
      ctx.addIssue({ code: 'custom', path: ['lo', i], message: `lo ${lo} is above h ${h}` });
      return;
    }
    if (hi !== undefined && hi < h - eps) {
      ctx.addIssue({ code: 'custom', path: ['hi', i], message: `hi ${hi} is below h ${h}` });
      return;
    }
  }
}

function satArrays(sat: z.infer<typeof Sat> | undefined): Record<string, number[] | undefined> {
  const out: Record<string, number[] | undefined> = {};
  if (!sat) return out;
  for (const k of SAT_KEYS) if (sat[k]) out[`sat.${k}`] = sat[k];
  return out;
}

export const Overview = z
  .object({
    month: Month,
    res: z.union([z.literal(3), z.literal(4), z.literal(5)]),
    cell: z.array(H3Id),
    h: Values,
    lo: Values,
    hi: Values,
    modis: Values,
    viirs: Values,
    cls: z.array(z.number().int().min(0).max(7)).optional(),
    /** idx: positions in cell; d[k]: [day, value] pairs of cell idx[k], missing days are 0. */
    daily: z
      .object({
        idx: z.array(z.number().int().nonnegative()),
        d: z.array(z.array(z.tuple([z.number().int().min(1).max(31), Value]))),
      })
      .optional(),
  })
  .superRefine((o, ctx) => {
    sameLength(ctx, o.cell.length, {
      h: o.h,
      lo: o.lo,
      hi: o.hi,
      modis: o.modis,
      viirs: o.viirs,
      cls: o.cls,
    });
    bandOrder(ctx, o);
    if (o.daily) {
      const { idx, d } = o.daily;
      if (d.length !== idx.length) {
        ctx.addIssue({ code: 'custom', path: ['daily', 'd'], message: 'length differs from idx' });
      }
      idx.forEach((i, k) => {
        if (i >= o.cell.length || (k > 0 && !(idx[k - 1]! < i))) {
          ctx.addIssue({
            code: 'custom',
            path: ['daily', 'idx', k],
            message: 'idx must ascend and point into cell',
          });
        }
      });
    }
  });
export type Overview = z.infer<typeof Overview>;

export const DetailIndex = z.object({
  tile_res: z.number().int().min(0).max(5),
  tiles: z.array(H3Id),
});
export type DetailIndex = z.infer<typeof DetailIndex>;

export const DetailTile = z
  .object({
    parent: H3Id,
    res: z.literal(6),
    start: Month,
    n_months: z.number().int().positive(),
    cells: z.array(H3Id),
    offsets: z.array(z.number().int().nonnegative()),
    mi: z.array(z.number().int().nonnegative()),
    h: Values,
    lo: Values,
    hi: Values,
    modis: Values,
    viirs: Values,
    sat: Sat.optional(),
    /** rows: row positions (aligned with mi) of the area's res 6 cells; masks aligned with rows. */
    daily: z
      .object({
        rows: z.array(z.number().int().nonnegative()),
        dm_modis: z.array(Mask),
        dm_snpp: z.array(Mask),
        dm_noaa20: z.array(Mask),
      })
      .optional(),
  })
  .superRefine((t, ctx) => {
    const n = t.mi.length;
    if (t.daily) {
      const { rows } = t.daily;
      sameLength(ctx, rows.length, {
        'daily.dm_modis': t.daily.dm_modis,
        'daily.dm_snpp': t.daily.dm_snpp,
        'daily.dm_noaa20': t.daily.dm_noaa20,
      });
      rows.forEach((r, k) => {
        if (r >= n || (k > 0 && !(rows[k - 1]! < r))) {
          ctx.addIssue({
            code: 'custom',
            path: ['daily', 'rows', k],
            message: 'rows must ascend and point into mi',
          });
        }
      });
    }
    sameLength(ctx, n, {
      h: t.h,
      lo: t.lo,
      hi: t.hi,
      modis: t.modis,
      viirs: t.viirs,
      ...satArrays(t.sat),
    });
    if (t.offsets.length !== t.cells.length + 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['offsets'],
        message: `length ${t.offsets.length}, expected cells.length + 1 = ${t.cells.length + 1}`,
      });
      return;
    }
    if (t.offsets[0] !== 0 || t.offsets[t.offsets.length - 1] !== n) {
      ctx.addIssue({
        code: 'custom',
        path: ['offsets'],
        message: `must start at 0 and end at mi.length (${n})`,
      });
      return;
    }
    for (let k = 0; k < t.cells.length; k++) {
      if (k > 0 && !(t.cells[k - 1]! < t.cells[k]!)) {
        ctx.addIssue({
          code: 'custom',
          path: ['cells', k],
          message: 'cells must be sorted ascending and unique',
        });
        return;
      }
      const a = t.offsets[k]!;
      const b = t.offsets[k + 1]!;
      if (b < a) {
        ctx.addIssue({
          code: 'custom',
          path: ['offsets', k + 1],
          message: 'offsets must not decrease',
        });
        return;
      }
      for (let i = a; i < b; i++) {
        const m = t.mi[i]!;
        if (m >= t.n_months) {
          ctx.addIssue({
            code: 'custom',
            path: ['mi', i],
            message: `month index ${m} is not below n_months`,
          });
          return;
        }
        if (i > a && !(t.mi[i - 1]! < m)) {
          ctx.addIssue({
            code: 'custom',
            path: ['mi', i],
            message: `mi must ascend within cell ${t.cells[k]}`,
          });
          return;
        }
      }
    }
    bandOrder(ctx, t);
  });
export type DetailTile = z.infer<typeof DetailTile>;

export const Summary = z
  .object({
    start: Month,
    n_months: z.number().int().positive(),
    h: Values,
    lo: Values,
    hi: Values,
    modis: Values,
    viirs: Values,
    sat: Sat.optional(),
    daily_areas: z
      .array(
        z.object({
          name: z.string().min(1),
          bbox: BBox,
          res6_cells: z.number().int().nonnegative(),
          daily_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          daily_h: Values,
        }),
      )
      .optional(),
  })
  .superRefine((s, ctx) => {
    sameLength(ctx, s.n_months, {
      h: s.h,
      lo: s.lo,
      hi: s.hi,
      modis: s.modis,
      viirs: s.viirs,
      ...satArrays(s.sat),
    });
    bandOrder(ctx, s);
  });
export type Summary = z.infer<typeof Summary>;

export const PresetPlace = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export const Places = z.array(PresetPlace);
export type PresetPlace = z.infer<typeof PresetPlace>;

/** method.json "daily": the split rule's inputs. Other keys (rule text, labels) are kept as text. */
export const MethodDaily = z.object({
  noaa20_scale_applied: z.boolean(),
  /** Per month from first_reference_month: the weight of each VIIRS satellite in the mean. */
  viirs_weights: z.record(
    Month,
    z.object({
      snpp: z.number().nonnegative().optional(),
      noaa20: z.number().nonnegative().optional(),
    }),
  ),
});
export type MethodDaily = z.infer<typeof MethodDaily>;

export const MethodTables = z.object({
  ratios: z.array(
    z.object({
      region: z.string().min(1),
      season: z.string().min(1),
      ratio: z.number().finite(),
      lo: z.number().finite(),
      hi: z.number().finite(),
      n_years: z.number().int().nonnegative(),
    }),
  ),
  loyo: z.array(
    z.object({
      scale: z.enum(['res6', 'ring7', 'res5', 'res4', 'region']),
      bias: z.number().finite(),
      mae: z.number().finite(),
      n: z.number().int().nonnegative(),
      /** Share of active unit-months where MODIS saw nothing and S-NPP saw fire (D27). */
      zero_pred_share: z.number().finite().optional(),
      /** 75th percentiles of predicted and observed values over the non-zero ones. */
      p75_pred: z.number().finite().optional(),
      p75_obs: z.number().finite().optional(),
    }),
  ),
  daily: MethodDaily.optional(),
});
export type MethodTables = z.infer<typeof MethodTables>;

/** Paths of the contract files, relative to the data base folder. */
export const paths = {
  manifest: 'manifest.json',
  overview: (res: 3 | 4, month: string) => `overview/r${res}/${month}.json`,
  overviewR5: (part: string, month: string) => `overview/r5/${part}/${month}.json`,
  detailIndex: 'detail/index.json',
  detailTile: (parent: string) => `detail/${parent}.json`,
  summary: 'summary/global.json',
  places: 'places.json',
  method: 'method.json',
} as const;

/** Formats a zod error as readable lines with the path of each issue. */
export function formatIssues(error: z.ZodError): string {
  return z.prettifyError(error);
}
