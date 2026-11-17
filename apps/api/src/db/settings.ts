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
import { storedPricing, type PricingSettings } from '../lib/pricing';
import { DataError } from './company-db';

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
// Markups: how a new quote turns a supplier's cost into a selling price
// ---------------------------------------------------------------------------


/**
 * Save the company's markup. The rest of its settings are left as they are.
 * The change is written in the audit log.
 */
export async function savePricing(
  env: Env_,
  companyId: string,
  actorId: string,
  after: PricingSettings,
  data: object,
  now = new Date()
): Promise<void> {
  const at = now.toISOString();
  const row = await env.DB.prepare('SELECT settings FROM companies WHERE id = ?').bind(companyId).first<{ settings: string }>();
  if (!row) throw new DataError('This company could not be found.');
  let current: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(row.settings);
    if (value && typeof value === 'object' && !Array.isArray(value)) current = value as Record<string, unknown>;
  } catch {
    current = {};
  }
  const settings = JSON.stringify(storedPricing(current, after));
  await env.DB.batch([
    env.DB.prepare('UPDATE companies SET settings = ?, updated_at = ? WHERE id = ?').bind(settings, at, companyId),
    env.DB.prepare(
      `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
       VALUES (?, ?, ?, 'settings_changed', ?, ?, ?)`
    ).bind(companyId, newId('audit'), actorId, companyId, JSON.stringify(data), at),
  ]);
}
