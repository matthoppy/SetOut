/**
 * How a new quote gets a selling price from a supplier's cost.
 *
 * The default glass and hardware suppliers' prices are the costs. The
 * selling price is the cost plus the company's markup, or, if that supplier
 * has no row for the line, the price in the company's price book.
 *
 * Markups are in hundredths of a percent, as VAT is: 10000 is 100%, so the
 * selling price is twice the cost. That is the default until a company sets
 * its own, and a category can be different.
 */

import { QUOTE_UNITS, type QuoteUnit } from '../db/tables';
import { RequestError } from './enquiry';

export const SUPPLIER_KINDS = ['glass', 'hardware', 'other'] as const;
export type SupplierKind = (typeof SUPPLIER_KINDS)[number];

export const MARKUP_CATEGORIES = ['glass', 'coating', 'process', 'hardware', 'job'] as const;
export type MarkupCategory = (typeof MARKUP_CATEGORIES)[number];

/** 100%: the selling price is twice the cost, until a company says otherwise. */
export const DEFAULT_MARKUP_BP = 10_000;
export const MAX_MARKUP_BP = 100_000;

export interface PricingSettings {
  /** The company's usual markup, in hundredths of a percent. 10000 is 100%. */
  markupBp: number;
  /** A markup for one kind of line, when it is not the usual one. */
  categoryMarkupBp: Partial<Record<MarkupCategory, number>>;
}

export const PRICING_DEFAULTS: PricingSettings = { markupBp: DEFAULT_MARKUP_BP, categoryMarkupBp: {} };

export interface CatalogItem {
  key: string;
  costPence: number;
  supplierId: string;
}

export interface LineCost {
  unitPricePence: number;
  quantity: number;
  costPence?: number;
  supplierId?: string;
}

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Which kind of markup a quote key takes. */
export function markupCategoryOf(key: string): MarkupCategory {
  const kind = key.split(':')[0];
  if (kind === 'glass') return 'glass';
  if (kind === 'coating') return 'coating';
  if (kind === 'cutout' || kind === 'polish' || kind === 'surcharge' || kind === 'charge') return 'process';
  if (kind === 'hinge' || kind === 'handle' || kind === 'channel' || kind === 'clamps' || kind === 'sliding-kit') return 'hardware';
  return 'job';
}

/** Which default supplier a quote key is bought from. */
export function supplierKindOf(key: string): SupplierKind | null {
  const category = markupCategoryOf(key);
  if (category === 'hardware') return 'hardware';
  if (category === 'job') return null;
  return 'glass';
}

export function sellFromCost(costPence: number, markupBp: number): number {
  return Math.round((costPence * (10_000 + markupBp)) / 10_000);
}

export function markupBpFor(key: string, settings: PricingSettings): number {
  return settings.categoryMarkupBp[markupCategoryOf(key)] ?? settings.markupBp;
}

/** How a new quote starts with markups, from the company's settings. */
export function pricingSettingsOf(settings: Record<string, unknown>): PricingSettings {
  const raw = settings.categoryMarkupBp;
  const categoryMarkupBp: PricingSettings['categoryMarkupBp'] = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const category of MARKUP_CATEGORIES) {
      const value = (raw as Record<string, unknown>)[category];
      if (isWhole(value, 0, MAX_MARKUP_BP)) categoryMarkupBp[category] = value;
    }
  }
  return {
    markupBp: isWhole(settings.markupBp, 0, MAX_MARKUP_BP) ? settings.markupBp : PRICING_DEFAULTS.markupBp,
    categoryMarkupBp,
  };
}

export function readPricingSettings(input: unknown, current: PricingSettings): PricingSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, 'invalid_pricing', 'Send the markup to change.');
  }
  const body = input as Record<string, unknown>;
  let markupBp = current.markupBp;
  if (body.markupBp !== undefined) {
    if (!isWhole(body.markupBp, 0, MAX_MARKUP_BP)) {
      throw new RequestError(400, 'invalid_pricing', 'A markup is a whole number of hundredths of a percent, from 0 to 1000%.');
    }
    markupBp = body.markupBp;
  }
  let categoryMarkupBp = { ...current.categoryMarkupBp };
  if (body.categoryMarkupBp !== undefined) {
    if (!body.categoryMarkupBp || typeof body.categoryMarkupBp !== 'object' || Array.isArray(body.categoryMarkupBp)) {
      throw new RequestError(400, 'invalid_pricing', 'Send each different markup by the kind of line it is for.');
    }
    const next: PricingSettings['categoryMarkupBp'] = {};
    for (const [category, value] of Object.entries(body.categoryMarkupBp as Record<string, unknown>)) {
      if (!(MARKUP_CATEGORIES as readonly string[]).includes(category)) {
        throw new RequestError(400, 'invalid_pricing', `"${category}" is not a kind of markup.`);
      }
      if (value === null || value === undefined) continue;
      if (!isWhole(value, 0, MAX_MARKUP_BP)) {
        throw new RequestError(400, 'invalid_pricing', 'A markup is a whole number of hundredths of a percent, from 0 to 1000%.');
      }
      next[category as MarkupCategory] = value;
    }
    categoryMarkupBp = next;
  }
  return { markupBp, categoryMarkupBp };
}

export function storedPricing(before: Record<string, unknown>, after: PricingSettings): Record<string, unknown> {
  return { ...before, markupBp: after.markupBp, categoryMarkupBp: after.categoryMarkupBp };
}

export function isSupplierKind(value: unknown): value is SupplierKind {
  return typeof value === 'string' && (SUPPLIER_KINDS as readonly string[]).includes(value);
}

export function isQuoteUnit(value: unknown): value is QuoteUnit {
  return typeof value === 'string' && (QUOTE_UNITS as readonly string[]).includes(value);
}

/**
 * The selling price, and the cost it came from, for one line. A cost on the
 * default supplier of that kind wins; otherwise the company's price book.
 */
export function resolveLine(
  key: string,
  quantity: number,
  catalog: Map<string, CatalogItem>,
  remembered: Map<string, number>,
  settings: PricingSettings
): LineCost {
  const item = catalog.get(key);
  if (item) {
    return {
      quantity,
      unitPricePence: sellFromCost(item.costPence, markupBpFor(key, settings)),
      costPence: item.costPence,
      supplierId: item.supplierId,
    };
  }
  return { quantity, unitPricePence: remembered.get(key) ?? 0 };
}
