/**
 * CRL's numbers for what the fitter takes, checked against Matt's copy of
 * CRL's catalogue (data/crl/): every number SetOut names is one CRL lists,
 * and a finish CRL does not make a part in is said, not guessed.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  applyTemplate,
  buildSpec,
  createInitialState,
  CRL_FINISHES,
  crlFinishCode,
  crlPartOf,
  DEFAULT_RULESET,
  fittingsOf,
  inCrlCatalogue,
  TEMPLATES,
  type Fitting,
  type HingeMount,
} from '../src';
import { CRL_CATALOGUE } from '../src/crl-catalogue';
import { GOLDEN_COMPANY, GOLDENS } from './goldens';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const catalogue = JSON.parse(readFileSync(join(root, 'data/crl/crl_shower_catalogue.json'), 'utf8')) as {
  products: { variants: { sku: string }[] }[];
};
const skus = new Set(catalogue.products.flatMap((p) => p.variants.map((v) => v.sku)));

const choices = (finishCode: string | null, glassMm = 10, handleCode: string | null = null) => ({ glassMm, finishCode, handleCode });
const hinges = (brand: string, mount: HingeMount): Fitting => ({ kind: 'hinges', pane: 0, count: 2, brand, mount });
const MOUNTS: HingeMount[] = ['wall-to-glass', 'glass-to-glass-180', 'glass-to-glass-90'];

describe("the engine's copy of the catalogue", () => {
  test('holds exactly the numbers in data/crl (run scripts/crl-catalogue.mjs when it changes)', () => {
    const held = new Set(CRL_CATALOGUE.split(/\s+/).filter(Boolean));
    expect(held.size).toBe(skus.size);
    expect([...skus].filter((s) => !held.has(s))).toEqual([]);
  });

  test('every finish code SetOut knows is one CRL uses', () => {
    for (const { code } of CRL_FINISHES) {
      expect([...skus].some((s) => s.endsWith(code)), code).toBe(true);
    }
  });
});

describe('finish codes', () => {
  test("a company's finish takes CRL's code for the finish of the same name", () => {
    expect(crlFinishCode({ label: 'Polished chrome' })).toBe('CH');
    expect(crlFinishCode({ label: 'Matt black' })).toBe('MBL');
    expect(crlFinishCode({ label: 'Antic brass' })).toBe('ABR');
    expect(crlFinishCode({ label: 'Oil-rubbed bronze' })).toBe('0RB');
  });

  test('the code a company sets wins, and a finish CRL has no name for has none', () => {
    expect(crlFinishCode({ label: 'Polished chrome', code: 'BSC' })).toBe('BSC');
    expect(crlFinishCode({ label: 'Brushed gold' })).toBeNull();
    expect(crlFinishCode(undefined)).toBeNull();
  });
});

describe('hinges', () => {
  test('a Geneva hinge to the wall is the offset back plate, in the shower’s finish', () => {
    expect(crlPartOf(hinges('Geneva', 'wall-to-glass'), choices('CH'))).toEqual({ status: 'found', code: 'GEN044CH' });
    expect(crlPartOf(hinges('Geneva', 'glass-to-glass-180'), choices('MBL'))).toEqual({ status: 'found', code: 'GEN180MBL' });
    expect(crlPartOf(hinges('Geneva', 'glass-to-glass-90'), choices('BN'))).toEqual({ status: 'found', code: 'GEN092BN' });
  });

  test('Vienna and Bellagio follow their own ranges', () => {
    expect(crlPartOf(hinges('Vienna', 'wall-to-glass'), choices('ULBR'))).toEqual({ status: 'found', code: 'V1E044ULBR' });
    expect(crlPartOf(hinges('Bellagio', 'wall-to-glass'), choices('SB'))).toEqual({ status: 'found', code: 'BEL344SB' });
    expect(crlPartOf(hinges('Bellagio', 'glass-to-glass-180'), choices('CH'))).toEqual({ status: 'found', code: 'BEL380CH' });
    expect(crlPartOf(hinges('Bellagio', 'glass-to-glass-90'), choices('BBRZ'))).toEqual({ status: 'found', code: 'BEL392BBRZ' });
  });

  test('every hinge SetOut hangs a door on is one CRL lists in polished chrome', () => {
    for (const brand of DEFAULT_RULESET.fixed.hinges.kits.map((k) => k.name)) {
      for (const mount of MOUNTS) {
        const part = crlPartOf(hinges(brand, mount), choices('CH'));
        expect(part?.status, `${brand} ${mount}`).toBe('found');
        if (part?.status === 'found') expect(skus.has(part.code)).toBe(true);
      }
    }
  });

  test('a finish CRL does not make the hinge in is said, with the number it would be', () => {
    expect(crlPartOf(hinges('Geneva', 'glass-to-glass-90'), choices('SC'))).toEqual({ status: 'not-in-finish', series: 'GEN092', code: 'GEN092SC' });
    expect(crlPartOf(hinges('Bellagio', 'wall-to-glass'), choices('0RB'))).toEqual({ status: 'not-in-finish', series: 'BEL344', code: 'BEL3440RB' });
  });

  test('without a finish code, the hinge is named by its range alone', () => {
    expect(crlPartOf(hinges('Geneva', 'wall-to-glass'), choices(null))).toEqual({ status: 'no-finish-code', series: 'GEN044' });
  });

  test('a hinge SetOut has no CRL range for is not named', () => {
    expect(crlPartOf(hinges('Other', 'wall-to-glass'), choices('CH'))).toBeNull();
  });
});

describe('seals, channel and handles', () => {
  test('a seal is clear, so it has one number for the glass it is on', () => {
    const seal = (s: string): Fitting => ({ kind: 'seal', pane: 0, seal: s, lengthMm: 1900 });
    expect(crlPartOf(seal('bubble seal'), choices('MBL'))).toEqual({ status: 'found', code: 'PCR10' });
    expect(crlPartOf(seal('90° stopper seal'), choices('MBL'))).toEqual({ status: 'found', code: 'PC1090' });
    expect(crlPartOf(seal('bubble seal'), choices('MBL', 8))).toEqual({ status: 'found', code: 'PCR8' });
    expect(crlPartOf(seal('90° stopper seal'), choices('MBL', 12))).toBeNull();
  });

  test('the channel is deep U-channel, brite anodised with chrome hardware', () => {
    const channel: Fitting = { kind: 'channel', lengthMm: 1800 };
    expect(crlPartOf(channel, choices('CH'))).toEqual({ status: 'found', code: 'SDCD38BA' });
    expect(crlPartOf(channel, choices('BN'))).toEqual({ status: 'found', code: 'SDCD38BN' });
    expect(crlPartOf(channel, choices('MBL', 12))).toEqual({ status: 'found', code: 'SDCD12MBL' });
    expect(crlPartOf(channel, choices('SC'))).toEqual({ status: 'not-in-finish', series: 'SDCD38', code: 'SDCD38SC' });
    expect(crlPartOf(channel, choices('CH', 8))).toBeNull();
  });

  test("a handle takes the company's number for it, in the shower's finish", () => {
    const handle: Fitting = { kind: 'handle', pane: 0, handleId: 'pull' };
    expect(crlPartOf(handle, choices('CH'))).toEqual({ status: 'no-handle-code' });
    expect(crlPartOf(handle, choices('CH', 10, 'BM8X8'))).toEqual({ status: 'found', code: 'BM8X8CH' });
    expect(crlPartOf(handle, choices('GM', 10, 'BM8X8'))).toEqual({ status: 'not-in-finish', series: 'BM8X8', code: 'BM8X8GM' });
    // A number that is already complete is used as it is.
    expect(crlPartOf(handle, choices('CH', 10, 'V1C8X8ULBR'))).toEqual({ status: 'found', code: 'V1C8X8ULBR' });
  });

  test('clamps and support are not chosen by SetOut, so are not named', () => {
    expect(crlPartOf({ kind: 'clamps' }, choices('CH'))).toBeNull();
    expect(crlPartOf({ kind: 'support-bar', reason: null }, choices('CH'))).toBeNull();
    expect(crlPartOf({ kind: 'support-panel', reason: null }, choices('CH'))).toBeNull();
  });
});

describe('every known design', () => {
  const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };
  test.each(GOLDENS.map((g) => [g.name, g] as const))('%s: every number named in chrome is in the catalogue', (_name, g) => {
    const state = structuredClone(g.document.design);
    const spec = buildSpec(state, context);
    for (const fitting of fittingsOf(state, spec, DEFAULT_RULESET.fixed)) {
      const part = crlPartOf(fitting, choices('CH', spec.glassThicknessMm, 'BM8X8'));
      if (part?.status === 'found') expect(inCrlCatalogue(part.code) && skus.has(part.code), part.code).toBe(true);
      if (fitting.kind === 'hinges' || fitting.kind === 'handle') expect(part?.status, fitting.kind).toBe('found');
    }
  });

  test('a door hung from the wall in an alcove, in matte black', () => {
    const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
    if (!template) throw new Error('no template');
    const state = applyTemplate(createInitialState(10), template);
    const spec = buildSpec(state, context);
    const codes = fittingsOf(state, spec, DEFAULT_RULESET.fixed).map((f) => {
      const part = crlPartOf(f, choices('MBL', 10, 'BM8X8'));
      return part?.status === 'found' ? part.code : null;
    });
    const brand = spec.panels[1].door!.hingeBrand;
    expect(codes).toEqual([brand === 'Geneva' ? 'GEN044MBL' : brand === 'Vienna' ? 'V1E044MBL' : 'BEL344MBL', 'BM8X8MBL', 'PC1090', 'SDCD38MBL']);
  });
});
