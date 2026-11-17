/**
 * The catalogue a new quote looks costs up in: the active price lists of the
 * glass and hardware suppliers chosen for this job or quote, falling back
 * to the company's default of each kind.
 */

import type { CompanyDb } from '../db/company-db';
import type { Row } from '../db/tables';
import { parseItemRules, type CatalogItem, type SupplierKind } from './pricing';

export interface ChosenSuppliers {
  glassSupplierId: string | null;
  hardwareSupplierId: string | null;
}

/**
 * Which suppliers a new quote should use: the quote's, then the job's, then
 * the company's default of that kind.
 */
export function chosenSuppliers(
  job: Pick<Row<'jobs'>, 'glass_supplier_id' | 'hardware_supplier_id'>,
  quote: { glass_supplier_id?: string | null; hardware_supplier_id?: string | null } | null,
  defaults: { glass: string | null; hardware: string | null }
): ChosenSuppliers {
  return {
    glassSupplierId: quote?.glass_supplier_id ?? job.glass_supplier_id ?? defaults.glass,
    hardwareSupplierId: quote?.hardware_supplier_id ?? job.hardware_supplier_id ?? defaults.hardware,
  };
}

export async function defaultSupplierIds(db: CompanyDb): Promise<{ glass: string | null; hardware: string | null }> {
  const rows = await db.find('suppliers', { where: { is_default: 1, active: 1 } });
  const idOf = (kind: SupplierKind) => rows.find((s) => s.kind === kind)?.id ?? null;
  return { glass: idOf('glass'), hardware: idOf('hardware') };
}

/** The active list of a supplier, if it has one. */
export async function activeListOf(db: CompanyDb, supplierId: string): Promise<Row<'supplier_price_lists'> | null> {
  const lists = await db.find('supplier_price_lists', { where: { supplier_id: supplierId, status: 'active' }, limit: 1 });
  return lists[0] ?? null;
}

/** Items with a SetOut key, from the active lists of the chosen suppliers, keyed for a new quote. */
export async function catalogOf(db: CompanyDb, chosen: ChosenSuppliers): Promise<Map<string, CatalogItem>> {
  const catalog = new Map<string, CatalogItem>();
  for (const supplierId of [chosen.glassSupplierId, chosen.hardwareSupplierId]) {
    if (!supplierId) continue;
    const supplier = await db.get('suppliers', supplierId);
    if (!supplier || !supplier.active) continue;
    const list = await activeListOf(db, supplier.id);
    if (!list) continue;
    const items = await db.find('supplier_price_items', { where: { list_id: list.id }, limit: 5000 });
    for (const item of items) {
      if (!item.key) continue;
      catalog.set(item.key, {
        key: item.key,
        unit: item.unit,
        costPence: item.cost_pence,
        sellPence: item.sell_pence,
        rules: parseItemRules(item.rules),
        supplierId: supplier.id,
        priceListId: list.id,
      });
    }
  }
  return catalog;
}
