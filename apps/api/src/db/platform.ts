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

/**
 * The websites allowed to show the designer with this site key in a frame.
 * Null for a key that is not an active designer.
 */
export async function designerFrameOrigins(env: Pick<Env, 'DB'>, siteKey: unknown): Promise<string[] | null> {
  const found = await resolveDesigner(env, siteKey);
  if (!found) return null;
  const row = await env.DB.prepare('SELECT allowed_origins FROM designers WHERE company_id = ? AND id = ?')
    .bind(found.companyId, found.designerId)
    .first<{ allowed_origins: string }>();
  if (!row) return null;
  const origins: unknown = JSON.parse(row.allowed_origins);
  return Array.isArray(origins) ? origins.filter((o): o is string => typeof o === 'string') : [];
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

/**
 * A new resume token: the secret in the link that opens an unfinished design
 * on another device. Whoever holds it can read and change that one draft and
 * nothing else, so it is long, random, and never stored: only its hash is.
 */
export function newResumeToken(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let token = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(32))) token += alphabet[byte & 31];
  return `rt_${token}`;
}

const RESUME_TOKEN = /^rt_[a-z0-9]{32}$/;

/** The form a resume token is stored in. */
export async function hashResumeToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Which draft a resume token opens. */
export interface ResolvedDraft {
  companyId: string;
  draftId: string;
  designerId: string;
  expiresAt: string;
}

/**
 * Find the draft behind a resume token.
 *
 * Like a site key, a resume token is all a request has to say which company
 * it belongs to, so it is looked up here and everything after goes through
 * companyDb with the company found. Null for a token that is not one, is
 * unknown, or whose designer or company is no longer active.
 */
export async function resolveDraft(env: Pick<Env, 'DB'>, token: unknown): Promise<ResolvedDraft | null> {
  if (typeof token !== 'string' || !RESUME_TOKEN.test(token)) return null;
  const row = await env.DB.prepare(
    `SELECT f.company_id AS companyId, f.id AS draftId, f.designer_id AS designerId, f.expires_at AS expiresAt
       FROM drafts f
       JOIN designers d ON d.company_id = f.company_id AND d.id = f.designer_id
       JOIN companies c ON c.id = f.company_id
      WHERE f.resume_token_hash = ? AND d.status = 'active' AND c.status = 'active'`
  )
    .bind(await hashResumeToken(token))
    .first<ResolvedDraft>();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Quote links
// ---------------------------------------------------------------------------

/**
 * The link a customer reads and accepts a quote with. Whoever holds it can
 * see that one quote and accept it, and nothing else, so it is long, random
 * and never stored: only its hash is.
 */
export function newQuoteToken(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let token = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(32))) token += alphabet[byte & 31];
  return `qt_${token}`;
}

const QUOTE_TOKEN = /^qt_[a-z0-9]{32}$/;

/**
 * Which quote a link opens, and so which company the request belongs to.
 * Null for a link that is not one, is unknown, or whose company is no longer
 * active. A withdrawn quote is still found, so the customer can be told.
 */
export async function resolveQuoteLink(env: Pick<Env, 'DB'>, token: unknown): Promise<{ companyId: string; quoteId: string } | null> {
  if (typeof token !== 'string' || !QUOTE_TOKEN.test(token)) return null;
  const row = await env.DB.prepare(
    `SELECT q.company_id AS companyId, q.id AS quoteId FROM quotes q JOIN companies c ON c.id = q.company_id
      WHERE q.link_token_hash = ? AND c.status = 'active'`
  )
    .bind(await hashResumeToken(token))
    .first<{ companyId: string; quoteId: string }>();
  return row ?? null;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * The names and addresses of these users, for a company's own timeline. Only
 * people on that company's team are found, so one company's timeline can
 * never name another's staff.
 */
export async function usersByIds(
  env: Pick<Env, 'DB'>,
  companyId: string,
  ids: string[]
): Promise<Record<string, { name: string | null; email: string }>> {
  if (ids.length === 0) return {};
  const rows = await env.DB.prepare(
    `SELECT u.id, u.name, u.email FROM users u
       JOIN memberships m ON m.user_id = u.id AND m.company_id = ?
      WHERE u.id IN (${ids.map(() => '?').join(', ')})`
  )
    .bind(companyId, ...ids)
    .all<{ id: string; name: string | null; email: string }>();
  return Object.fromEntries(rows.results.map((u) => [u.id, { name: u.name, email: u.email }]));
}

/**
 * What a designer row's config column holds. None of it is secret, and the
 * public designer is sent all of it but the CRL codes, which only the
 * company's own sheets need.
 */
export interface DesignerSettings {
  finishes?: { id: string; label: string; swatch: string; code?: string }[];
  handles?: { id: string; label: string; description: string; code?: string }[];
  /** The thickness a new design starts at. */
  glassThicknessMm?: number;
  /** Every thickness customers may choose, the one above among them. */
  glassThicknessesMm?: number[];
  /** The hinge styles customers may choose for a door hung from a wall and one hung in line, and the standard of each. */
  hinges?: {
    wall?: { offered?: string[]; standard?: string };
    inLine?: { offered?: string[]; standard?: string };
    viennaCutout?: string;
    bellagioFit?: string;
  };
  measurementDisclaimer?: string;
  intro?: string;
  turnstileSiteKey?: string;
}

export type { DesignerRow };
