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

import { newId } from '../lib/ids';
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
