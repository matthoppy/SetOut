/**
 * CRL's catalogue numbers for what the fitter takes.
 *
 * Geneva, Vienna and Bellagio are CRL's own hinge ranges, so a hinge's number
 * follows from its range and how it fixes, and a finish adds CRL's code for
 * it: GEN044 + CH is a polished chrome Geneva hinge to the wall. Wall hinges
 * are the offset back plate (044, Bellagio 344), as Custom Showers fits them.
 * Seals are clear and have no finish. The channel is CRL's deep U-channel in
 * 2.41m lengths: it is aluminium, which is never chromed, so polished chrome
 * hardware has its channel brite anodised.
 *
 * A company names its finishes and handles itself. A finish takes CRL's code
 * for the finish of the same name, unless the company has set its own; a
 * handle has a number only once the company has set one.
 *
 * Every number is looked up in Matt's copy of CRL's catalogue, so where CRL
 * does not list a part in a finish, the sheet says so rather than guessing.
 */

import { CRL_CATALOGUE } from './crl-catalogue';
import type { Fitting, HingeMount } from './fittings';

/** CRL's finish codes, by CRL's name for each. */
export const CRL_FINISHES: readonly { code: string; name: string }[] = [
  { code: 'CH', name: 'Polished chrome' },
  { code: 'SC', name: 'Satin chrome' },
  { code: 'BSC', name: 'Brushed satin chrome' },
  { code: 'BN', name: 'Brushed nickel' },
  { code: 'PN', name: 'Polished nickel' },
  { code: 'SN', name: 'Satin nickel' },
  { code: 'MBL', name: 'Matte black' },
  { code: 'GM', name: 'Gun metal' },
  { code: 'BR', name: 'Polished brass' },
  { code: 'SB', name: 'Satin brass' },
  { code: 'BB', name: 'Brushed brass' },
  { code: 'ULBR', name: 'Unlacquered brass' },
  { code: 'ABR', name: 'Antique brass' },
  { code: 'BAB', name: 'Brushed antique brass' },
  { code: 'ABRZ', name: 'Antique bronze' },
  { code: 'BBRZ', name: 'Brushed bronze' },
  { code: '0RB', name: 'Oil rubbed bronze' },
  { code: 'GP', name: 'Gold plated' },
  { code: 'AW', name: 'All white' },
];

/** How a finish code may be written: CRL's are capitals and digits, such as MBL or 0RB. */
export const CRL_CODE = /^[0-9A-Z]{1,12}$/;

const squash = (name: string) =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z]/g, '');

/** CRL's names, and the other ways the same finishes are written. */
const FINISH_BY_NAME = new Map<string, string>([
  ...CRL_FINISHES.map((f): [string, string] => [squash(f.name), f.code]),
  ['chrome', 'CH'],
  ['mattblack', 'MBL'],
  ['anticbrass', 'ABR'],
]);

/** The finish code for a company's finish: the one it has set, or CRL's for a finish of the same name. */
export function crlFinishCode(finish: { label: string; code?: string } | undefined): string | null {
  if (!finish) return null;
  if (finish.code) return finish.code;
  return FINISH_BY_NAME.get(squash(finish.label)) ?? null;
}

let catalogue: Set<string> | null = null;

/** Whether a catalogue number is in Matt's copy of CRL's catalogue. */
export function inCrlCatalogue(code: string): boolean {
  catalogue ??= new Set(CRL_CATALOGUE.split(/\s+/).filter(Boolean));
  return catalogue.has(code);
}

const HINGES: Record<string, Record<HingeMount, string>> = {
  Geneva: { 'wall-to-glass': 'GEN044', 'glass-to-glass-180': 'GEN180', 'glass-to-glass-90': 'GEN092' },
  Vienna: { 'wall-to-glass': 'V1E044', 'glass-to-glass-180': 'V1E180', 'glass-to-glass-90': 'V1E092' },
  Bellagio: { 'wall-to-glass': 'BEL344', 'glass-to-glass-180': 'BEL380', 'glass-to-glass-90': 'BEL392' },
};

/** By the seal SetOut gives a door and the glass it is on. */
const SEALS: Record<string, Partial<Record<number, string>>> = {
  'bubble seal': { 8: 'PCR8', 10: 'PCR10', 12: 'PCR12' },
  '90° stopper seal': { 8: 'PC0890', 10: 'PC1090' },
};

/** Deep U-channel, 2.41m lengths. */
const CHANNEL: Partial<Record<number, string>> = { 10: 'SDCD38', 12: 'SDCD12' };

/** Aluminium is anodised, not chromed: the finish CRL makes channel in to go with chrome. */
const ALUMINIUM: Record<string, string> = { CH: 'BA' };

export type CrlPart =
  /** The number to order. */
  | { status: 'found'; code: string }
  /** The part's number before its finish: the shower's finish has no CRL code yet. */
  | { status: 'no-finish-code'; series: string }
  /** CRL's catalogue has no such part in the shower's finish. `code` is the number it would be. */
  | { status: 'not-in-finish'; series: string; code: string }
  /** The handle has no CRL number yet. */
  | { status: 'no-handle-code' };

export interface CrlChoices {
  glassMm: number;
  /** CRL's code for the shower's finish, if it has one. */
  finishCode: string | null;
  /** CRL's number for the shower's handle, without its finish, if the company has set one. */
  handleCode: string | null;
}

/** A part made in finishes: its number in the shower's finish, if CRL lists one. */
function inFinish(series: string, finishCode: string | null, alternatives: Record<string, string> = {}): CrlPart {
  if (!finishCode) return { status: 'no-finish-code', series };
  for (const finish of [finishCode, alternatives[finishCode]]) {
    if (finish && inCrlCatalogue(series + finish)) return { status: 'found', code: series + finish };
  }
  return { status: 'not-in-finish', series, code: series + finishCode };
}

/**
 * CRL's number for a fitting, or null where SetOut does not choose the part
 * (the clamps, a support bar or panel, a seal for a glass CRL has none for).
 */
export function crlPartOf(fitting: Fitting, choices: CrlChoices): CrlPart | null {
  switch (fitting.kind) {
    case 'hinges': {
      const series = HINGES[fitting.brand]?.[fitting.mount];
      return series ? inFinish(series, choices.finishCode) : null;
    }
    case 'handle': {
      if (!choices.handleCode) return { status: 'no-handle-code' };
      // A handle CRL makes in one finish only has no finish code on the end.
      if (inCrlCatalogue(choices.handleCode)) return { status: 'found', code: choices.handleCode };
      return inFinish(choices.handleCode, choices.finishCode);
    }
    case 'seal': {
      const code = SEALS[fitting.seal]?.[choices.glassMm];
      return code ? { status: 'found', code } : null;
    }
    case 'channel': {
      const series = CHANNEL[choices.glassMm];
      return series ? inFinish(series, choices.finishCode, ALUMINIUM) : null;
    }
    case 'clamps':
    case 'support-bar':
    case 'support-panel':
      return null;
  }
}
