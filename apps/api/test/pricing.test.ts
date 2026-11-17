/**
 * How a selling price is worked out from a supplier's cost, and how a CSV of
 * items is read for a later import (a CRL catalogue, or a new list from a
 * toughener).
 */
import { describe, expect, test } from 'vitest';
import { RequestError } from '../src/lib/enquiry';
import {
  DEFAULT_MARKUP_BP,
  markupCategoryOf,
  markupBpFor,
  pricingSettingsOf,
  PRICING_DEFAULTS,
  resolveLine,
  sellFromCost,
  supplierKindOf,
  type CatalogItem,
  type PricingSettings,
} from '../src/lib/pricing';
import { readSupplierCsv } from '../src/lib/supplier-csv';
import { chosenSuppliers } from '../src/lib/supplier-catalog';

const settings = (over: Partial<PricingSettings> = {}): PricingSettings => ({
  markupBp: over.markupBp ?? DEFAULT_MARKUP_BP,
  categoryMarkupBp: over.categoryMarkupBp ?? {},
});

const item = (over: Partial<CatalogItem> & Pick<CatalogItem, 'key' | 'costPence'>): CatalogItem => ({
  unit: 'm2',
  sellPence: null,
  rules: {},
  supplierId: 'sup_1',
  priceListId: 'lst_1',
  ...over,
});

describe('sellFromCost', () => {
  test('100% markup is twice the cost, in whole pence', () => {
    expect(sellFromCost(5000, 10_000)).toBe(10_000);
    expect(sellFromCost(321, 10_000)).toBe(642);
  });

  test('a half-penny rounds to the nearest penny', () => {
    expect(sellFromCost(1, 5000)).toBe(2);
    expect(sellFromCost(333, 0)).toBe(333);
  });
});

describe('kinds', () => {
  test('glass, coating and process are bought from the glass supplier; hardware from the hardware supplier', () => {
    expect(supplierKindOf('glass:10:clear')).toBe('glass');
    expect(supplierKindOf('coating:enduroshield')).toBe('glass');
    expect(supplierKindOf('polish:edge')).toBe('glass');
    expect(supplierKindOf('cutout:hole')).toBe('glass');
    expect(supplierKindOf('hinge:gen044:chrome')).toBe('hardware');
    expect(supplierKindOf('channel:chrome')).toBe('hardware');
    expect(supplierKindOf('fitting')).toBeNull();
    expect(supplierKindOf('delivery')).toBeNull();
  });

  test('a category markup is used when one is set', () => {
    expect(markupCategoryOf('polish:edge')).toBe('process');
    expect(markupBpFor('polish:edge', settings({ markupBp: 10_000, categoryMarkupBp: { process: 5000 } }))).toBe(5000);
    expect(markupBpFor('glass:10:clear', settings({ markupBp: 10_000, categoryMarkupBp: { process: 5000 } }))).toBe(10_000);
  });
});

describe('pricingSettingsOf', () => {
  test('a company with no markup set starts at 100%', () => {
    expect(pricingSettingsOf({})).toEqual(PRICING_DEFAULTS);
    expect(pricingSettingsOf({ markupBp: 12_500, categoryMarkupBp: { glass: 8000 } })).toEqual({
      markupBp: 12_500,
      categoryMarkupBp: { glass: 8000 },
    });
  });
});

describe('resolveLine', () => {
  const remembered = new Map([['glass:10:clear', 12_000], ['hinge:gen044:chrome', 4_500]]);

  test('a supplier item wins, at cost plus the usual markup', () => {
    const catalog = new Map([['glass:10:clear', item({ key: 'glass:10:clear', costPence: 5000 })]]);
    expect(resolveLine('glass:10:clear', 1.2, 'm2', catalog, remembered, settings())).toEqual({
      quantity: 1.2,
      unitPricePence: 10_000,
      costPence: 5000,
      supplierId: 'sup_1',
      priceListId: 'lst_1',
    });
  });

  test('a selling price on the item stands in place of cost plus markup', () => {
    const catalog = new Map([['glass:10:clear', item({ key: 'glass:10:clear', costPence: 5000, sellPence: 8000 })]]);
    expect(resolveLine('glass:10:clear', 1, 'm2', catalog, remembered, settings()).unitPricePence).toBe(8000);
  });

  test('a minimum area raises the quantity charged, only for square metres', () => {
    const catalog = new Map([['glass:10:clear', item({ key: 'glass:10:clear', costPence: 5000, rules: { minAreaM2: 0.3 } })]]);
    expect(resolveLine('glass:10:clear', 0.12, 'm2', catalog, remembered, settings()).quantity).toBe(0.3);
    const polish = new Map([['polish:edge', item({ key: 'polish:edge', unit: 'm', costPence: 321, rules: { minAreaM2: 0.3 } })]]);
    expect(resolveLine('polish:edge', 0.12, 'm', polish, new Map(), settings()).quantity).toBe(0.12);
  });

  test('without a supplier item, the remembered price book is used, with no cost stamped', () => {
    expect(resolveLine('glass:10:clear', 1, 'm2', new Map(), remembered, settings())).toEqual({
      quantity: 1,
      unitPricePence: 12_000,
    });
    expect(resolveLine('unknown', 1, 'each', new Map(), remembered, settings()).unitPricePence).toBe(0);
  });
});

describe('chosenSuppliers', () => {
  test('the quote wins, then the job, then the company default', () => {
    expect(
      chosenSuppliers({ glass_supplier_id: 'job-g', hardware_supplier_id: null }, { glass_supplier_id: 'q-g', hardware_supplier_id: null }, {
        glass: 'def-g',
        hardware: 'def-h',
      })
    ).toEqual({ glassSupplierId: 'q-g', hardwareSupplierId: 'def-h' });
  });
});

describe('readSupplierCsv', () => {
  test('reads costs in pounds or pence, in any column order, and keeps a SKU-only row for a later CRL import', () => {
    const items = readSupplierCsv(
      `SKU, Description, Unit, Cost, Key\n` +
        `GEN044,Geneva hinge,each,12.50,hinge:gen044:chrome\n` +
        `SER78,"Serenity kit, chrome",each,£80.00,\n`
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ key: 'hinge:gen044:chrome', sku: 'GEN044', costPence: 1250, unit: 'each' });
    expect(items[1]).toMatchObject({ key: null, sku: 'SER78', description: 'Serenity kit, chrome', costPence: 8000 });
  });

  test('reads cost_pence, an optional sell, and a minimum area', () => {
    const [item] = readSupplierCsv('key,description,unit,cost_pence,sell,min_area_m2\nglass:10:clear,10mm clear,m2,5000,120.00,0.3\n');
    expect(item).toMatchObject({ key: 'glass:10:clear', costPence: 5000, sellPence: 12_000, rules: { minAreaM2: 0.3 } });
  });

  test('refuses a file with no items, a missing cost, or a repeated key', () => {
    const fails = (csv: string) => {
      try {
        readSupplierCsv(csv);
        return null;
      } catch (error) {
        return error instanceof RequestError ? error.code : String(error);
      }
    };
    expect(fails('key,description,unit,cost\n')).toBe('invalid_csv');
    expect(fails('key,description,unit\nglass:10:clear,Glass,m2\n')).toBe('invalid_csv');
    expect(fails('key,description,unit,cost\nglass:10:clear,A,m2,1\nglass:10:clear,B,m2,2\n')).toBe('invalid_csv');
  });
});
