/**
 * A company's team: who is on it, and the changes its owners make to it.
 *
 * People are users, which belong to the platform, so this lives beside the
 * sign-in code and not in the company data layer.
 *
 * Every change is written to the company's audit log in the same batch as the
 * change itself, and only if the change was made, so the log never says
 * something happened that did not.
 *
 * A company always keeps at least one owner. That is checked inside the
 * statement that makes the change, so two owners demoting each other at the
 * same moment cannot leave it with none.
 */

import { newId } from '../lib/ids';
import type { AuditAction, Role } from './tables';

type Env_ = Pick<Env, 'DB'>;

/** How many people a company may add in a day, so nobody can use SetOut to send mail in bulk. */
export const ADDS_PER_DAY = 20;

export interface TeamMember {
  /** The membership's id. A change to the team names this. */
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  joinedAt: string;
  lastSignedInAt: string | null;
}

export interface TeamChange {
  id: string;
  action: AuditAction;
  /** Who made it. Null when SetOut did. */
  by: { email: string; name: string | null } | null;
  /** Who it was made to, and what changed: { email, role } or { email, from, to }. */
  data: Record<string, unknown>;
  at: string;
}

const MEMBER = `SELECT m.id, m.user_id AS userId, u.email, u.name, m.role, m.created_at AS joinedAt, u.last_signed_in_at AS lastSignedInAt
                  FROM memberships m JOIN users u ON u.id = m.user_id`;

/** Everyone on the team, in the order they joined. */
export async function teamOf(env: Env_, companyId: string): Promise<TeamMember[]> {
  const rows = await env.DB.prepare(`${MEMBER} WHERE m.company_id = ? ORDER BY m.created_at, m.id`).bind(companyId).all<TeamMember>();
  return rows.results;
}

async function memberOf(env: Env_, companyId: string, memberId: string): Promise<TeamMember | null> {
  return env.DB.prepare(`${MEMBER} WHERE m.company_id = ? AND m.id = ?`).bind(companyId, memberId).first<TeamMember>();
}

/** True for the statement that keeps a company's last owner: the row may change if it is not an owner, or if another owner is left. */
const NOT_LAST_OWNER = `(role <> 'owner' OR (SELECT COUNT(*) FROM memberships WHERE company_id = ? AND role = 'owner') > 1)`;

/** The audit entry for a change, written only if the statement before it changed exactly one row. */
function record(env: Env_, companyId: string, actorId: string | null, action: AuditAction, targetId: string, data: object, at: string) {
  return env.DB.prepare(
    `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`
  ).bind(companyId, newId('audit'), actorId, action, targetId, JSON.stringify(data), at);
}

export type AddResult = { ok: true; member: TeamMember } | { ok: false; reason: 'already_on_team' | 'too_many_today' };

/**
 * Put a person on the team. Their user is made if they have none. The email
 * address must already be normalised. Someone already on the team is left as
 * they are.
 */
export async function addToTeam(
  env: Env_,
  companyId: string,
  actorId: string | null,
  person: { email: string; name: string | null; role: Role },
  now = new Date()
): Promise<AddResult> {
  const at = now.toISOString();
  const today = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM audit_log WHERE company_id = ? AND action = 'member_added' AND created_at > ?"
  )
    .bind(companyId, new Date(now.getTime() - 86_400_000).toISOString())
    .first<{ n: number }>();
  if ((today?.n ?? 0) >= ADDS_PER_DAY) return { ok: false, reason: 'too_many_today' };

  const memberId = newId('member');
  const [, added] = await env.DB.batch([
    // A name is filled in if the person has none, and never overwritten.
    env.DB.prepare(
      `INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (email) DO UPDATE SET name = COALESCE(users.name, excluded.name)`
    ).bind(newId('user'), person.email, person.name, at, at),
    env.DB.prepare(
      `INSERT INTO memberships (company_id, id, user_id, role, created_at, updated_at)
       SELECT ?, ?, id, ?, ?, ? FROM users WHERE email = ?
         ON CONFLICT (company_id, user_id) DO NOTHING`
    ).bind(companyId, memberId, person.role, at, at, person.email),
    record(env, companyId, actorId, 'member_added', memberId, { email: person.email, role: person.role }, at),
  ]);
  if (added.meta.changes !== 1) return { ok: false, reason: 'already_on_team' };
  const member = await memberOf(env, companyId, memberId);
  if (!member) throw new Error('The member was not added.');
  return { ok: true, member };
}

export type ChangeResult = 'changed' | 'unchanged' | 'not_found' | 'last_owner';

/** Give someone on the team another role. The last owner cannot stop being one. */
export async function changeRole(
  env: Env_,
  companyId: string,
  actorId: string | null,
  memberId: string,
  role: Role,
  now = new Date()
): Promise<ChangeResult> {
  const current = await memberOf(env, companyId, memberId);
  if (!current) return 'not_found';
  if (current.role === role) return 'unchanged';
  const at = now.toISOString();
  const [changed] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE memberships SET role = ?, updated_at = ? WHERE company_id = ? AND id = ? AND role = ? AND ${NOT_LAST_OWNER}`
    ).bind(role, at, companyId, memberId, current.role, companyId),
    record(env, companyId, actorId, 'role_changed', memberId, { email: current.email, from: current.role, to: role }, at),
  ]);
  if (changed.meta.changes === 1) return 'changed';
  // Someone else got there first, or this is the last owner.
  const now_ = await memberOf(env, companyId, memberId);
  if (!now_) return 'not_found';
  return now_.role === role ? 'unchanged' : 'last_owner';
}

export type RemoveResult = 'removed' | 'not_found' | 'last_owner';

/**
 * Take someone off the team. Their browsers stop working for this company at
 * once: every request checks the membership, and their sessions here are
 * removed as well. The last owner cannot be removed.
 */
export async function removeFromTeam(
  env: Env_,
  companyId: string,
  actorId: string | null,
  memberId: string,
  now = new Date()
): Promise<RemoveResult> {
  const current = await memberOf(env, companyId, memberId);
  if (!current) return 'not_found';
  const at = now.toISOString();
  const [removed] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM memberships WHERE company_id = ? AND id = ? AND ${NOT_LAST_OWNER}`).bind(companyId, memberId, companyId),
    record(env, companyId, actorId, 'member_removed', memberId, { email: current.email, role: current.role }, at),
    env.DB.prepare(
      `DELETE FROM sessions WHERE company_id = ? AND user_id = ?
         AND NOT EXISTS (SELECT 1 FROM memberships WHERE company_id = ? AND user_id = ?)`
    ).bind(companyId, current.userId, companyId, current.userId),
  ]);
  if (removed.meta.changes === 1) return 'removed';
  return (await memberOf(env, companyId, memberId)) ? 'last_owner' : 'not_found';
}

/** The latest changes to the team, newest first. */
export async function teamChanges(env: Env_, companyId: string, limit = 30): Promise<TeamChange[]> {
  const rows = await env.DB.prepare(
    `SELECT a.id, a.action, a.data, a.created_at AS at, u.email AS byEmail, u.name AS byName
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.company_id = ? AND a.action IN ('member_added', 'member_removed', 'role_changed')
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?`
  )
    .bind(companyId, limit)
    .all<{ id: string; action: AuditAction; data: string; at: string; byEmail: string | null; byName: string | null }>();
  return rows.results.map((row) => {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      // An unreadable entry still says what happened and when.
    }
    return { id: row.id, action: row.action, by: row.byEmail ? { email: row.byEmail, name: row.byName } : null, data, at: row.at };
  });
}
