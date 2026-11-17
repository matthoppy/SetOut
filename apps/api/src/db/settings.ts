/**
 * A company's settings, as its owners change them: the company's own name,
 * branding and settings, and for each of its designers the finishes and
 * handles it offers and the addresses it emails.
 *
 * The company's own record is not one of its tables, and every change here
 * goes with an entry in the company's audit log, so this lives beside the
 * team rather than in the general data layer. Every statement names the
 * company.
 *
 * A change is saved only if what it changes still holds what it held when it
 * was read, so two owners saving at the same moment cannot lose each other's
 * change unawares. Its audit entry is written in the same batch, and only if
 * the change was made, so the log never says something happened that did not.
 *
 * Which websites may show a designer is a security setting. An owner sets it
 * for their own designer, checked as strictly as the page's framing rule
 * reads it, and each change is in the audit log like any other.
 */

import type { RulesetOverrides } from '@setout/engine';
import { newId } from '../lib/ids';
import { DataError } from './company-db';
import type { QuoteUnit, SupplierKind } from './tables';

type Env_ = Pick<Env, 'DB'>;

/** The columns a company's settings live in, exactly as stored. */
export interface StoredSettings {
  company: { name: string; branding: string; settings: string };
  /** Oldest first, as the rest of the workspace takes them. */
  designers: { id: string; name: string; status: string; site_key: string; allowed_origins: string; config: string; notify_emails: string }[];
}

/** The company's settings and its designers', as stored, to show them and to change them from. */
export async function readSettings(env: Env_, companyId: string): Promise<StoredSettings | null> {
  const [company, designers] = await env.DB.batch([
    env.DB.prepare('SELECT name, branding, settings FROM companies WHERE id = ?').bind(companyId),
    env.DB.prepare(
      'SELECT id, name, status, site_key, allowed_origins, config, notify_emails FROM designers WHERE company_id = ? ORDER BY created_at, id'
    ).bind(companyId),
  ]);
  const row = (company.results as StoredSettings['company'][])[0];
  if (!row) return null;
  return { company: row, designers: designers.results as StoredSettings['designers'] };
}

/** The only columns a change to the settings may write. */
const WRITABLE = {
  companies: ['name', 'branding', 'settings'],
  designers: ['config', 'notify_emails', 'allowed_origins'],
} as const;

type Change = { was: string; now: string };

export type SettingsWrite =
  | { table: 'companies'; columns: Partial<Record<(typeof WRITABLE)['companies'][number], Change>> }
  | { table: 'designers'; id: string; columns: Partial<Record<(typeof WRITABLE)['designers'][number], Change>> };

/**
 * Write new values, as stored, over the ones read. Nothing is written unless
 * every column still holds what it held, and then the audit entry goes with
 * it. False if something changed meanwhile.
 */
export async function saveSettings(
  env: Env_,
  companyId: string,
  actorId: string,
  write: SettingsWrite,
  data: object,
  now = new Date()
): Promise<boolean> {
  const columns = Object.entries(write.columns).filter((entry): entry is [string, Change] => entry[1] !== undefined);
  if (columns.length === 0) throw new DataError('There is nothing to change.');
  for (const [column] of columns) {
    if (!(WRITABLE[write.table] as readonly string[]).includes(column)) {
      throw new DataError(`"${write.table}.${column}" is not a setting that can be changed here.`);
    }
  }
  const at = now.toISOString();
  const set = columns.map(([column]) => `${column} = ?`).join(', ');
  const same = columns.map(([column]) => ` AND ${column} = ?`).join('');
  const values = columns.map(([, change]) => change.now);
  const before = columns.map(([, change]) => change.was);
  const update =
    write.table === 'companies'
      ? env.DB.prepare(`UPDATE companies SET ${set}, updated_at = ? WHERE id = ?${same}`).bind(...values, at, companyId, ...before)
      : env.DB.prepare(`UPDATE designers SET ${set}, updated_at = ? WHERE company_id = ? AND id = ?${same}`).bind(
          ...values,
          at,
          companyId,
          write.id,
          ...before
        );
  const [updated] = await env.DB.batch([
    update,
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       SELECT ?, ?, ?, 'settings_changed', ?, ?, ? WHERE changes() = 1`
    ).bind(companyId, newId('audit'), actorId, write.table === 'companies' ? companyId : write.id, JSON.stringify(data), at),
  ]);
  return updated.meta.changes === 1;
}

export interface SettingsChangeEntry {
  id: string;
  /** Who made it. Null when SetOut did. */
  by: { email: string; name: string | null } | null;
  /** The designer it was made to, if any, and what changed. */
  data: Record<string, unknown>;
  at: string;
}

/** The latest changes to the settings, newest first. */
export async function settingsChanges(env: Env_, companyId: string, limit = 30): Promise<SettingsChangeEntry[]> {
  const rows = await env.DB.prepare(
    `SELECT a.id, a.data, a.created_at AS at, u.email AS byEmail, u.name AS byName
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.company_id = ? AND a.action = 'settings_changed'
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?`
  )
    .bind(companyId, limit)
    .all<{ id: string; data: string; at: string; byEmail: string | null; byName: string | null }>();
  return rows.results.map((row) => {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      // An unreadable entry still says that something changed, and when.
    }
    return { id: row.id, by: row.byEmail ? { email: row.byEmail, name: row.byName } : null, data, at: row.at };
  });
}

/**
 * How many of the company's showers use each finish and each handle, by id,
 * as they now stand: those on jobs from this designer and, for the company's
 * first designer, those on jobs from none, whose sheets take its names.
 */
export async function optionsInUse(
  env: Env_,
  companyId: string,
  designerId: string,
  withUnassigned: boolean
): Promise<{ finishes: Record<string, number>; handles: Record<string, number> }> {
  const rows = await env.DB.prepare(
    `SELECT json_extract(r.document, '$.design.finishId') AS finish,
            json_extract(r.document, '$.design.handleId') AS handle,
            COUNT(*) AS n
       FROM designs d
       JOIN jobs j ON j.company_id = d.company_id AND j.id = d.job_id
       JOIN design_revisions r ON r.company_id = d.company_id AND r.design_id = d.id AND r.number = d.current_revision
      WHERE d.company_id = ? AND (j.designer_id = ? OR (? = 1 AND j.designer_id IS NULL))
      GROUP BY finish, handle`
  )
    .bind(companyId, designerId, withUnassigned ? 1 : 0)
    .all<{ finish: unknown; handle: unknown; n: number }>();
  const finishes = new Map<string, number>();
  const handles = new Map<string, number>();
  for (const row of rows.results) {
    if (typeof row.finish === 'string') finishes.set(row.finish, (finishes.get(row.finish) ?? 0) + row.n);
    if (typeof row.handle === 'string') handles.set(row.handle, (handles.get(row.handle) ?? 0) + row.n);
  }
  return { finishes: Object.fromEntries(finishes), handles: Object.fromEntries(handles) };
}

// ---------------------------------------------------------------------------
// Measurements: the company's rules
// ---------------------------------------------------------------------------

/** The company's changes to SetOut's making rules, as they stand. Version 0 is none. */
export async function readRules(env: Env_, companyId: string): Promise<{ version: number; overrides: RulesetOverrides }> {
  const row = await env.DB.prepare('SELECT version, overrides FROM rulesets WHERE company_id = ? ORDER BY version DESC LIMIT 1')
    .bind(companyId)
    .first<{ version: number; overrides: string }>();
  if (!row) return { version: 0, overrides: {} };
  return { version: row.version, overrides: JSON.parse(row.overrides) as RulesetOverrides };
}

/**
 * Save the company's changes to the making rules as the version after the
 * one they were made from, with the audit entry beside it. Nothing is saved
 * if another version was saved meanwhile: false if so. Designs already sent
 * keep the version they were made with.
 */
export async function saveRules(
  env: Env_,
  companyId: string,
  actorId: string,
  basedOn: number,
  overrides: RulesetOverrides,
  data: object,
  now = new Date()
): Promise<boolean> {
  const at = now.toISOString();
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO rulesets (company_id, version, overrides, note, created_at)
       SELECT ?1, ?2 + 1, ?3, 'Measurements in Settings', ?4
        WHERE COALESCE((SELECT MAX(version) FROM rulesets WHERE company_id = ?1), 0) = ?2`
    ).bind(companyId, basedOn, JSON.stringify(overrides), at),
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       SELECT ?, ?, ?, 'settings_changed', ?, ?, ? WHERE changes() = 1`
    ).bind(companyId, newId('audit'), actorId, companyId, JSON.stringify(data), at),
  ]);
  return inserted.meta.changes === 1;
}

// ---------------------------------------------------------------------------
// Prices: the price book
// ---------------------------------------------------------------------------

/**
 * Change prices in the company's price book, each from the price the owner
 * saw to the one they chose; a null price is none, and takes the price away.
 * All of them are changed or none is: nothing is written if any price has
 * moved since the owner read it, say because a quote with it on was sent
 * meanwhile, and then false. The audit entry is written in the same batch,
 * and only once every price is what the owner chose.
 *
 * The prices go to the database as one list, so a price book of any size is
 * one statement of each kind.
 */
export async function savePrices(
  env: Env_,
  companyId: string,
  actorId: string,
  changes: readonly { key: string; unit: string; from: number | null; to: number | null }[],
  data: object,
  now = new Date()
): Promise<boolean> {
  if (changes.length === 0) throw new DataError('There is nothing to change.');
  const at = now.toISOString();
  const sent = JSON.stringify(changes.map((c) => ({ key: c.key, unit: c.unit, from: c.from, to: c.to, id: newId('price') })));
  // Every price still what the owner saw, or already what they chose.
  const unmoved = `NOT EXISTS (
      SELECT 1 FROM json_each(?2) c
        LEFT JOIN price_list p ON p.company_id = ?1 AND p.key = json_extract(c.value, '$.key')
       WHERE p.unit_price_pence IS NOT json_extract(c.value, '$.from')
         AND p.unit_price_pence IS NOT json_extract(c.value, '$.to'))`;
  const statements: D1PreparedStatement[] = [];
  if (changes.some((c) => c.to === null)) {
    statements.push(
      env.DB.prepare(
        `DELETE FROM price_list
          WHERE company_id = ?1
            AND key IN (SELECT json_extract(value, '$.key') FROM json_each(?2) WHERE json_extract(value, '$.to') IS NULL)
            AND ${unmoved}`
      ).bind(companyId, sent)
    );
  }
  if (changes.some((c) => c.to !== null)) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO price_list (company_id, id, key, unit, unit_price_pence, created_at, updated_at)
         SELECT ?1, json_extract(c.value, '$.id'), json_extract(c.value, '$.key'), json_extract(c.value, '$.unit'), json_extract(c.value, '$.to'), ?3, ?3
           FROM json_each(?2) c
          WHERE json_extract(c.value, '$.to') IS NOT NULL AND ${unmoved}
         ON CONFLICT (company_id, key) DO UPDATE SET unit = excluded.unit, unit_price_pence = excluded.unit_price_pence, updated_at = excluded.updated_at`
      ).bind(companyId, sent, at)
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       SELECT ?1, ?3, ?4, 'settings_changed', ?1, ?5, ?6
        WHERE NOT EXISTS (
          SELECT 1 FROM json_each(?2) c
            LEFT JOIN price_list p ON p.company_id = ?1 AND p.key = json_extract(c.value, '$.key')
           WHERE p.unit_price_pence IS NOT json_extract(c.value, '$.to'))`
    ).bind(companyId, sent, newId('audit'), actorId, JSON.stringify(data), at)
  );
  const results = await env.DB.batch(statements);
  return results[results.length - 1].meta.changes === 1;
}

// ---------------------------------------------------------------------------
// Suppliers: who the company buys from, and what each charges
// ---------------------------------------------------------------------------

/** The company's suppliers, in the order they were added, each with what it charges. */
export async function readSuppliers(
  env: Env_,
  companyId: string
): Promise<{ id: string; name: string; kind: SupplierKind; isDefault: boolean; prices: { key: string; unit: QuoteUnit; pence: number; updatedAt: string }[] }[]> {
  const [suppliers, prices] = await env.DB.batch([
    env.DB.prepare('SELECT id, name, kind, is_default AS isDefault FROM suppliers WHERE company_id = ? ORDER BY created_at, id').bind(companyId),
    env.DB.prepare(
      'SELECT supplier_id AS supplierId, key, unit, cost_pence AS pence, sku, updated_at AS updatedAt FROM supplier_prices WHERE company_id = ? ORDER BY key'
    ).bind(companyId),
  ]);
  const rows = prices.results as { supplierId: string; key: string; unit: QuoteUnit; pence: number; sku: string | null; updatedAt: string }[];
  return (suppliers.results as { id: string; name: string; kind: SupplierKind; isDefault: number }[]).map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    isDefault: s.isDefault === 1,
    prices: rows.filter((p) => p.supplierId === s.id).map(({ key, unit, pence, updatedAt }) => ({ key, unit, pence, updatedAt })),
  }));
}

/**
 * Add a supplier, with the audit entry beside it. Nothing is added if the
 * company already has a supplier of that name, whatever its capitals, or
 * already has as many as it may: null if so.
 */
export async function addSupplier(
  env: Env_,
  companyId: string,
  actorId: string,
  name: string,
  kind: SupplierKind,
  limit: number,
  preferDefault = false,
  now = new Date()
): Promise<string | null> {
  const at = now.toISOString();
  const id = newId('supplier', now.getTime());
  const statements: D1PreparedStatement[] = [];
  if (preferDefault) {
    statements.push(
      env.DB.prepare('UPDATE suppliers SET is_default = 0, updated_at = ?3 WHERE company_id = ?1 AND kind = ?2 AND is_default = 1').bind(
        companyId,
        kind,
        at
      )
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO suppliers (company_id, id, name, kind, is_default, created_at, updated_at)
       SELECT ?1, ?2, ?3, ?4,
              CASE WHEN ?6 = 1 OR NOT EXISTS (SELECT 1 FROM suppliers WHERE company_id = ?1 AND kind = ?4 AND is_default = 1) THEN 1 ELSE 0 END,
              ?5, ?5
        WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE company_id = ?1 AND lower(name) = lower(?3))
          AND (SELECT COUNT(*) FROM suppliers WHERE company_id = ?1) < ?7`
    ).bind(companyId, id, name, kind, at, preferDefault ? 1 : 0, limit),
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       SELECT ?, ?, ?, 'settings_changed', ?, ?, ? WHERE changes() = 1`
    ).bind(
      companyId,
      newId('audit'),
      actorId,
      id,
      JSON.stringify({ changes: [{ field: 'supplier', change: 'added', id, label: name, kind }] }),
      at
    )
  );
  const results = await env.DB.batch(statements);
  const added = results[preferDefault ? 1 : 0];
  return added.meta.changes === 1 ? id : null;
}

/**
 * Rename a supplier, from the name the owner saw, unless another of the
 * company's suppliers has the new name. False if not renamed.
 */
export async function renameSupplier(env: Env_, companyId: string, actorId: string, id: string, from: string, to: string, now = new Date()): Promise<boolean> {
  const at = now.toISOString();
  const [renamed] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE suppliers SET name = ?4, updated_at = ?5
        WHERE company_id = ?1 AND id = ?2 AND name = ?3
          AND NOT EXISTS (SELECT 1 FROM suppliers WHERE company_id = ?1 AND id <> ?2 AND lower(name) = lower(?4))`
    ).bind(companyId, id, from, to, at),
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       SELECT ?, ?, ?, 'settings_changed', ?, ?, ? WHERE changes() = 1`
    ).bind(companyId, newId('audit'), actorId, id, JSON.stringify({ changes: [{ field: 'supplier', change: 'renamed', id, label: to, from, to }] }), at),
  ]);
  return renamed.meta.changes === 1;
}

/** Remove a supplier and every price it has, with the audit entry beside it. False if there was no such supplier. */
export async function removeSupplier(env: Env_, companyId: string, actorId: string, id: string, name: string, now = new Date()): Promise<boolean> {
  const at = now.toISOString();
  const results = await env.DB.batch([
    env.DB.prepare('DELETE FROM supplier_prices WHERE company_id = ? AND supplier_id = ?').bind(companyId, id),
    env.DB.prepare('DELETE FROM suppliers WHERE company_id = ? AND id = ?').bind(companyId, id),
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       SELECT ?, ?, ?, 'settings_changed', ?, ?, ? WHERE changes() = 1`
    ).bind(companyId, newId('audit'), actorId, id, JSON.stringify({ changes: [{ field: 'supplier', change: 'removed', id, label: name }] }), at),
  ]);
  return results[1].meta.changes === 1;
}

/**
 * Change what a supplier charges, as savePrices changes the price book: each
 * price from the one the owner saw to the one they chose, or none, all of
 * them or none, and the audit entry only once every price is what the owner
 * chose. False if any had moved meanwhile, or the supplier has gone.
 */
export async function saveSupplierPrices(
  env: Env_,
  companyId: string,
  actorId: string,
  supplierId: string,
  changes: readonly { key: string; unit: string; from: number | null; to: number | null }[],
  data: object,
  now = new Date()
): Promise<boolean> {
  if (changes.length === 0) throw new DataError('There is nothing to change.');
  const at = now.toISOString();
  const sent = JSON.stringify(changes.map((c) => ({ key: c.key, unit: c.unit, from: c.from, to: c.to, id: newId('supplierPrice') })));
  const theirs = 'p.company_id = ?1 AND p.supplier_id = ?3 AND p.key = json_extract(c.value, \'$.key\')';
  const unmoved = `EXISTS (SELECT 1 FROM suppliers WHERE company_id = ?1 AND id = ?3) AND NOT EXISTS (
      SELECT 1 FROM json_each(?2) c
        LEFT JOIN supplier_prices p ON ${theirs}
       WHERE p.cost_pence IS NOT json_extract(c.value, '$.from')
         AND p.cost_pence IS NOT json_extract(c.value, '$.to'))`;
  const statements: D1PreparedStatement[] = [];
  if (changes.some((c) => c.to === null)) {
    statements.push(
      env.DB.prepare(
        `DELETE FROM supplier_prices
          WHERE company_id = ?1 AND supplier_id = ?3
            AND key IN (SELECT json_extract(value, '$.key') FROM json_each(?2) WHERE json_extract(value, '$.to') IS NULL)
            AND ${unmoved}`
      ).bind(companyId, sent, supplierId)
    );
  }
  if (changes.some((c) => c.to !== null)) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO supplier_prices (company_id, id, supplier_id, key, unit, cost_pence, created_at, updated_at)
         SELECT ?1, json_extract(c.value, '$.id'), ?3, json_extract(c.value, '$.key'), json_extract(c.value, '$.unit'), json_extract(c.value, '$.to'), ?4, ?4
           FROM json_each(?2) c
          WHERE json_extract(c.value, '$.to') IS NOT NULL AND ${unmoved}
         ON CONFLICT (company_id, supplier_id, key) DO UPDATE SET unit = excluded.unit, cost_pence = excluded.cost_pence, updated_at = excluded.updated_at`
      ).bind(companyId, sent, supplierId, at)
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       SELECT ?1, ?4, ?5, 'settings_changed', ?3, ?6, ?7
        WHERE EXISTS (SELECT 1 FROM suppliers WHERE company_id = ?1 AND id = ?3) AND NOT EXISTS (
          SELECT 1 FROM json_each(?2) c
            LEFT JOIN supplier_prices p ON ${theirs}
           WHERE p.cost_pence IS NOT json_extract(c.value, '$.to'))`
    ).bind(companyId, sent, supplierId, newId('audit'), actorId, JSON.stringify(data), at)
  );
  const results = await env.DB.batch(statements);
  return results[results.length - 1].meta.changes === 1;
}


/**
 * Change a supplier's name, kind, or whether it is the default of that kind,
 * from what the owner saw. Making it the default clears any other default of
 * the same kind. False if it had moved meanwhile.
 */
export async function updateSupplier(
  env: Env_,
  companyId: string,
  actorId: string,
  id: string,
  seen: { name: string; kind: SupplierKind; isDefault: boolean },
  next: { name: string; kind: SupplierKind; isDefault: boolean },
  now = new Date()
): Promise<boolean> {
  const at = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  if (next.isDefault) {
    statements.push(
      env.DB.prepare(
        `UPDATE suppliers SET is_default = 0, updated_at = ?4
          WHERE company_id = ?1 AND kind = ?3 AND id <> ?2 AND is_default = 1
            AND EXISTS (SELECT 1 FROM suppliers WHERE company_id = ?1 AND id = ?2 AND name = ?5 AND kind = ?6 AND is_default = ?7)`
      ).bind(companyId, id, next.kind, at, seen.name, seen.kind, seen.isDefault ? 1 : 0)
    );
  }
  statements.push(
    env.DB.prepare(
      `UPDATE suppliers SET name = ?4, kind = ?5, is_default = ?6, updated_at = ?7
        WHERE company_id = ?1 AND id = ?2 AND name = ?3 AND kind = ?8 AND is_default = ?9
          AND NOT EXISTS (SELECT 1 FROM suppliers WHERE company_id = ?1 AND id <> ?2 AND lower(name) = lower(?4))`
    ).bind(companyId, id, seen.name, next.name, next.kind, next.isDefault ? 1 : 0, at, seen.kind, seen.isDefault ? 1 : 0)
  );
  const changes: object[] = [{ field: 'supplier', change: 'updated', id, label: next.name, from: seen.name, to: next.name, kind: next.kind, isDefault: next.isDefault }];
  statements.push(
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       SELECT ?, ?, ?, 'settings_changed', ?, ?, ? WHERE changes() = 1`
    ).bind(companyId, newId('audit'), actorId, id, JSON.stringify({ changes }), at)
  );
  const results = await env.DB.batch(statements);
  return results[next.isDefault ? 1 : 0].meta.changes === 1;
}

/** Write the company's markups into its settings, from the values just read. False if they had moved. */
export async function savePricing(
  env: Env_,
  companyId: string,
  actorId: string,
  was: string,
  nowSettings: string,
  data: object,
  now = new Date()
): Promise<boolean> {
  return saveSettings(env, companyId, actorId, { table: 'companies', columns: { settings: { was, now: nowSettings } } }, data, now);
}

/** A supplier's price list as imported from a CSV: all of the rows, or none. */
export async function importSupplierPrices(
  env: Env_,
  companyId: string,
  actorId: string,
  supplierId: string,
  items: readonly { key: string; unit: string; costPence: number; sku: string | null }[],
  replace: boolean,
  data: object,
  now = new Date()
): Promise<boolean> {
  const at = now.toISOString();
  const sent = JSON.stringify(items.map((item) => ({ ...item, id: newId('supplierPrice', now.getTime()) })));
  const exists = 'EXISTS (SELECT 1 FROM suppliers WHERE company_id = ?1 AND id = ?3)';
  const statements: D1PreparedStatement[] = [];
  if (replace) {
    statements.push(
      env.DB.prepare(
        `DELETE FROM supplier_prices
          WHERE company_id = ?1 AND supplier_id = ?2
            AND EXISTS (SELECT 1 FROM suppliers WHERE company_id = ?1 AND id = ?2)`
      ).bind(companyId, supplierId)
    );
  } else if (items.length > 0) {
    statements.push(
      env.DB.prepare(
        `DELETE FROM supplier_prices
          WHERE company_id = ?1 AND supplier_id = ?3 AND ${exists}
            AND (key IN (SELECT json_extract(value, '$.key') FROM json_each(?2))
              OR sku IN (SELECT json_extract(value, '$.sku') FROM json_each(?2) WHERE json_extract(value, '$.sku') IS NOT NULL))`
      ).bind(companyId, sent, supplierId)
    );
  }
  if (items.length > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO supplier_prices (company_id, id, supplier_id, key, unit, cost_pence, sku, created_at, updated_at)
         SELECT ?1, json_extract(c.value, '$.id'), ?3, json_extract(c.value, '$.key'), json_extract(c.value, '$.unit'), json_extract(c.value, '$.costPence'), json_extract(c.value, '$.sku'), ?4, ?4
           FROM json_each(?2) c
          WHERE ${exists}`
      ).bind(companyId, sent, supplierId, at)
    );
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       SELECT ?1, ?4, ?5, 'settings_changed', ?3, ?6, ?7 WHERE ${exists}`
    ).bind(companyId, sent, supplierId, newId('audit'), actorId, JSON.stringify(data), at)
  );
  const results = await env.DB.batch(statements);
  return results[results.length - 1].meta.changes === 1;
}
