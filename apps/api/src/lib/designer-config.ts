/**
 * What a designer needs to know about its company: its name and colours, the
 * finishes and handles it offers, and its making rules.
 *
 * The public designer is sent this for its site key. Staff changing a design
 * in the workspace are sent the same, for the designer the job came from, so
 * the design is drawn and worked out exactly as the customer saw it.
 *
 * Everything in it is public. Where enquiries are emailed, and anything about
 * staff or prices, stays on the server.
 */

import {
  BELLAGIO_FITS,
  IN_LINE_HINGES,
  STANDARD_HINGES,
  VIENNA_CUTOUTS,
  WALL_HINGES,
  type BellagioFit,
  type HingeStyles,
  type InLineHinge,
  type ViennaCutout,
  type WallHinge,
} from '@setout/engine';
import { companyDb, type CompanyDb } from '../db/company-db';
import type { DesignerSettings } from '../db/platform';
import type { Row } from '../db/tables';

export const DEFAULT_SETTINGS: Required<Omit<DesignerSettings, 'intro' | 'turnstileSiteKey'>> = {
  finishes: [
    { id: 'chrome', label: 'Polished chrome', swatch: '#d4d8db' },
    { id: 'brushed-nickel', label: 'Brushed nickel', swatch: '#b0aaa2' },
    { id: 'matte-black', label: 'Matte black', swatch: '#1c1c1c' },
    { id: 'satin-brass', label: 'Satin brass', swatch: '#b5a26a' },
  ],
  handles: [
    { id: 'pull', label: 'Pull handle', description: 'Back-to-back bar handle, 203mm centres.' },
    { id: 'knob', label: 'Knob', description: 'Single round knob, centred at 950mm.' },
  ],
  glassThicknessMm: 10,
  glassThicknessesMm: [10],
  hinges: {},
  measurementDisclaimer:
    'I have measured this myself and the sizes above are correct. I understand the glass is toughened and made to these measurements, so it cannot be altered afterwards, and that if my measurements turn out to be wrong a replacement panel is a new order at my cost.',
};

/** The thicknesses SetOut makes showers in: those CRL's hinges take, Geneva's 8 to 12mm. */
export const GLASS_THICKNESSES = [8, 10, 12] as const;
export type Thickness = (typeof GLASS_THICKNESSES)[number];
export const isThickness = (value: unknown): value is Thickness => GLASS_THICKNESSES.includes(value as Thickness);

/** The glass a designer offers, thinnest first, and the thickness a new design starts at. */
export interface Glass {
  offered: Thickness[];
  standard: Thickness;
}

/**
 * The glass a designer offers: 10mm alone until the company chooses more, and
 * a new design always starts at one of those offered.
 */
export function glassOf(settings: DesignerSettings): Glass {
  const standard = isThickness(settings.glassThicknessMm) ? settings.glassThicknessMm : 10;
  const chosen = new Set<number>([standard, ...(settings.glassThicknessesMm ?? [])]);
  return { offered: GLASS_THICKNESSES.filter((t) => chosen.has(t)), standard };
}

/** The hinge styles a designer offers for each way a door hangs, in SetOut's order, the standard of each, and how Vienna's cut-out is made. */
export interface Hinges {
  wall: { offered: WallHinge[]; standard: WallHinge };
  inLine: { offered: InLineHinge[]; standard: InLineHinge };
  viennaCutout: ViennaCutout;
  bellagioFit: BellagioFit;
}

function choiceOf<T extends string>(all: readonly T[], stored: { offered?: unknown; standard?: unknown } | undefined, fallback: T) {
  const standard = all.includes(stored?.standard as T) ? (stored?.standard as T) : fallback;
  const chosen = new Set<unknown>([standard, ...(Array.isArray(stored?.offered) ? stored.offered : [])]);
  return { offered: all.filter((h) => chosen.has(h)), standard };
}

/**
 * The hinges a designer offers: the offset back plate to the wall and the
 * standard in-line hinge alone until the company chooses more, and a new
 * design always starts at one of those offered.
 */
export function hingesOf(settings: DesignerSettings): Hinges {
  return {
    wall: choiceOf(WALL_HINGES, settings.hinges?.wall, STANDARD_HINGES.wall),
    inLine: choiceOf(IN_LINE_HINGES, settings.hinges?.inLine, STANDARD_HINGES.inLine),
    viennaCutout: VIENNA_CUTOUTS.includes(settings.hinges?.viennaCutout as ViennaCutout)
      ? (settings.hinges?.viennaCutout as ViennaCutout)
      : STANDARD_HINGES.viennaCutout,
    bellagioFit: BELLAGIO_FITS.includes(settings.hinges?.bellagioFit as BellagioFit) ? (settings.hinges?.bellagioFit as BellagioFit) : STANDARD_HINGES.bellagioFit,
  };
}

/** Every hinge style, for staff, who may make any shower with any of them. */
export const ALL_HINGES = (hinges: Hinges): Hinges => ({
  wall: { offered: [...WALL_HINGES], standard: hinges.wall.standard },
  inLine: { offered: [...IN_LINE_HINGES], standard: hinges.inLine.standard },
  viennaCutout: hinges.viennaCutout,
  bellagioFit: hinges.bellagioFit,
});

const standardsOf = (hinges: Hinges): HingeStyles => ({
  wall: hinges.wall.standard,
  inLine: hinges.inLine.standard,
  viennaCutout: hinges.viennaCutout,
  bellagioFit: hinges.bellagioFit,
});

/** The hinges a shower takes when it has not chosen its own. */
export const standardHinges = (settings: DesignerSettings): HingeStyles => standardsOf(hingesOf(settings));

/** The colours a company's pages use until it chooses its own. */
export const BRANDING_DEFAULTS = { primary: '#1e293b', primaryForeground: '#ffffff' } as const;

type Finish = NonNullable<DesignerSettings['finishes']>[number];
type Handle = NonNullable<DesignerSettings['handles']>[number];

/** The finishes and handles a designer offers: its own, or SetOut's where it has none. */
export function offeredOptions(settings: DesignerSettings): { finishes: Finish[]; handles: Handle[] } {
  return {
    finishes: settings.finishes?.length ? settings.finishes : DEFAULT_SETTINGS.finishes,
    handles: settings.handles?.length ? settings.handles : DEFAULT_SETTINGS.handles,
  };
}

const text = (v: unknown, fallback: string): string => (typeof v === 'string' && v.length > 0 ? v : fallback);

/** The config for one of a company's designers, or null if there is no such designer. */
export async function designerConfig(env: Pick<Env, 'DB'>, companyId: string, designerId: string) {
  const db = companyDb(env, companyId);
  const [company, row, ruleset] = await Promise.all([db.company(), db.get('designers', designerId), db.rulesets.current()]);
  if (!company || !row) return null;

  const settings = row.config as DesignerSettings;
  const branding = company.branding;
  // The CRL codes are for the company's own sheets, not its customers.
  const { finishes, handles } = offeredOptions(settings);
  const glass = glassOf(settings);
  return {
    id: row.id,
    siteKey: row.site_key,
    brand: {
      name: company.name,
      ...(typeof branding.logoUrl === 'string' ? { logoUrl: branding.logoUrl } : {}),
      primary: text(branding.primary, BRANDING_DEFAULTS.primary),
      primaryForeground: text(branding.primaryForeground, BRANDING_DEFAULTS.primaryForeground),
    },
    finishes: finishes.map(({ id, label, swatch }) => ({ id, label, swatch })),
    handles: handles.map(({ id, label, description }) => ({ id, label, description })),
    glassThicknessMm: glass.standard,
    glassThicknesses: glass.offered,
    hinges: hingesOf(settings),
    measurementDisclaimer: text(settings.measurementDisclaimer, DEFAULT_SETTINGS.measurementDisclaimer),
    ...(settings.intro ? { intro: settings.intro } : {}),
    ...(settings.turnstileSiteKey ? { turnstileSiteKey: settings.turnstileSiteKey } : {}),
    rules: ruleset,
  };
}

/**
 * What a company calls its finishes and handles, and their CRL codes, and its
 * standard hinges, from the designer a job came from.
 */
export interface OptionLabels {
  finishes: { id: string; label: string; code?: string }[];
  handles: { id: string; label: string; code?: string }[];
  hinges: HingeStyles;
}

export async function optionLabelsFor(db: CompanyDb, job: Row<'jobs'>): Promise<OptionLabels> {
  const designer = job.designer_id ? await db.get('designers', job.designer_id) : (await db.find('designers', { limit: 1 }))[0];
  const settings = (designer?.config ?? {}) as DesignerSettings;
  const { finishes, handles } = offeredOptions(settings);
  const pick = (list: { id: string; label: string; code?: string }[]) => list.map(({ id, label, code }) => ({ id, label, ...(code ? { code } : {}) }));
  return { finishes: pick(finishes), handles: pick(handles), hinges: standardHinges(settings) };
}
