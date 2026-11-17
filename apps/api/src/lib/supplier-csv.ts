/**
 * A CSV of supplier price-list items: one row for each thing the supplier
 * sells, with a SetOut key and/or the supplier's own number, a cost, and an
 * optional selling price.
 *
 * Columns, in any order (names are matched without regard to case or spaces):
 * key, sku, description, unit, cost_pence (or cost, in pounds), sell_pence
 * (or sell, in pounds), notes, min_area_m2.
 *
 * A later import of a CRL catalogue can use sku for the catalogue number and
 * leave the SetOut key empty until it is matched.
 */

import { QUOTE_UNITS, type QuoteUnit } from '../db/tables';
import { RequestError } from './enquiry';

const MAX_SKU = 80;
const MAX_ITEM_DESCRIPTION = 200;
const MAX_NOTES = 2000;
const MAX_ITEMS_PER_LIST = 5000;

export interface ImportedItem {
  key: string | null;
  sku: string | null;
  description: string;
  unit: QuoteUnit;
  costPence: number;
  sellPence: number | null;
  rules: { minAreaM2?: number };
  notes: string | null;
}

const HEADER_ALIASES: Record<string, string> = {
  key: 'key',
  setoutkey: 'key',
  sku: 'sku',
  code: 'sku',
  cataloguenumber: 'sku',
  catalognumber: 'sku',
  description: 'description',
  product: 'description',
  unit: 'unit',
  costpence: 'cost_pence',
  cost_pence: 'cost_pence',
  cost: 'cost',
  costpounds: 'cost',
  sellpence: 'sell_pence',
  sell_pence: 'sell_pence',
  sell: 'sell',
  sellpounds: 'sell',
  notes: 'notes',
  minaream2: 'min_area_m2',
  min_area_m2: 'min_area_m2',
};

const KEY = /^[a-z0-9][a-z0-9:._-]{0,99}$/;

const heading = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Split a CSV line, honouring double-quoted fields. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

const poundsToPence = (value: string, field: string, row: number): number => {
  const text = value.trim().replace(/^£/, '').replace(/,/g, '');
  if (!text) throw new RequestError(400, 'invalid_csv', `Row ${row}: ${field} is needed.`);
  const pounds = Number(text);
  if (!Number.isFinite(pounds) || pounds < 0) throw new RequestError(400, 'invalid_csv', `Row ${row}: ${field} is not a price.`);
  const pence = Math.round(pounds * 100);
  if (pence > 100_000_000) throw new RequestError(400, 'invalid_csv', `Row ${row}: ${field} is more than £1,000,000.`);
  return pence;
};

const wholePence = (value: string, field: string, row: number): number => {
  const text = value.trim();
  if (!text) throw new RequestError(400, 'invalid_csv', `Row ${row}: ${field} is needed.`);
  const pence = Number(text);
  if (!Number.isInteger(pence) || pence < 0 || pence > 100_000_000) {
    throw new RequestError(400, 'invalid_csv', `Row ${row}: ${field} must be a whole number of pence.`);
  }
  return pence;
};

/**
 * Items read from a CSV body. The first line is the header. Empty lines are
 * skipped. A file with no data rows is refused.
 */
export function parseSupplierCsv(text: string): ImportedItem[] {
  const raw = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n').filter((line, i, all) => line.trim() !== '' || (i > 0 && i < all.length - 1 && all[i + 1].trim() !== ''));
  const nonempty = lines.filter((line) => line.trim() !== '');
  if (nonempty.length < 2) throw new RequestError(400, 'invalid_csv', 'The file needs a header row and at least one item.');
  const headers = splitCsvLine(nonempty[0]).map((h) => HEADER_ALIASES[heading(h)] ?? heading(h));
  if (!headers.includes('description')) {
    throw new RequestError(400, 'invalid_csv', 'The file needs a description column.');
  }
  if (!headers.includes('unit')) throw new RequestError(400, 'invalid_csv', 'The file needs a unit column.');
  if (!headers.includes('cost_pence') && !headers.includes('cost')) {
    throw new RequestError(400, 'invalid_csv', 'The file needs a cost_pence or cost column.');
  }
  if (nonempty.length - 1 > MAX_ITEMS_PER_LIST) {
    throw new RequestError(400, 'invalid_csv', `A list can have at most ${MAX_ITEMS_PER_LIST} items.`);
  }

  const items: ImportedItem[] = [];
  const seenKeys = new Set<string>();
  const seenSkus = new Set<string>();
  for (let i = 1; i < nonempty.length; i++) {
    const row = i + 1;
    const fields = splitCsvLine(nonempty[i]);
    const col = (name: string) => {
      const at = headers.indexOf(name);
      return at < 0 ? '' : (fields[at] ?? '').trim();
    };
    const description = col('description').replace(/\s+/g, ' ');
    if (!description) throw new RequestError(400, 'invalid_csv', `Row ${row}: a description is needed.`);
    if (description.length > MAX_ITEM_DESCRIPTION) {
      throw new RequestError(400, 'invalid_csv', `Row ${row}: keep the description to ${MAX_ITEM_DESCRIPTION} characters.`);
    }
    const unit = col('unit').trim().toLowerCase();
    if (!(QUOTE_UNITS as readonly string[]).includes(unit)) {
      throw new RequestError(400, 'invalid_csv', `Row ${row}: "${col('unit')}" is not a unit. Use each, m2, m, set or job.`);
    }
    const costPence = col('cost_pence') ? wholePence(col('cost_pence'), 'cost_pence', row) : poundsToPence(col('cost'), 'cost', row);
    let sellPence: number | null = null;
    if (col('sell_pence')) sellPence = wholePence(col('sell_pence'), 'sell_pence', row);
    else if (col('sell')) sellPence = poundsToPence(col('sell'), 'sell', row);
    const keyText = col('key');
    const key = keyText ? keyText.toLowerCase() : null;
    if (key && !KEY.test(key)) throw new RequestError(400, 'invalid_csv', `Row ${row}: "${keyText}" is not a SetOut key.`);
    if (key) {
      if (seenKeys.has(key)) throw new RequestError(400, 'invalid_csv', `Row ${row}: the key ${key} appears twice.`);
      seenKeys.add(key);
    }
    const sku = col('sku') || null;
    if (sku && sku.length > MAX_SKU) throw new RequestError(400, 'invalid_csv', `Row ${row}: keep the SKU to ${MAX_SKU} characters.`);
    if (sku) {
      if (seenSkus.has(sku)) throw new RequestError(400, 'invalid_csv', `Row ${row}: the SKU ${sku} appears twice.`);
      seenSkus.add(sku);
    }
    if (!key && !sku) throw new RequestError(400, 'invalid_csv', `Row ${row}: an item needs a SetOut key or a SKU.`);
    const notes = col('notes') ? col('notes').replace(/\s+/g, ' ') : null;
    if (notes && notes.length > MAX_NOTES) throw new RequestError(400, 'invalid_csv', `Row ${row}: keep the notes to ${MAX_NOTES} characters.`);
    const rules: Record<string, unknown> = {};
    if (col('min_area_m2')) {
      const min = Number(col('min_area_m2'));
      if (!Number.isFinite(min) || min <= 0) throw new RequestError(400, 'invalid_csv', `Row ${row}: min_area_m2 must be a number above nought.`);
      rules.minAreaM2 = Math.round(min * 100) / 100;
    }
    items.push({
      key,
      sku,
      description,
      unit: unit as QuoteUnit,
      costPence,
      sellPence,
      rules: rules.minAreaM2 ? { minAreaM2: rules.minAreaM2 as number } : {},
      notes,
    });
  }
  return items;
}

export { parseSupplierCsv as readSupplierCsv };
