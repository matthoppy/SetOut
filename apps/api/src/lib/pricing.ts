/**
 * How a new quote gets a selling price from a supplier's cost.
 *
 * A company can have several suppliers of glass and of hardware, and names a
 * default of each kind. The active list of the supplier chosen for a job or
 * a quote is what a new line looks its cost up in. The selling price is the
 * cost plus the company's markup, or a selling price set on that item, or,
 * if the list has no row for it, the price in the company's price book.
 *
 * Markups are in hundredths of a percent, as VAT is: 10000 is 100%, so the
 * selling price is twice the cost. That is the default until a company sets
 * its own, and a category or an item can be different.
 */

import {
  PRICE_LIST_STATUSES,
  QUOTE_UNITS,
  SUPPLIER_KINDS,
  type PriceListStatus,
  type QuoteUnit,
  type SupplierKind,
} from '../db/tables';
import { RequestError } from './enquiry';

export { PRICE_LIST_STATUSES, SUPPLIER_KINDS, type PriceListStatus, type SupplierKind };

export const MARKUP_CATEGORIES = ['glass', 'coating', 'process', 'hardware', 'job'] as const;
export type MarkupCategory = (typeof MARKUP_CATEGORIES)[number];

/** 100%: the selling price is twice the cost, until a company says otherwise. */
export const DEFAULT_MARKUP_BP = 10_000;
export const MAX_MARKUP_BP = 100_000;
export const MAX_SUPPLIER_NAME = 120;
export const MAX_LIST_NAME = 120;
export const MAX_SKU = 80;
export const MAX_ITEM_DESCRIPTION = 200;
export const MAX_NOTES = 2000;
export const MAX_ACCOUNT_REF = 80;
export const MAX_SOURCE = 200;
export const MAX_ITEMS_PER_LIST = 5000;
export const MAX_SUPPLIERS = 50;
export const MAX_LISTS_PER_SUPPLIER = 50;

export interface PricingSettings {
  /** The company's usual markup, in hundredths of a percent. 10000 is 100%. */
  markupBp: number;
  /** A markup for one kind of line, when it is not the usual one. */
  categoryMarkupBp: Partial<Record<MarkupCategory, number>>;
}

export const PRICING_DEFAULTS: PricingSettings = { markupBp: DEFAULT_MARKUP_BP, categoryMarkupBp: {} };

export interface ItemRules {
  /** A pane smaller than this is still charged as this many square metres. */
  minAreaM2?: number;
  /** Recorded from a supplier's list; not applied automatically (shape categories are undefined). */
  glassSurchargePercent?: number;
  polishSurchargePercent?: number;
}

export interface CatalogItem {
  key: string;
  unit: QuoteUnit;
  costPence: number;
  /** A selling price that stands in place of cost plus markup. */
  sellPence: number | null;
  rules: ItemRules;
  supplierId: string;
  priceListId: string;
}

/** What a newly drafted line was priced from, besides the selling price. */
export interface LineCost {
  unitPricePence: number;
  quantity: number;
  costPence?: number;
  supplierId?: string;
  priceListId?: string;
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

/** Which supplier a quote key is bought from: glass (the toughener) or hardware. */
export function supplierKindOf(key: string): SupplierKind | null {
  const category = markupCategoryOf(key);
  if (category === 'hardware') return 'hardware';
  if (category === 'job') return null;
  return 'glass';
}

/** The selling price from a cost and a markup, in whole pence. */
export function sellFromCost(costPence: number, markupBp: number): number {
  return Math.round((costPence * (10_000 + markupBp)) / 10_000);
}

export function markupBpFor(key: string, settings: PricingSettings): number {
  const category = markupCategoryOf(key);
  return settings.categoryMarkupBp[category] ?? settings.markupBp;
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

/** Write only the markup fields into the company's settings, leaving the rest as they are. */
export function storedPricing(before: Record<string, unknown>, after: PricingSettings): Record<string, unknown> {
  const stored = { ...before };
  stored.markupBp = after.markupBp;
  stored.categoryMarkupBp = after.categoryMarkupBp;
  return stored;
}

export function parseItemRules(raw: unknown): ItemRules {
  if (raw == null || raw === '') return {};
  const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const o = value as Record<string, unknown>;
  const rules: ItemRules = {};
  if (typeof o.minAreaM2 === 'number' && Number.isFinite(o.minAreaM2) && o.minAreaM2 > 0) {
    rules.minAreaM2 = Math.round(o.minAreaM2 * 100) / 100;
  }
  if (typeof o.glassSurchargePercent === 'number' && Number.isFinite(o.glassSurchargePercent)) {
    rules.glassSurchargePercent = o.glassSurchargePercent;
  }
  if (typeof o.polishSurchargePercent === 'number' && Number.isFinite(o.polishSurchargePercent)) {
    rules.polishSurchargePercent = o.polishSurchargePercent;
  }
  return rules;
}

/**
 * The selling price, and the cost it came from, for one line. A supplier
 * item wins when one is found for the key; otherwise the company's price book.
 * A minimum area on the item raises the quantity charged.
 */
export function resolveLine(
  key: string,
  quantity: number,
  unit: QuoteUnit,
  catalog: Map<string, CatalogItem>,
  remembered: Map<string, number>,
  settings: PricingSettings
): LineCost {
  const item = catalog.get(key);
  let charged = quantity;
  if (item && unit === 'm2' && item.rules.minAreaM2 && charged < item.rules.minAreaM2) {
    charged = item.rules.minAreaM2;
  }
  if (item) {
    const unitPricePence = item.sellPence ?? sellFromCost(item.costPence, markupBpFor(key, settings));
    return {
      quantity: charged,
      unitPricePence,
      costPence: item.costPence,
      supplierId: item.supplierId,
      priceListId: item.priceListId,
    };
  }
  return { quantity: charged, unitPricePence: remembered.get(key) ?? 0 };
}

export function isSupplierKind(value: unknown): value is SupplierKind {
  return typeof value === 'string' && (SUPPLIER_KINDS as readonly string[]).includes(value);
}

export function isPriceListStatus(value: unknown): value is PriceListStatus {
  return typeof value === 'string' && (PRICE_LIST_STATUSES as readonly string[]).includes(value);
}

export function isQuoteUnit(value: unknown): value is QuoteUnit {
  return typeof value === 'string' && (QUOTE_UNITS as readonly string[]).includes(value);
}

/** A calendar day as YYYY-MM-DD, or null if empty. */
export function readDay(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RequestError(400, 'invalid_date', `${field} must be a day written as YYYY-MM-DD.`);
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time)) throw new RequestError(400, 'invalid_date', `${field} must be a day written as YYYY-MM-DD.`);
  return value;
}

export function readOptionalText(value: unknown, field: string, max: number, required = false): string | null {
  if (value === null || value === undefined) {
    if (required) throw new RequestError(400, 'invalid_request', `${field} is needed.`);
    return null;
  }
  if (typeof value !== 'string') throw new RequestError(400, 'invalid_request', `${field} must be text.`);
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) {
    if (required) throw new RequestError(400, 'invalid_request', `${field} is needed.`);
    return null;
  }
  if (text.length > max) throw new RequestError(400, 'invalid_request', `${field} must be at most ${max} characters.`);
  return text;
}
