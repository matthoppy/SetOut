/**
 * The costs a new quote looks up: the prices of the company's default glass
 * and hardware suppliers, keyed for a line.
 */

import type { CompanyDb } from '../db/company-db';
import { type CatalogItem, type SupplierKind } from './pricing';

/** The company's default supplier of each kind, if it has named one. */
export async function defaultSupplierIds(db: CompanyDb): Promise<{ glass: string | null; hardware: string | null }> {
  const rows = await db.find('suppliers', { where: { is_default: 1 } });
  const idOf = (kind: SupplierKind) => rows.find((s) => s.kind === kind)?.id ?? null;
  return { glass: idOf('glass'), hardware: idOf('hardware') };
}

/** Costs from the default glass and hardware suppliers, by SetOut key. */
export async function catalogOf(db: CompanyDb): Promise<Map<string, CatalogItem>> {
  const catalog = new Map<string, CatalogItem>();
  const defaults = await defaultSupplierIds(db);
  for (const supplierId of [defaults.glass, defaults.hardware]) {
    if (!supplierId) continue;
    const items = await db.find('supplier_prices', { where: { supplier_id: supplierId }, limit: 5000 });
    for (const item of items) {
      if (!item.key || item.key.startsWith('sku:')) continue;
      catalog.set(item.key, { key: item.key, costPence: item.cost_pence, supplierId });
    }
  }
  return catalog;
}
