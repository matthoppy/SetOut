/**
 * The price book lists every price a new quote can ask for, by the same key
 * the quote looks it up by, and takes a change to a price only as a price.
 */
import {
  applyTemplate,
  buildSpec,
  createInitialState,
  DEFAULT_RULESET,
  GLASS_COATINGS,
  GLASS_TYPES,
  IN_LINE_HINGES,
  SLIDING_TEMPLATES,
  TEMPLATES,
  WALL_HINGES,
  type ConfiguratorState,
} from '@setout/engine';
import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/lib/designer-config';
import { RequestError } from '../src/lib/enquiry';
import { listedPrices, priceBook, readPriceChanges, supplierBook } from '../src/lib/price-book';
import { draftLines } from '../src/lib/quote-lines';
import { designerView } from '../src/lib/settings';

const designer = (config: Record<string, unknown>, id = 'dsg_1') =>
  designerView({ id, name: 'Website', status: 'active', site_key: 'key', allowed_origins: '[]', config: JSON.stringify(config), notify_emails: '[]' });

const keysOf = (book: ReturnType<typeof priceBook>) => [...listedPrices(book).keys()];

describe('what the book lists', () => {
  const book = priceBook([designer({})], []);

  test('a designer as SetOut starts it: 10mm in every glass type and coating, both fixings, the standard hinges, no sliding doors', () => {
    expect(book.groups.map((g) => g.id)).toEqual(['glass', 'cutouts', 'hinges', 'handles', 'fixing', 'job']);
    const glass = book.groups.find((g) => g.id === 'glass');
    expect(glass?.columns).toBeUndefined();
    expect(glass?.rows.map((r) => r.label)).toContain('10mm low-iron, easy-clean coated');
    expect(glass?.rows).toHaveLength(GLASS_TYPES.length * GLASS_COATINGS.length);
    expect(glass?.rows.every((r) => r.unit === 'm2' && r.keys.length === 1)).toBe(true);
  });

  test('the hardware is priced in each finish, one price able to stand for them all', () => {
    for (const id of ['hinges', 'handles', 'fixing'] as const) {
      const group = book.groups.find((g) => g.id === id);
      expect(group?.columns?.map((f) => f.id)).toEqual(DEFAULT_SETTINGS.finishes.map((f) => f.id));
      expect(group?.sameAcross).toBe(true);
    }
  });

  test('glass in several thicknesses is a table, a column for each, as a toughener’s list is', () => {
    const several = priceBook([designer({ glassThicknessMm: 10, glassThicknessesMm: [8, 10, 12] })], []);
    const glass = several.groups.find((g) => g.id === 'glass');
    expect(glass?.columns).toEqual([
      { id: '8', label: '8mm' },
      { id: '10', label: '10mm' },
      { id: '12', label: '12mm' },
    ]);
    expect(glass?.sameAcross).toBeUndefined();
    expect(glass?.rows[0]).toEqual({ label: 'Clear', unit: 'm2', keys: ['glass:8:clear', 'glass:10:clear', 'glass:12:clear'] });
    expect(listedPrices(several).get('glass:12:low-iron:easy-clean')).toEqual({ label: '12mm low-iron, easy-clean coated', unit: 'm2' });
  });

  test('each hinge a door can hang on, by CRL’s number, in every finish', () => {
    const hinges = book.groups.find((g) => g.id === 'hinges');
    expect(hinges?.rows.map((r) => r.code)).toEqual(['GEN044', 'GEN180', 'GEN092', 'V1E044', 'V1E180', 'V1E092', 'BEL344', 'BEL380', 'BEL392']);
    expect(hinges?.rows[0]).toEqual({
      label: 'Geneva, to the wall, offset back plate',
      code: 'GEN044',
      unit: 'each',
      keys: DEFAULT_SETTINGS.finishes.map((f) => `hinge:gen044:${f.id}`),
    });
  });

  test('a company in 12mm alone is offered Geneva alone, the one range made for it', () => {
    const twelve = priceBook([designer({ glassThicknessMm: 12, glassThicknessesMm: [12] })], []);
    expect(twelve.groups.find((g) => g.id === 'hinges')?.rows.map((r) => r.code)).toEqual(['GEN044', 'GEN180', 'GEN092']);
  });

  test('only what is offered: clamps alone, clear glass alone, no coating', () => {
    const narrow = priceBook(
      [designer({ fixing: { offered: ['clamps'], standard: 'clamps' }, glassTypes: { offered: ['clear'], standard: 'clear' }, coatings: { offered: ['none'], standard: 'none' } })],
      []
    );
    expect(narrow.groups.find((g) => g.id === 'glass')?.rows.map((r) => r.label)).toEqual(['10mm clear']);
    const fixing = narrow.groups.find((g) => g.id === 'fixing');
    expect(fixing?.title).toBe('Glass clamps, a shower’s set');
    expect(fixing?.rows.map((r) => r.unit)).toEqual(['set']);
  });

  test('sliding kits once sliding doors are offered', () => {
    const sliding = priceBook([designer({ slidingDoors: true })], []);
    expect(sliding.groups.find((g) => g.id === 'sliding')?.rows.map((r) => r.code)).toEqual(['SER78', 'SER90']);
  });

  test('a price for something no longer offered is listed at the end, so it is never out of sight', () => {
    const withOld = priceBook([designer({})], [{ key: 'hinge:gen037:polished-gold', unit: 'each', pence: 5200, updatedAt: '2026-11-01T00:00:00.000Z' }]);
    const other = withOld.groups.at(-1);
    expect(other).toEqual({ id: 'other', title: 'Other prices', rows: [{ label: 'Hinge GEN037, polished gold', unit: 'each', keys: ['hinge:gen037:polished-gold'] }] });
    expect(withOld.prices['hinge:gen037:polished-gold']).toEqual({ pence: 5200, updatedAt: '2026-11-01T00:00:00.000Z' });
  });
});

describe('every price a new quote asks for is in the book', () => {
  // Everything offered, so whatever a shower is made with is priced.
  const everything = {
    slidingDoors: true,
    glassThicknessMm: 10,
    glassThicknessesMm: [8, 10, 12],
    hinges: { wall: { offered: [...WALL_HINGES], standard: 'offset' }, inLine: { offered: [...IN_LINE_HINGES], standard: 'standard' } },
  };
  const book = priceBook([designer(everything)], []);
  const listed = new Set(keysOf(book));
  const labels = {
    finishes: DEFAULT_SETTINGS.finishes.map(({ id, label }) => ({ id, label })),
    handles: DEFAULT_SETTINGS.handles.map(({ id, label }) => ({ id, label })),
  };
  const missing = (design: ConfiguratorState) => {
    const spec = buildSpec(design, { rules: DEFAULT_RULESET, companyName: 'Test' });
    const lines = draftLines([{ prefix: '', design, spec }], labels, new Map([['fitting', 1]]));
    return lines.flatMap((l) => (l.key && !listed.has(l.key) ? [l.key] : []));
  };

  test.each([...TEMPLATES, ...SLIDING_TEMPLATES].map((t) => [t.id, t] as const))('%s, in every glass, coating, finish, handle and fixing', (_, template) => {
    for (const thickness of [8, 10, 12] as const) {
      const base = applyTemplate(createInitialState(thickness), template);
      const variants: ConfiguratorState[] = [
        ...GLASS_TYPES.map((glassType) => ({ ...base, glassType })),
        ...GLASS_COATINGS.map((glassCoating) => ({ ...base, glassCoating })),
        ...DEFAULT_SETTINGS.finishes.map((f) => ({ ...base, finishId: f.id })),
        ...DEFAULT_SETTINGS.handles.map((h) => ({ ...base, handleId: h.id })),
        { ...base, mounting: 'clamps' as const },
        ...WALL_HINGES.filter((h) => h !== 'positive-close').map((wallHinge) => ({ ...base, wallHinge })),
        ...IN_LINE_HINGES.filter((h) => h !== 'positive-close').map((inLineHinge) => ({ ...base, inLineHinge })),
      ];
      for (const variant of variants) expect(missing(variant), `${template.id} in ${thickness}mm`).toEqual([]);
    }
  });
});

describe('a change to a price', () => {
  const book = priceBook([designer({})], [{ key: 'glass:10:clear', unit: 'm2', pence: 12_000, updatedAt: '2026-11-01T00:00:00.000Z' }]);

  test('is read with what it was and what it becomes, and one that did not change is dropped', () => {
    expect(
      readPriceChanges(
        [
          { key: 'glass:10:clear', from: 12_000, to: 12_500 },
          { key: 'cutout:notch', from: null, to: 1500 },
          { key: 'fitting', from: null, to: null },
        ],
        book
      )
    ).toEqual([
      { key: 'glass:10:clear', label: '10mm clear', unit: 'm2', from: 12_000, to: 12_500 },
      { key: 'cutout:notch', label: 'A notch cut in the glass', unit: 'each', from: null, to: 1500 },
    ]);
  });

  test('names the finish of a hinge or handle', () => {
    expect(readPriceChanges([{ key: 'handle:pull:matte-black', from: null, to: 3900 }], book)[0].label).toBe('Pull handle, Matte black');
  });

  test.each([
    ['not a list', { key: 'fitting', to: 100 }],
    ['for something the book does not list', [{ key: 'glass:10:ruby', from: null, to: 100 }]],
    ['a price of nothing', [{ key: 'fitting', from: null, to: 0 }]],
    ['less than nothing', [{ key: 'fitting', from: null, to: -100 }]],
    ['part of a penny', [{ key: 'fitting', from: null, to: 100.5 }]],
    ['over a million pounds', [{ key: 'fitting', from: null, to: 100_000_001 }]],
    ['words for a price', [{ key: 'fitting', from: null, to: '£350' }]],
    ['the same price sent twice', [{ key: 'fitting', from: null, to: 100 }, { key: 'fitting', from: null, to: 200 }]],
    ['without the price it had', [{ key: 'fitting', to: 100 }]],
  ])('%s is refused', (_, input) => {
    let refused: unknown = null;
    try {
      readPriceChanges(input, book);
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(RequestError);
    expect([(refused as RequestError).status, (refused as RequestError).code]).toEqual([400, 'invalid_prices']);
  });
});

describe('a supplier’s price list', () => {
  const at = '2026-11-17T00:00:00.000Z';
  const book = priceBook(
    [designer({})],
    [{ key: 'fitting', unit: 'job', pence: 35_000, updatedAt: at }],
    [
      {
        id: 'sup_1',
        name: 'Smart Glazier',
        prices: [
          { key: 'glass:10:clear', unit: 'm2', pence: 8_000, updatedAt: at },
          { key: 'hinge:gen044:polished-gold', unit: 'each', pence: 5_000, updatedAt: at },
        ],
      },
    ]
  );

  test('has what the supplier charges, by key, and lists what the book no longer does', () => {
    expect(book.suppliers).toEqual([
      {
        id: 'sup_1',
        name: 'Smart Glazier',
        prices: { 'glass:10:clear': { pence: 8_000, updatedAt: at }, 'hinge:gen044:polished-gold': { pence: 5_000, updatedAt: at } },
        others: [{ label: 'Hinge GEN044, polished gold', unit: 'each', keys: ['hinge:gen044:polished-gold'] }],
      },
    ]);
  });

  test('is laid out as the book is, without fitting and delivery or the company’s own other prices', () => {
    const theirs = supplierBook(book, 'sup_1');
    expect(theirs?.groups.map((g) => g.id)).toEqual(['glass', 'cutouts', 'hinges', 'handles', 'fixing', 'other']);
    expect(theirs?.groups.at(-1)?.rows.map((r) => r.keys[0])).toEqual(['hinge:gen044:polished-gold']);
    expect(theirs?.prices['glass:10:clear'].pence).toBe(8_000);
    expect(listedPrices(theirs!).has('fitting')).toBe(false);
  });

  test('a change to it is read against it alone', () => {
    const theirs = supplierBook(book, 'sup_1')!;
    expect(readPriceChanges([{ key: 'glass:10:clear', from: 8_000, to: 8_200 }], theirs)).toEqual([
      { key: 'glass:10:clear', label: '10mm clear', unit: 'm2', from: 8_000, to: 8_200 },
    ]);
    expect(() => readPriceChanges([{ key: 'fitting', from: null, to: 100 }], theirs)).toThrow(RequestError);
  });

  test('there is none for a supplier the company does not have', () => {
    expect(supplierBook(book, 'sup_2')).toBeNull();
  });
});
