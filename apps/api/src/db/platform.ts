/**
 * The platform's own view of the database.
 *
 * Everything here works across companies, so it is kept small and apart from
 * the company data layer. It is for SetOut's own administration and for
 * health checks. Nothing in it reads a company's customers, jobs or designs.
 */

import { newId, nowIso } from '../lib/ids';
import { DataError, type CompanyRecord } from './company-db';
import type { DesignerRow } from './tables';

export interface NewCompany {
  name: string;
  /** Two to six capital letters or digits, used in job references: CS gives CS-1001. */
  referencePrefix: string;
  plan?: string;
}

const REFERENCE_PREFIX = /^[A-Z][A-Z0-9]{1,5}$/;

export async function createCompany(env: Pick<Env, 'DB'>, company: NewCompany): Promise<CompanyRecord> {
  const name = company.name.trim();
  if (name.length === 0 || name.length > 100) {
    throw new DataError('A company needs a name of up to 100 characters.');
  }
  if (!REFERENCE_PREFIX.test(company.referencePrefix)) {
    throw new DataError('A reference prefix is two to six capital letters or digits, starting with a letter.');
  }
  const now = nowIso();
  const row = await env.DB.prepare(
    'INSERT INTO companies (id, name, reference_prefix, plan, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, name, reference_prefix, status, plan, currency, branding, settings, features, created_at, updated_at'
  )
    .bind(newId('company'), name, company.referencePrefix, company.plan ?? 'free', now, now)
    .first<Record<string, unknown>>();
  if (!row) throw new DataError('The company was not created.');
  return {
    ...row,
    branding: JSON.parse(row.branding as string),
    settings: JSON.parse(row.settings as string),
    features: JSON.parse(row.features as string),
  } as CompanyRecord;
}

export interface DatabaseStatus {
  ok: boolean;
  /** How many migrations this database has had applied. */
  migrations: number;
}

/** Whether the database answers and has its tables. Used by the health check. */
export async function databaseStatus(env: Pick<Env, 'DB'>): Promise<DatabaseStatus> {
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM d1_migrations').first<{ n: number }>();
    const migrations = row?.n ?? 0;
    return { ok: migrations > 0, migrations };
  } catch {
    return { ok: false, migrations: 0 };
  }
}

// ---------------------------------------------------------------------------
// Designers
// ---------------------------------------------------------------------------

/**
 * A new site key: the public name of one embedded designer. It is safe to
 * publish. It says which company a designer belongs to and nothing more.
 */
export function newSiteKey(kind: 'live' | 'test'): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let key = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(24))) key += alphabet[byte & 31];
  return `pk_${kind}_${key}`;
}

/** Who a site key belongs to. */
export interface ResolvedDesigner {
  companyId: string;
  designerId: string;
}

/**
 * Find the company behind a site key.
 *
 * This is one of the two places a request is tied to a company, the other
 * being a staff sign-in. Everything after it goes through companyDb with the
 * company found here, never with anything else the request says.
 *
 * Null for a key that is unknown, or whose designer or company is not active.
 */
export async function resolveDesigner(env: Pick<Env, 'DB'>, siteKey: unknown): Promise<ResolvedDesigner | null> {
  if (typeof siteKey !== 'string' || !/^pk_(live|test)_[a-z0-9]{16,40}$/.test(siteKey)) return null;
  const row = await env.DB.prepare(
    `SELECT d.company_id AS companyId, d.id AS designerId
       FROM designers d JOIN companies c ON c.id = d.company_id
      WHERE d.site_key = ? AND d.status = 'active' AND c.status = 'active'`
  )
    .bind(siteKey)
    .first<ResolvedDesigner>();
  return row ?? null;
}

/** What a designer row's config column holds. All of it is public. */
export interface DesignerSettings {
  finishes?: { id: string; label: string; swatch: string }[];
  handles?: { id: string; label: string; description: string }[];
  glassThicknessMm?: number;
  measurementDisclaimer?: string;
  intro?: string;
  turnstileSiteKey?: string;
}

export type { DesignerRow };
