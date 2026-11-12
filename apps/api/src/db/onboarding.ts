/**
 * Opening a company, and signing up for one.
 *
 * A company is made in one place, openCompany, whoever asks for it: someone
 * signing up, or SetOut adding a company by hand in the platform admin. It
 * makes the company, its first designer with a site key and its settings, and
 * its owner, in one batch, so a company is never left half made.
 *
 * Signing up is the third way a request comes to belong to a company, after
 * a site key and a sign-in: a sign-up link belongs to the company it makes
 * and to no other. Until the link is used there is no company and no user,
 * only what was typed, waiting in the signups table. The link is a long
 * random secret and only its hash is stored.
 *
 * This works across companies, so it lives beside the platform's own queries
 * and not in the company data layer.
 */

import { newId } from '../lib/ids';
import { newSecret, openSession, sha256, type NewSession } from './auth';
import { DataError } from './company-db';
import { newSiteKey, type DesignerSettings } from './platform';

type Env_ = Pick<Env, 'DB'>;

/** How long a sign-up link works. Longer than a sign-in link: it is often opened later, on another device. */
export const SIGNUP_LINK_HOURS = 24;
/** How many sign-up links one address may be sent in an hour. */
export const SIGNUPS_PER_ADDRESS_PER_HOUR = 3;
/** How many sign-ups may come from one network address in an hour. */
export const SIGNUPS_PER_IP_PER_HOUR = 10;
/** How many sign-ups there may be in a day, in all, so SetOut cannot be used to send mail in bulk. */
export const SIGNUPS_PER_DAY = 200;

const SIGNUP_TOKEN = /^st_[a-z0-9]{32}$/;
const REFERENCE_PREFIX = /^[A-Z][A-Z0-9]{1,5}$/;

// ---------------------------------------------------------------------------
// Opening a company
// ---------------------------------------------------------------------------

export interface NewCompany {
  /** Already tidied: one line, 1 to 100 characters. */
  name: string;
  /** Already normalised. Their user is made if they have none. */
  owner: { email: string; name: string | null };
  /** Who opened it: the owner themselves, by signing up, or SetOut. */
  via: 'sign_up' | 'setout';
  /** The platform admin who added it. Left out when the owner signed up. */
  actorId?: string | null;
  plan: string;
  /** A live key is for a company's real website. A test key may also be framed from a developer's machine. */
  keyKind: 'live' | 'test';
  /** Two to six capitals or digits for job references. Worked out from the name when left out. */
  referencePrefix?: string;
  branding?: Record<string, unknown>;
  /** The company's own settings, such as whether its set-up has been finished. */
  settings?: Record<string, unknown>;
  designer?: {
    name?: string;
    /** The websites that may show the designer. None until the owner adds one. */
    allowedOrigins?: string[];
    /** Empty means SetOut's defaults: its finishes, handles, glass and hinges. */
    settings?: DesignerSettings;
    /** Who is emailed each new design. The owner, unless given. */
    notifyEmails?: string[];
  };
  /** Give the company a trial that ends then. Only with billing on. */
  trialEndsAt?: string | null;
}

export interface OpenedCompany {
  companyId: string;
  referencePrefix: string;
  designerId: string;
  siteKey: string;
  userId: string;
}

/** Words that say nothing about which company it is. */
const FILLER = new Set(['THE', 'AND', 'LTD', 'LIMITED', 'LLP', 'PLC', 'CO', 'COMPANY', 'UK']);

/**
 * The start of a company's job references, from its name: Brennan Glass gives
 * BG, Showerwise gives SHO. Always a letter first, two to four characters, so
 * there is room for a number when it is already taken.
 */
export function prefixFrom(name: string): string {
  const words = name
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9\s&-]/g, '')
    .split(/[\s&-]+/)
    // A reference starts with a letter, so 1st Glass is read as St Glass.
    .map((word) => word.replace(/^[0-9]+/, ''))
    .filter((word) => word && !FILLER.has(word));
  const prefix = words.length > 1 ? words.map((word) => word[0]).join('').slice(0, 4) : (words[0] ?? '').slice(0, 3);
  return prefix.length >= 2 ? prefix : 'SO';
}

/** The prefix itself, then the prefix with 2, 3 and so on, each no longer than six characters. */
function* prefixCandidates(base: string): Generator<string> {
  yield base;
  for (let n = 2; n < 10_000; n++) yield `${base.slice(0, 6 - String(n).length)}${n}`;
}

const isPrefixClash = (error: unknown) => error instanceof Error && /UNIQUE constraint failed: companies\.reference_prefix/i.test(error.message);

/**
 * Make a company with its first designer and its owner. Everything is written
 * together or not at all.
 *
 * What it writes: the company; a designer with a new site key, its settings
 * and who it emails; the owner's user, if they have none, and their
 * membership; the audit log's first two entries; and a trial, if one is given.
 * The making rules are SetOut's defaults until a company has changes of its
 * own, so no ruleset is written.
 */
export async function openCompany(env: Env_, company: NewCompany, now = new Date()): Promise<OpenedCompany> {
  const name = company.name.trim();
  if (name.length === 0 || name.length > 100) throw new DataError('A company needs a name of up to 100 characters.');
  if (company.referencePrefix !== undefined && !REFERENCE_PREFIX.test(company.referencePrefix)) {
    throw new DataError('A reference prefix is two to six capital letters or digits, starting with a letter.');
  }
  const { email } = company.owner;
  const at = now.toISOString();
  const companyId = newId('company');
  const designerId = newId('designer');
  const memberId = newId('member');
  const siteKey = newSiteKey(company.keyKind);
  const designer = company.designer ?? {};
  // Whoever signed up did it themselves. Their user may not exist until this
  // batch has run, so it is found by its address inside the batch.
  const actor = company.via === 'sign_up' ? null : (company.actorId ?? null);
  const actorSql = company.via === 'sign_up' ? '(SELECT id FROM users WHERE email = ?)' : '?';
  const actorValue = company.via === 'sign_up' ? email : actor;

  const base = company.referencePrefix ?? prefixFrom(name);
  const taken = new Set(
    (await env.DB.prepare('SELECT reference_prefix FROM companies WHERE reference_prefix LIKE ?').bind(`${base.slice(0, 2)}%`).all<{ reference_prefix: string }>()).results.map(
      (row) => row.reference_prefix
    )
  );

  let tries = 0;
  for (const prefix of prefixCandidates(base)) {
    if (taken.has(prefix)) {
      // A prefix SetOut chose by hand is used as given or not at all.
      if (company.referencePrefix !== undefined) throw new DataError(`Another company already uses the prefix ${prefix}.`);
      continue;
    }
    const statements = [
      env.DB.prepare(
        'INSERT INTO companies (id, name, reference_prefix, plan, branding, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(companyId, name, prefix, company.plan, JSON.stringify(company.branding ?? {}), JSON.stringify(company.settings ?? {}), at, at),
      env.DB.prepare(
        'INSERT INTO designers (company_id, id, name, site_key, allowed_origins, config, notify_emails, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        companyId,
        designerId,
        designer.name ?? 'Website',
        siteKey,
        JSON.stringify(designer.allowedOrigins ?? []),
        JSON.stringify(designer.settings ?? {}),
        JSON.stringify(designer.notifyEmails ?? [email]),
        at,
        at
      ),
      // A name is filled in if the person has none, and never overwritten.
      env.DB.prepare(
        `INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (email) DO UPDATE SET name = COALESCE(users.name, excluded.name)`
      ).bind(newId('user'), email, company.owner.name, at, at),
      env.DB.prepare(
        `INSERT INTO memberships (company_id, id, user_id, role, created_at, updated_at)
         SELECT ?, ?, id, 'owner', ?, ? FROM users WHERE email = ?`
      ).bind(companyId, memberId, at, at, email),
      env.DB.prepare(
        `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
         VALUES (?, ?, ${actorSql}, 'company_opened', ?, ?, ?)`
      ).bind(companyId, newId('audit'), actorValue, companyId, JSON.stringify({ via: company.via, name, owner: email, plan: company.plan }), at),
      env.DB.prepare(
        `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
         VALUES (?, ?, ${actorSql}, 'member_added', ?, ?, ?)`
      ).bind(companyId, newId('audit'), actorValue, memberId, JSON.stringify({ email, role: 'owner' }), at),
      ...(company.trialEndsAt
        ? [
            env.DB.prepare(
              `INSERT INTO subscriptions (company_id, id, status, trial_ends_at, created_at, updated_at) VALUES (?, ?, 'trialing', ?, ?, ?)`
            ).bind(companyId, newId('subscription'), company.trialEndsAt, at, at),
          ]
        : []),
    ];
    try {
      await env.DB.batch(statements);
    } catch (error) {
      // Two companies with the same initials opened at the same moment: the
      // database let one have the prefix, and this one takes the next.
      if (isPrefixClash(error) && company.referencePrefix === undefined && ++tries < 5) continue;
      throw error;
    }
    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
    if (!user) throw new DataError('The company’s owner was not made.');
    return { companyId, referencePrefix: prefix, designerId, siteKey, userId: user.id };
  }
  throw new DataError('No reference prefix could be found for that name.');
}

// ---------------------------------------------------------------------------
// Signing up
// ---------------------------------------------------------------------------

export interface SignUpRequest {
  /** Already normalised. */
  email: string;
  personName: string;
  companyName: string;
  /** The network address it came from. Only its hash is kept. */
  ip: string | null;
}

export type SignUpAsked =
  | { ok: true; token: string }
  /** The address has been sent enough links for now. The caller answers as if one was sent. */
  | { ok: false; reason: 'too_many_for_address' }
  | { ok: false; reason: 'too_many_from_here' | 'too_many_today' };

/**
 * Keep a sign-up until its link is used, and give back the link's token.
 * Nothing else is made: no company and no user.
 */
export async function requestSignUp(env: Env_, request: SignUpRequest, now = new Date()): Promise<SignUpAsked> {
  const at = now.toISOString();
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const ipHash = request.ip ? await sha256(`signup-ip:${request.ip}`) : null;

  const [forAddress, fromHere, today] = await env.DB.batch<{ n: number }>([
    env.DB.prepare('SELECT COUNT(*) AS n FROM signups WHERE email = ? AND created_at > ?').bind(request.email, hourAgo),
    env.DB.prepare('SELECT COUNT(*) AS n FROM signups WHERE ip_hash = ? AND created_at > ?').bind(ipHash, hourAgo),
    env.DB.prepare('SELECT COUNT(*) AS n FROM signups WHERE created_at > ?').bind(dayAgo),
  ]);
  if ((today.results[0]?.n ?? 0) >= SIGNUPS_PER_DAY) return { ok: false, reason: 'too_many_today' };
  if ((fromHere.results[0]?.n ?? 0) >= SIGNUPS_PER_IP_PER_HOUR) return { ok: false, reason: 'too_many_from_here' };
  if ((forAddress.results[0]?.n ?? 0) >= SIGNUPS_PER_ADDRESS_PER_HOUR) return { ok: false, reason: 'too_many_for_address' };

  const token = newSecret('st');
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO signups (token_hash, email, person_name, company_name, ip_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(await sha256(token), request.email, request.personName, request.companyName, ipHash, at, new Date(now.getTime() + SIGNUP_LINK_HOURS * 3_600_000).toISOString()),
    // Unused sign-ups a day past their time are of no use to anyone. Used
    // ones stay: they say how a company came to be.
    env.DB.prepare('DELETE FROM signups WHERE used_at IS NULL AND expires_at < ?').bind(dayAgo),
  ]);
  return { ok: true, token };
}

export interface SignUpDefaults {
  keyKind: 'live' | 'test';
  /** When the new company's trial ends. Null with billing off: there is no trial to run out. */
  trialEndsAt: string | null;
  /** The bot check widget's public key, so the new designer's enquiries are checked from the first day. */
  turnstileSiteKey?: string;
}

export interface SignedUp extends NewSession {
  companyName: string;
  email: string;
}

/**
 * Use a sign-up link: open the company and sign its owner in. It works once.
 * Two browsers racing with the same link cannot both open a company. Null for
 * a link that is not one, is unknown, used or out of time.
 */
export async function redeemSignUp(env: Env_, token: unknown, defaults: SignUpDefaults, now = new Date()): Promise<SignedUp | null> {
  if (typeof token !== 'string' || !SIGNUP_TOKEN.test(token)) return null;
  const at = now.toISOString();
  const hash = await sha256(token);
  const signup = await env.DB.prepare(
    'UPDATE signups SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email, person_name AS personName, company_name AS companyName'
  )
    .bind(at, hash, at)
    .first<{ email: string; personName: string; companyName: string }>();
  if (!signup) return null;

  let opened: OpenedCompany;
  try {
    opened = await openCompany(
      env,
      {
        name: signup.companyName,
        owner: { email: signup.email, name: signup.personName },
        via: 'sign_up',
        plan: 'trial',
        keyKind: defaults.keyKind,
        // The wizard is offered until the owner has been through it.
        settings: { setUp: { done: false } },
        designer: { settings: defaults.turnstileSiteKey ? { turnstileSiteKey: defaults.turnstileSiteKey } : {} },
        trialEndsAt: defaults.trialEndsAt,
      },
      now
    );
  } catch (error) {
    // Nothing was made, so the link is given back to be tried again.
    await env.DB.prepare('UPDATE signups SET used_at = NULL WHERE token_hash = ?').bind(hash).run();
    throw error;
  }
  await env.DB.prepare('UPDATE signups SET company_id = ? WHERE token_hash = ?').bind(opened.companyId, hash).run();
  const session = await openSession(env, opened.userId, opened.companyId, now);
  return { ...session, companyName: signup.companyName, email: signup.email };
}

// ---------------------------------------------------------------------------
// Set-up
// ---------------------------------------------------------------------------

/** Where a company is with its set-up wizard. Null for a company that was never sent to it. */
export interface SetUpState {
  done: boolean;
  /** The step the owner had reached, counted from 0. */
  step?: number;
}

export function setUpOf(settings: Record<string, unknown>): SetUpState | null {
  const state = settings.setUp;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const { done, step } = state as { done?: unknown; step?: unknown };
  return { done: done === true, ...(typeof step === 'number' && Number.isInteger(step) && step >= 0 && step < 50 ? { step } : {}) };
}

/** Remember where the owner is with the wizard. Only that one key of the company's settings is written. */
export async function saveSetUp(env: Env_, companyId: string, state: SetUpState, now = new Date()): Promise<void> {
  await env.DB.prepare(`UPDATE companies SET settings = json_set(settings, '$.setUp', json(?)), updated_at = ? WHERE id = ?`)
    .bind(JSON.stringify(state), now.toISOString(), companyId)
    .run();
}
