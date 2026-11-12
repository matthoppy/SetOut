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
  measurementDisclaimer:
    'I have measured this myself and the sizes above are correct. I understand the glass is toughened and made to these measurements, so it cannot be altered afterwards, and that if my measurements turn out to be wrong a replacement panel is a new order at my cost.',
};

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
    glassThicknessMm: settings.glassThicknessMm ?? DEFAULT_SETTINGS.glassThicknessMm,
    measurementDisclaimer: text(settings.measurementDisclaimer, DEFAULT_SETTINGS.measurementDisclaimer),
    ...(settings.intro ? { intro: settings.intro } : {}),
    ...(settings.turnstileSiteKey ? { turnstileSiteKey: settings.turnstileSiteKey } : {}),
    rules: ruleset,
  };
}

/** What a company calls its finishes and handles, and their CRL codes, from the designer a job came from. */
export interface OptionLabels {
  finishes: { id: string; label: string; code?: string }[];
  handles: { id: string; label: string; code?: string }[];
}

export async function optionLabelsFor(db: CompanyDb, job: Row<'jobs'>): Promise<OptionLabels> {
  const designer = job.designer_id ? await db.get('designers', job.designer_id) : (await db.find('designers', { limit: 1 }))[0];
  const { finishes, handles } = offeredOptions((designer?.config ?? {}) as DesignerSettings);
  const pick = (list: { id: string; label: string; code?: string }[]) => list.map(({ id, label, code }) => ({ id, label, ...(code ? { code } : {}) }));
  return { finishes: pick(finishes), handles: pick(handles) };
}
