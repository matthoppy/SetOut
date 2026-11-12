/**
 * What a designer knows about the company it is working for.
 *
 * It comes from the API, found by the designer's site key. Nothing about a
 * company is built into the designer: its name, colours, finishes, handles,
 * wording and its changes to the making rules all arrive here.
 *
 * It holds nothing private. Where an enquiry is emailed, what things cost and
 * who the staff are never reach the browser.
 */

import type { ConfiguratorState, GlassThickness, RulesetOverrides } from '@setout/engine';

export interface HardwareFinish {
  id: string;
  label: string;
  /** Swatch colour for the picker. */
  swatch: string;
}

export interface HandleOption {
  id: string;
  label: string;
  description: string;
}

export interface DesignerBrand {
  name: string;
  logoUrl?: string;
  /** CSS colour applied to primary actions and accents. */
  primary: string;
  primaryForeground: string;
}

export interface DesignerConfig {
  /** The designer's own id. Saved designs are kept under it in this browser. */
  id: string;
  /** The key the designer was opened with, or null for the preview. */
  siteKey: string | null;
  brand: DesignerBrand;
  finishes: HardwareFinish[];
  handles: HandleOption[];
  /** The thickness a new design starts at. */
  glassThicknessMm: GlassThickness;
  /** Every thickness the customer may choose, thinnest first. Older servers send only the one above. */
  glassThicknesses?: GlassThickness[];
  /**
   * Shown on the review step and repeated to the company. Spells out who is
   * responsible for the measurements being right, which matters when glass is
   * cut from them.
   */
  measurementDisclaimer: string;
  /** Optional line under the heading. */
  intro?: string;
  /** Cloudflare Turnstile site key. Public by design. Unset skips the check. */
  turnstileSiteKey?: string;
  /**
   * The company's changes to the making rules, so this page cuts to the same
   * numbers the server will.
   */
  rules: { version: number; overrides: RulesetOverrides };
}

/**
 * The designer with no company behind it, for trying it out. Everything
 * works except sending.
 */
export const PREVIEW_CONFIG: DesignerConfig = {
  id: 'preview',
  siteKey: null,
  brand: { name: 'Your company', primary: '#1e293b', primaryForeground: '#ffffff' },
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
  glassThicknesses: [8, 10, 12],
  measurementDisclaimer:
    'I have measured this myself and the sizes above are correct. I understand the glass is toughened and made to these measurements, so it cannot be altered afterwards, and that if my measurements turn out to be wrong a replacement panel is a new order at my cost.',
  intro: 'Design your enclosure and send the measurements straight to the workshop.',
  rules: { version: 0, overrides: {} },
};

export class ConfigError extends Error {}

/** The configuration for a site key, or the preview when there is none. */
export async function loadConfig(siteKey: string | null): Promise<DesignerConfig> {
  if (!siteKey) return PREVIEW_CONFIG;
  let response: Response;
  try {
    response = await fetch(`/api/designer/config?key=${encodeURIComponent(siteKey)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ConfigError('We could not reach the designer. Check your connection and try again.');
  }
  if (response.status === 404) {
    throw new ConfigError('This designer is not set up. The site key on this page is not one we know.');
  }
  if (!response.ok) {
    throw new ConfigError('The designer could not start. Please try again in a moment.');
  }
  return (await response.json()) as DesignerConfig;
}

/**
 * A new design starts with the first finish and the first handle the company
 * offers, so one it has stopped offering is never chosen for the customer.
 */
export function withOfferedHardware(state: ConfiguratorState, config: Pick<DesignerConfig, 'finishes' | 'handles'>): ConfiguratorState {
  return {
    ...state,
    finishId: config.finishes[0]?.id ?? state.finishId,
    handleId: config.handles[0]?.id ?? state.handleId,
  };
}

/** The thicknesses on offer: always at least the one a new design starts at. */
export function thicknessesOf(config: Pick<DesignerConfig, 'glassThicknessMm' | 'glassThicknesses'>): GlassThickness[] {
  const offered = config.glassThicknesses ?? [];
  return offered.includes(config.glassThicknessMm) ? offered : [config.glassThicknessMm];
}

export function finishLabel(config: DesignerConfig, id: string): string {
  return config.finishes.find((f) => f.id === id)?.label ?? id;
}

export function handleLabel(config: DesignerConfig, id: string): string {
  return config.handles.find((h) => h.id === id)?.label ?? id;
}
