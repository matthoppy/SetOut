/**
 * CRL's photos: the files checked in, the engine's list of them and Matt's
 * copy of the catalogue agree, and the right photo is chosen for a hinge
 * style, a range and a finish, and for a handle.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  crlFinishCode,
  crlPhotoInFinish,
  crlPhotoOf,
  DEFAULT_RULESET,
  doorHingeOf,
  handlePhotoOf,
  hingePhotoOf,
  IN_LINE_HINGE_STYLES,
  IN_LINE_HINGES,
  STANDARD_HINGES,
  WALL_HINGE_STYLES,
  WALL_HINGES,
  type HingeMount,
} from '../src';
import { CRL_PHOTOS } from '../src/crl-photos';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const folder = join(root, 'apps/designer/public/assets/crl');
const catalogue = JSON.parse(readFileSync(join(root, 'data/crl/crl_shower_catalogue.json'), 'utf8')) as {
  products: { category: string; category_path: string; also_listed_under: string; variants: { sku: string; image_file: string | null }[] }[];
};
const skus = new Set(catalogue.products.flatMap((p) => p.variants.map((v) => v.sku)));

const lines = CRL_PHOTOS.split('\n')
  .filter(Boolean)
  .map((line) => line.split(' '));
const listed = new Map(lines.flatMap(([file, ...codes]) => codes.map((code): [string, string] => [code, file])));
const MOUNTS: HingeMount[] = ['wall-to-glass', 'glass-to-glass-180', 'glass-to-glass-90'];
const STYLES = [...WALL_HINGES.map((id) => WALL_HINGE_STYLES[id]), ...IN_LINE_HINGES.map((id) => IN_LINE_HINGE_STYLES[id])];

describe('the photos checked in (run scripts/crl-photos.mjs when the catalogue or the hinges change)', () => {
  test('are exactly the files the engine lists, each a small WebP', () => {
    const files = readdirSync(folder).sort();
    expect(files).toEqual(lines.map(([file]) => `${file}.webp`).sort());
    for (const file of files) {
      const bytes = readFileSync(join(folder, file));
      expect(bytes.subarray(0, 4).toString('latin1') + bytes.subarray(8, 12).toString('latin1'), file).toBe('RIFFWEBP');
      expect(statSync(join(folder, file)).size, file).toBeLessThan(40_000);
    }
    expect(files.reduce((n, file) => n + statSync(join(folder, file)).size, 0)).toBeLessThan(2_000_000);
  });

  test('are listed only against numbers in CRL’s catalogue, each once', () => {
    expect(listed.size).toBe(lines.reduce((n, [, ...codes]) => n + codes.length, 0));
    expect([...listed.keys()].filter((code) => !skus.has(code))).toEqual([]);
  });

  test('cover every hinge SetOut names, in every finish CRL lists it in', () => {
    const series = new Set<string>(STYLES.flatMap((s) => [s.Geneva, s.Vienna]).filter((s): s is string => !!s));
    for (const kit of DEFAULT_RULESET.fixed.hinges.kits) {
      for (const mount of MOUNTS) {
        const only = doorHingeOf(kit.name, mount, STANDARD_HINGES).series;
        if (only) series.add(only);
      }
    }
    expect(series.size).toBe(27);
    for (const s of series) {
      const family = catalogue.products.find((p) => p.variants.some((v) => v.sku === `${s}CH`) || p.variants.every((v) => v.sku.startsWith(s)));
      expect(family, s).toBeDefined();
      for (const v of family!.variants) expect(listed.has(v.sku), v.sku).toBe(true);
      expect(crlPhotoInFinish(s, null), s).not.toBeNull();
    }
  });

  test('cover every pull handle and knob that has a photo in the catalogue', () => {
    const handles = catalogue.products
      .filter((p) => [p.category, p.category_path, p.also_listed_under].some((text) => (text ?? '').includes('Pull Handles and Knobs')))
      .flatMap((p) => p.variants);
    expect(handles.length).toBeGreaterThan(200);
    expect(handles.filter((v) => v.image_file && !listed.has(v.sku)).map((v) => v.sku)).toEqual([]);
  });
});

describe('the photo for a hinge', () => {
  const offset = WALL_HINGE_STYLES.offset;

  test('is the one CRL shows for the hinge in the shower’s finish', () => {
    expect(hingePhotoOf(offset, 'Geneva', 'MBL')).toEqual({ file: listed.get('GEN044MBL'), code: 'GEN044MBL', range: 'Geneva' });
    expect(hingePhotoOf(offset, 'Vienna', 'ULBR')).toEqual({ file: listed.get('V1E044ULBR'), code: 'V1E044ULBR', range: 'Vienna' });
    expect(hingePhotoOf(IN_LINE_HINGE_STYLES.standard, 'Geneva', crlFinishCode({ label: 'Satin brass' }))?.code).toBe('GEN180SB');
  });

  test('is polished chrome where CRL does not make the hinge in that finish, or the finish has no CRL code', () => {
    // Geneva's offset back plate is not made in gun metal.
    expect(hingePhotoOf(offset, 'Geneva', 'GM')?.code).toBe('GEN044CH');
    expect(hingePhotoOf(offset, 'Geneva', crlFinishCode({ label: 'Brushed gold' }))?.code).toBe('GEN044CH');
    expect(hingePhotoOf(offset, 'Geneva', null)?.code).toBe('GEN044CH');
  });

  test('is in the finish CRL does make it in where that is not chrome either', () => {
    expect(hingePhotoOf(WALL_HINGE_STYLES['offset-preset'], 'Geneva', 'CH')?.code).toBe('GEN544MBL');
    expect(hingePhotoOf(WALL_HINGE_STYLES['positive-close'], 'Vienna', 'SB')?.code).toBe('V1E067BN');
  });

  test('is from the range the door hangs on, or the range that makes the style', () => {
    expect(hingePhotoOf(offset, 'Vienna', 'CH')?.range).toBe('Vienna');
    // Only Vienna makes a positive close hinge, so that is the one pictured.
    expect(hingePhotoOf(WALL_HINGE_STYLES['positive-close'], 'Geneva', 'BN')).toMatchObject({ code: 'V1E067BN', range: 'Vienna' });
    // Bellagio has no styles, and a company's settings have no door in mind: Geneva's is shown.
    expect(hingePhotoOf(offset, 'Bellagio', 'CH')?.code).toBe('GEN044CH');
    expect(hingePhotoOf(offset, null, null)?.code).toBe('GEN044CH');
  });

  test('exists for every style, in every range that makes it', () => {
    for (const style of STYLES) {
      for (const range of ['Geneva', 'Vienna'] as const) {
        const photo = hingePhotoOf(style, range, 'CH');
        expect(photo, `${style.name} ${range}`).not.toBeNull();
        if (style[range]) expect(photo!.code.startsWith(style[range]), photo!.code).toBe(true);
      }
    }
  });
});

describe('the photo for a handle', () => {
  test('is found from the number its company set, in the shower’s finish or polished chrome', () => {
    expect(handlePhotoOf('BM8X8', 'MBL')).toEqual({ file: listed.get('BM8X8MBL'), code: 'BM8X8MBL' });
    expect(handlePhotoOf('BM8X8', 'GM')?.code).toBe('BM8X8CH');
    expect(handlePhotoOf('BM8X8', null)?.code).toBe('BM8X8CH');
  });

  test('is found from a whole number, for a handle CRL makes in one finish', () => {
    expect(handlePhotoOf('SDK061', 'MBL')?.code).toBe('SDK061');
    expect(handlePhotoOf('BM8X8CH', 'MBL')?.code).toBe('BM8X8CH');
  });

  test('is nothing for a handle with no number, or a number CRL has no photo for', () => {
    expect(handlePhotoOf(undefined, 'CH')).toBeNull();
    expect(handlePhotoOf('', 'CH')).toBeNull();
    expect(handlePhotoOf('NOSUCH', 'CH')).toBeNull();
    // Part of a number is not a number.
    expect(handlePhotoOf('BM8', 'CH')).toBeNull();
    expect(crlPhotoOf('GEN044')).toBeNull();
  });
});
