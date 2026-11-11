/**
 * Signing in to the workspace.
 *
 * Staff sign in with a link emailed to them. There are no passwords to leak,
 * guess or reset. Nobody signs up: a person is added to a company first, and
 * only then can they ask for a link.
 *
 * A link and a session are each a long random secret. Neither is ever stored.
 * Only their SHA-256 hashes are, so a copy of the database signs nobody in.
 *
 * A session is how a staff request comes to belong to a company, the way a
 * site key is for the designer. The session says which of the person's
 * companies they are working in, and that is checked against their
 * memberships on every request, so taking someone off a team takes effect at
 * once.
 *
 * This works across companies, so it lives beside the platform's own queries
 * and not in the company data layer.
 */

import { newId, nowIso } from '../lib/ids';
import { ROLES, type Role } from './tables';

/** How long a sign-in link works. */
export const LINK_MINUTES = 15;
/** How long a browser stays signed in. */
export const SESSION_DAYS = 30;
/** How many links one address may be sent in an hour. */
export const LINKS_PER_HOUR = 5;

const SECRET_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const LINK_TOKEN = /^lt_[a-z0-9]{32}$/;
const SESSION_TOKEN = /^ss_[a-z0-9]{32}$/;
const EMAIL = /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/;

type Env_ = Pick<Env, 'DB'>;

/** An address as it is stored: trimmed and lower-cased. Null if it is not one. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** 32 random characters with a prefix that says what the secret is for. 160 bits. */
function newSecret(prefix: 'lt' | 'ss'): string {
  let secret = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(32))) secret += SECRET_ALPHABET[byte & 31];
  return `${prefix}_${secret}`;
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const later = (from: Date, ms: number) => new Date(from.getTime() + ms).toISOString();

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/**
 * A sign-in link's token for this address, or null when none should be sent:
 * the address belongs to nobody on an active company, or it has asked for too
 * many lately. The caller answers the same either way, so the answer never
 * says whether an address has an account.
 */
export async function issueSignInLink(env: Env_, email: string, now = new Date()): Promise<string | null> {
  const member = await env.DB.prepare(
    `SELECT u.id FROM users u
       JOIN memberships m ON m.user_id = u.id
       JOIN companies c ON c.id = m.company_id
      WHERE u.email = ? AND c.status = 'active'
      LIMIT 1`
  )
    .bind(email)
    .first<{ id: string }>();
  if (!member) return null;

  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM login_tokens WHERE email = ? AND created_at > ?')
    .bind(email, hourAgo)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= LINKS_PER_HOUR) return null;

  const token = newSecret('lt');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(
      await sha256(token),
      email,
      now.toISOString(),
      later(now, LINK_MINUTES * 60_000)
    ),
    // Links a day past their time are of no use to anyone.
    env.DB.prepare('DELETE FROM login_tokens WHERE expires_at < ?').bind(new Date(now.getTime() - 86_400_000).toISOString()),
  ]);
  return token;
}

export interface NewSession {
  /** The cookie's value. Shown once, to the browser, and never stored. */
  token: string;
  userId: string;
  companyId: string;
  expiresAt: string;
}

/**
 * Use a sign-in link. It works once: two browsers racing with the same link
 * cannot both get in. Null for a link that is unknown, used or out of time,
 * or whose person is no longer on any active company.
 */
export async function redeemSignInLink(env: Env_, token: unknown, now = new Date()): Promise<NewSession | null> {
  if (typeof token !== 'string' || !LINK_TOKEN.test(token)) return null;
  const at = now.toISOString();
  const used = await env.DB.prepare(
    'UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email'
  )
    .bind(at, await sha256(token), at)
    .first<{ email: string }>();
  if (!used) return null;

  const first = await env.DB.prepare(
    `SELECT u.id AS userId, m.company_id AS companyId FROM users u
       JOIN memberships m ON m.user_id = u.id
       JOIN companies c ON c.id = m.company_id
      WHERE u.email = ? AND c.status = 'active'
      ORDER BY m.created_at
      LIMIT 1`
  )
    .bind(used.email)
    .first<{ userId: string; companyId: string }>();
  if (!first) return null;

  const session = newSecret('ss');
  const expiresAt = later(now, SESSION_DAYS * 86_400_000);
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO sessions (token_hash, user_id, company_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(await sha256(session), first.userId, first.companyId, at, expiresAt, at),
    env.DB.prepare('UPDATE users SET last_signed_in_at = ?, updated_at = ? WHERE id = ?').bind(at, at, first.userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(first.userId, at),
  ]);
  return { token: session, userId: first.userId, companyId: first.companyId, expiresAt };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** A signed-in member of staff, working in one of their companies. */
export interface Session {
  /** Which session this is, for signing out. Never the cookie itself. */
  id: string;
  userId: string;
  email: string;
  name: string | null;
  companyId: string;
  companyName: string;
  role: Role;
  expiresAt: string;
}

/**
 * Who a session cookie belongs to, and which company they are working in.
 * Null for a cookie that is not one, unknown, out of time, or whose person
 * has been taken off that company's team, or whose company is not active.
 */
export async function resolveSession(env: Env_, token: unknown, now = new Date()): Promise<Session | null> {
  if (typeof token !== 'string' || !SESSION_TOKEN.test(token)) return null;
  const at = now.toISOString();
  const row = await env.DB.prepare(
    `SELECT s.token_hash AS id, s.user_id AS userId, u.email, u.name, s.company_id AS companyId,
            c.name AS companyName, m.role, s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN memberships m ON m.company_id = s.company_id AND m.user_id = s.user_id
       JOIN companies c ON c.id = s.company_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND c.status = 'active'`
  )
    .bind(await sha256(token), at)
    .first<Session & { lastSeenAt: string }>();
  if (!row || !ROLES.includes(row.role)) return null;

  // When a session was last used is worth knowing, but not worth a write on
  // every request.
  if (now.getTime() - Date.parse(row.lastSeenAt) > 3_600_000) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').bind(at, row.id).run();
  }
  const { lastSeenAt: _, ...session } = row;
  return session;
}

/** The active companies a person belongs to, in the order they joined. */
export async function companiesOf(env: Env_, userId: string): Promise<{ id: string; name: string; role: Role }[]> {
  const rows = await env.DB.prepare(
    `SELECT c.id, c.name, m.role FROM memberships m JOIN companies c ON c.id = m.company_id
      WHERE m.user_id = ? AND c.status = 'active'
      ORDER BY m.created_at`
  )
    .bind(userId)
    .all<{ id: string; name: string; role: Role }>();
  return rows.results;
}

/** Work in another of the person's companies. False if they are not on its team. */
export async function switchCompany(env: Env_, session: Session, companyId: string): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE sessions SET company_id = ?
      WHERE token_hash = ?
        AND EXISTS (SELECT 1 FROM memberships m JOIN companies c ON c.id = m.company_id
                     WHERE m.company_id = ? AND m.user_id = ? AND c.status = 'active')`
  )
    .bind(companyId, session.id, companyId, session.userId)
    .run();
  return result.meta.changes > 0;
}

export async function endSession(env: Env_, session: Session): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.id).run();
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/**
 * Put a person on a company's team, making their user if they have none. An
 * existing member keeps their place and takes the role given. Used by SetOut's
 * own scripts until owners can invite their own staff.
 */
export async function addMember(
  env: Env_,
  companyId: string,
  rawEmail: string,
  role: Role,
  name: string | null = null
): Promise<{ userId: string }> {
  const email = normaliseEmail(rawEmail);
  if (!email) throw new Error('That is not an email address.');
  if (!ROLES.includes(role)) throw new Error(`"${role}" is not a role.`);
  const at = nowIso();
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (email) DO NOTHING'
  )
    .bind(newId('user'), email, name, at, at)
    .run();
  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (!user) throw new Error('The user was not made.');
  await env.DB.prepare(
    `INSERT INTO memberships (company_id, id, user_id, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (company_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`
  )
    .bind(companyId, newId('member'), user.id, role, at, at)
    .run();
  return { userId: user.id };
}
