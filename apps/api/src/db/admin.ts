/**
 * SetOut's own view of every company, for the platform admin, and the plans
 * and Stripe records that belong to the platform rather than to a company.
 *
 * Everything here works across companies, so it is used only by the
 * platform's routes, which check on every request that the person is one of
 * SetOut's own staff, and by Stripe's webhook, which has no company until
 * this file finds it one. Nothing in it reads a company's customers, jobs or
 * designs: only the account itself, who owns it, and how much it has used.
 *
 * Whatever SetOut does to a company is written to that company's audit log
 * in the same batch, and only if it was done.
 */

import { newId } from '../lib/ids';
import { DataError } from './company-db';
import type { AuditAction, SubscriptionStatus } from './tables';

type Env_ = Pick<Env, 'DB'>;

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export interface Plan {
  id: string;
  name: string;
  /** What it costs a month, in pence, before VAT. */
  monthlyPricePence: number;
  /** How many designs a month it includes. Null means no limit. */
  enquiriesPerMonth: number | null;
  /** Stripe's id for the price it is charged as. Null for a plan nobody pays for. */
  stripePriceId: string | null;
  /** Whether an owner may choose it on the billing page. */
  offered: boolean;
  position: number;
}

const PLAN = `SELECT id, name, monthly_price_pence AS monthlyPricePence, enquiries_per_month AS enquiriesPerMonth,
                     stripe_price_id AS stripePriceId, offered, position FROM plans`;

const asPlan = (row: Omit<Plan, 'offered'> & { offered: number }): Plan => ({ ...row, offered: row.offered === 1 });

export async function listPlans(env: Env_): Promise<Plan[]> {
  const rows = await env.DB.prepare(`${PLAN} ORDER BY position, id`).all<Omit<Plan, 'offered'> & { offered: number }>();
  return rows.results.map(asPlan);
}

export async function planById(env: Env_, id: string): Promise<Plan | null> {
  const row = await env.DB.prepare(`${PLAN} WHERE id = ?`).bind(id).first<Omit<Plan, 'offered'> & { offered: number }>();
  return row ? asPlan(row) : null;
}

/** The plan a Stripe price is for. This is how a webhook says which plan a company is now on. */
export async function planByStripePrice(env: Env_, priceId: string): Promise<Plan | null> {
  const row = await env.DB.prepare(`${PLAN} WHERE stripe_price_id = ?`).bind(priceId).first<Omit<Plan, 'offered'> & { offered: number }>();
  return row ? asPlan(row) : null;
}

/** Add a plan, or change one. The id is what companies.plan holds, so it never changes. */
export async function savePlan(env: Env_, plan: Plan, now = new Date()): Promise<void> {
  const at = now.toISOString();
  try {
    await env.DB.prepare(
      `INSERT INTO plans (id, name, monthly_price_pence, enquiries_per_month, stripe_price_id, offered, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, monthly_price_pence = excluded.monthly_price_pence,
         enquiries_per_month = excluded.enquiries_per_month, stripe_price_id = excluded.stripe_price_id,
         offered = excluded.offered, position = excluded.position, updated_at = excluded.updated_at`
    )
      .bind(plan.id, plan.name, plan.monthlyPricePence, plan.enquiriesPerMonth, plan.stripePriceId, plan.offered ? 1 : 0, plan.position, at, at)
      .run();
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: plans\.stripe_price_id/i.test(error.message)) {
      throw new DataError('Another plan is already charged as that Stripe price.');
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Every company
// ---------------------------------------------------------------------------

export interface CompanySummary {
  id: string;
  name: string;
  referencePrefix: string;
  status: string;
  plan: string;
  createdAt: string;
  /** How it was opened: by signing up, by SetOut, or, for the first companies, by a seed script. */
  openedVia: 'sign_up' | 'setout' | 'seed';
  owners: { email: string; name: string | null; lastSignedInAt: string | null }[];
  people: number;
  designers: { id: string; name: string; siteKey: string; status: string; websites: string[] }[];
  /** Designs received and quotes sent, this month and last. */
  usage: { month: string; enquiries: number; quotesSent: number }[];
  setUpDone: boolean | null;
  subscription: {
    status: SubscriptionStatus;
    planId: string | null;
    trialEndsAt: string | null;
    currentPeriodEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    paymentFailedAt: string | null;
    /** Whether Stripe has a customer for it. The id itself stays on the server. */
    withStripe: boolean;
  } | null;
}

const monthOf = (date: Date) => date.toISOString().slice(0, 7);

/** This month and the one before it, as usage is counted: 2026-11, 2026-10. */
export function recentMonths(now = new Date()): [string, string] {
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return [monthOf(now), monthOf(last)];
}

const jsonList = (text: string): string[] => {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

/** Every company, newest first, with who owns it, its designers, what it has used and its subscription. */
export async function listCompanies(env: Env_, now = new Date()): Promise<CompanySummary[]> {
  const months = recentMonths(now);
  const [companies, owners, people, designers, usage, subscriptions, opened] = await env.DB.batch([
    env.DB.prepare(
      `SELECT id, name, reference_prefix AS referencePrefix, status, plan, created_at AS createdAt,
              json_extract(settings, '$.setUp.done') AS setUpDone
         FROM companies ORDER BY created_at DESC, id DESC LIMIT 1000`
    ),
    env.DB.prepare(
      `SELECT m.company_id AS companyId, u.email, u.name, u.last_signed_in_at AS lastSignedInAt
         FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.role = 'owner' ORDER BY m.created_at`
    ),
    env.DB.prepare('SELECT company_id AS companyId, COUNT(*) AS n FROM memberships GROUP BY company_id'),
    env.DB.prepare('SELECT company_id AS companyId, id, name, site_key AS siteKey, status, allowed_origins AS origins FROM designers ORDER BY created_at, id'),
    env.DB.prepare('SELECT company_id AS companyId, month, enquiries, quotes_sent AS quotesSent FROM usage_monthly WHERE month IN (?, ?)').bind(...months),
    env.DB.prepare(
      `SELECT company_id AS companyId, status, plan_id AS planId, trial_ends_at AS trialEndsAt, current_period_ends_at AS currentPeriodEndsAt,
              cancel_at_period_end AS cancelAtPeriodEnd, payment_failed_at AS paymentFailedAt, stripe_customer_id AS customer
         FROM subscriptions`
    ),
    env.DB.prepare(`SELECT company_id AS companyId, json_extract(data, '$.via') AS via FROM audit_log WHERE action = 'company_opened'`),
  ]);

  type Keyed = { companyId: string };
  const by = <T extends Keyed>(rows: unknown[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows as T[]) map.set(row.companyId, [...(map.get(row.companyId) ?? []), row]);
    return map;
  };
  const ownersBy = by<Keyed & CompanySummary['owners'][number]>(owners.results);
  const peopleBy = by<Keyed & { n: number }>(people.results);
  const designersBy = by<Keyed & { id: string; name: string; siteKey: string; status: string; origins: string }>(designers.results);
  const usageBy = by<Keyed & { month: string; enquiries: number; quotesSent: number }>(usage.results);
  const subscriptionBy = by<
    Keyed & {
      status: SubscriptionStatus;
      planId: string | null;
      trialEndsAt: string | null;
      currentPeriodEndsAt: string | null;
      cancelAtPeriodEnd: number;
      paymentFailedAt: string | null;
      customer: string | null;
    }
  >(subscriptions.results);
  const openedBy = by<Keyed & { via: unknown }>(opened.results);

  return (companies.results as (Pick<CompanySummary, 'id' | 'name' | 'referencePrefix' | 'status' | 'plan' | 'createdAt'> & { setUpDone: number | null })[]).map(
    (company) => {
      const subscription = subscriptionBy.get(company.id)?.[0];
      const via = openedBy.get(company.id)?.[0]?.via;
      return {
        id: company.id,
        name: company.name,
        referencePrefix: company.referencePrefix,
        status: company.status,
        plan: company.plan,
        createdAt: company.createdAt,
        openedVia: via === 'sign_up' || via === 'setout' ? via : 'seed',
        owners: (ownersBy.get(company.id) ?? []).map(({ email, name, lastSignedInAt }) => ({ email, name, lastSignedInAt })),
        people: peopleBy.get(company.id)?.[0]?.n ?? 0,
        designers: (designersBy.get(company.id) ?? []).map((d) => ({ id: d.id, name: d.name, siteKey: d.siteKey, status: d.status, websites: jsonList(d.origins) })),
        usage: months.map((month) => {
          const used = usageBy.get(company.id)?.find((u) => u.month === month);
          return { month, enquiries: used?.enquiries ?? 0, quotesSent: used?.quotesSent ?? 0 };
        }),
        setUpDone: company.setUpDone === null ? null : company.setUpDone === 1,
        subscription: subscription
          ? {
              status: subscription.status,
              planId: subscription.planId,
              trialEndsAt: subscription.trialEndsAt,
              currentPeriodEndsAt: subscription.currentPeriodEndsAt,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd === 1,
              paymentFailedAt: subscription.paymentFailedAt,
              withStripe: Boolean(subscription.customer),
            }
          : null,
      };
    }
  );
}

// ---------------------------------------------------------------------------
// What SetOut does to a company
// ---------------------------------------------------------------------------

/** The audit entry for something SetOut did, written only if the statement before it changed exactly one row. */
function record(env: Env_, companyId: string, actorId: string, action: AuditAction, data: object, at: string) {
  return env.DB.prepare(
    `INSERT INTO audit_log (company_id, id, actor_id, action, target_id, data, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`
  ).bind(companyId, newId('audit'), actorId, action, companyId, JSON.stringify({ ...data, by: 'setout' }), at);
}

export type AdminResult = 'changed' | 'unchanged' | 'not_found';

async function exists(env: Env_, companyId: string): Promise<{ status: string; plan: string } | null> {
  return env.DB.prepare('SELECT status, plan FROM companies WHERE id = ?').bind(companyId).first<{ status: string; plan: string }>();
}

/**
 * Switch a company off, or back on. Switched off, its designer stops
 * loading, its staff are signed out and cannot sign in, and its quote links
 * stop opening: everything that finds a company checks that it is active.
 * Nothing is deleted.
 */
export async function setCompanyStatus(
  env: Env_,
  companyId: string,
  actorId: string,
  status: 'active' | 'suspended',
  reason: string | null,
  now = new Date()
): Promise<AdminResult> {
  const company = await exists(env, companyId);
  if (!company) return 'not_found';
  if (company.status === status) return 'unchanged';
  const at = now.toISOString();
  const [changed] = await env.DB.batch([
    env.DB.prepare('UPDATE companies SET status = ?, updated_at = ? WHERE id = ? AND status = ?').bind(status, at, companyId, company.status),
    record(env, companyId, actorId, status === 'active' ? 'company_switched_on' : 'company_switched_off', reason ? { reason } : {}, at),
    // Signed-in browsers stop working at once either way. Removing their
    // sessions as well means switching back on does not sign anyone in.
    ...(status === 'suspended' ? [env.DB.prepare('DELETE FROM sessions WHERE company_id = ?').bind(companyId)] : []),
  ]);
  return changed.meta.changes === 1 ? 'changed' : 'unchanged';
}

/** Put a company on another plan. The plan must be one SetOut keeps, or the trial every new company starts on. */
export async function setCompanyPlan(env: Env_, companyId: string, actorId: string, planId: string, now = new Date()): Promise<AdminResult | 'no_such_plan'> {
  const company = await exists(env, companyId);
  if (!company) return 'not_found';
  if (planId !== 'trial' && !(await planById(env, planId))) return 'no_such_plan';
  if (company.plan === planId) return 'unchanged';
  const at = now.toISOString();
  const [changed] = await env.DB.batch([
    env.DB.prepare('UPDATE companies SET plan = ?, updated_at = ? WHERE id = ? AND plan = ?').bind(planId, at, companyId, company.plan),
    record(env, companyId, actorId, 'plan_changed', { from: company.plan, to: planId }, at),
  ]);
  return changed.meta.changes === 1 ? 'changed' : 'unchanged';
}

/**
 * Start a company's trial, or start it again, ending then. For a company that
 * signed up while billing was off, and so has no trial to run out. Refused
 * for one that already pays through Stripe.
 */
export async function startTrial(env: Env_, companyId: string, actorId: string, endsAt: string, now = new Date()): Promise<AdminResult | 'already_paying'> {
  if (!(await exists(env, companyId))) return 'not_found';
  const at = now.toISOString();
  const [started] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO subscriptions (company_id, id, status, trial_ends_at, created_at, updated_at) VALUES (?, ?, 'trialing', ?, ?, ?)
         ON CONFLICT (company_id) DO UPDATE SET status = 'trialing', trial_ends_at = excluded.trial_ends_at, updated_at = excluded.updated_at
         WHERE subscriptions.stripe_subscription_id IS NULL`
    ).bind(companyId, newId('subscription'), endsAt, at, at),
    record(env, companyId, actorId, 'trial_started', { endsAt }, at),
  ]);
  return started.meta.changes === 1 ? 'changed' : 'already_paying';
}

// ---------------------------------------------------------------------------
// Stripe
// ---------------------------------------------------------------------------

/**
 * The company a Stripe customer belongs to. Like a site key, this is how a
 * request with no sign-in, here Stripe's webhook, comes to belong to a
 * company. Everything after it goes through companyDb with the company found.
 */
export async function companyByStripeCustomer(env: Env_, customerId: unknown): Promise<string | null> {
  if (typeof customerId !== 'string' || !/^cus_[A-Za-z0-9]{1,250}$/.test(customerId)) return null;
  const row = await env.DB.prepare('SELECT company_id AS companyId FROM subscriptions WHERE stripe_customer_id = ?').bind(customerId).first<{ companyId: string }>();
  return row?.companyId ?? null;
}

/** Remember one of Stripe's messages. False if it has been handled before. */
export async function rememberStripeEvent(env: Env_, id: string, type: string, now = new Date()): Promise<boolean> {
  const result = await env.DB.prepare('INSERT INTO stripe_events (id, type, created_at) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING')
    .bind(id, type, now.toISOString())
    .run();
  return result.meta.changes === 1;
}

/** Forget a message that could not be handled, so that Stripe's next try is. */
export async function forgetStripeEvent(env: Env_, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM stripe_events WHERE id = ?').bind(id).run();
}

/** The plan a company is on, as Stripe now says it is. Not in the audit log: nobody at SetOut did it. */
export async function setPlanFromStripe(env: Env_, companyId: string, planId: string, now = new Date()): Promise<void> {
  await env.DB.prepare('UPDATE companies SET plan = ?, updated_at = ? WHERE id = ? AND plan <> ?').bind(planId, now.toISOString(), companyId, planId).run();
}
