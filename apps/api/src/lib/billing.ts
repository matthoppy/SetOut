/**
 * Billing: whether it is switched on, where a company stands, and what
 * Stripe's messages change.
 *
 * Billing is off unless BILLING says "on". Off, there are no billing pages,
 * no company is ever locked, and nothing here calls Stripe.
 *
 * A subscription is the company's own row, read and written through the
 * company-scoped data layer like the rest of its data. A webhook is tied to
 * a company first, by the Stripe customer SetOut recorded for it, and only
 * then is anything read or written.
 */

import { companyByStripeCustomer, planByStripePrice, setPlanFromStripe } from '../db/admin';
import { companyDb, type CompanyDb } from '../db/company-db';
import { SUBSCRIPTION_STATUSES, type Row, type SubscriptionStatus } from '../db/tables';

/** How long a trial lasts unless TRIAL_DAYS says otherwise. */
export const DEFAULT_TRIAL_DAYS = 14;

export const billingIsOn = (env: Pick<Env, 'BILLING'>): boolean => env.BILLING === 'on';

/** How many days a new company's trial lasts: TRIAL_DAYS if it is a sensible number, or 14. */
export function trialDays(env: Pick<Env, 'TRIAL_DAYS'>): number {
  const days = Number(env.TRIAL_DAYS);
  return Number.isInteger(days) && days >= 1 && days <= 365 ? days : DEFAULT_TRIAL_DAYS;
}

/** When a trial that starts now ends. */
export const trialEnd = (env: Pick<Env, 'TRIAL_DAYS'>, now = new Date()): string => new Date(now.getTime() + trialDays(env) * 86_400_000).toISOString();

/**
 * Where a company stands:
 *
 *   free         a free account, by arrangement. Never locked.
 *   none         no subscription and no trial: a company from before billing,
 *                or one that signed up while it was off. Never locked.
 *   trial        in its trial.
 *   active       paying.
 *   past_due     a payment failed and Stripe is trying again. Not locked.
 *   trial_ended  the trial ran out with no plan chosen. Locked.
 *   ended        cancelled, or Stripe gave up on the payment. Locked.
 */
export type BillingState = 'free' | 'none' | 'trial' | 'active' | 'past_due' | 'trial_ended' | 'ended';

export interface Standing {
  state: BillingState;
  /** Locked: staff can sign in and reach the billing page, and nothing else. The designer keeps working. */
  locked: boolean;
  /** Whole days of trial left, counting today. */
  trialDaysLeft?: number;
}

export function standingOf(company: { plan: string }, subscription: Row<'subscriptions'> | null, now = new Date()): Standing {
  if (company.plan === 'free') return { state: 'free', locked: false };
  if (!subscription) return { state: 'none', locked: false };
  const { status } = subscription;
  if (status === 'active') return { state: 'active', locked: false };
  if (status === 'past_due' || status === 'incomplete') return { state: 'past_due', locked: false };
  if (status === 'trialing') {
    const ends = subscription.trial_ends_at ? Date.parse(subscription.trial_ends_at) : NaN;
    const left = Number.isFinite(ends) ? Math.ceil((ends - now.getTime()) / 86_400_000) : 0;
    // With a card already taken, Stripe charges it when the trial ends and
    // says so. Until it does, the trial is not over.
    if (left > 0 || subscription.stripe_subscription_id) return { state: 'trial', locked: false, trialDaysLeft: Math.max(left, 0) };
    return { state: 'trial_ended', locked: true };
  }
  return { state: 'ended', locked: true };
}

/** A company's subscription, if it has one. */
export async function subscriptionOf(db: CompanyDb): Promise<Row<'subscriptions'> | null> {
  return (await db.find('subscriptions', { limit: 1 }))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Stripe's messages
// ---------------------------------------------------------------------------

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const idOf = (v: unknown): string | null => (typeof v === 'string' ? v : isObject(v) && typeof v.id === 'string' ? v.id : null);
const isoOf = (seconds: unknown): string | null => (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null);
const COMPANY_ID = /^co_[0-9A-HJKMNP-TV-Z]{26}$/;

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Loose };
}

/** A webhook's body as an event, or null if it is not one. Only called once its signature has been checked. */
export function readStripeEvent(body: string): StripeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isObject(parsed) || typeof parsed.id !== 'string' || !/^evt_[A-Za-z0-9_]{1,250}$/.test(parsed.id) || typeof parsed.type !== 'string') return null;
  if (!isObject(parsed.data) || !isObject(parsed.data.object)) return null;
  return { id: parsed.id, type: parsed.type, data: { object: parsed.data.object } };
}

export type Handled =
  /** Something was recorded for this company. */
  | { outcome: 'recorded'; companyId: string; paymentFailed?: boolean }
  /** Not a message SetOut acts on, or about a customer it does not know. Nothing was changed. */
  | { outcome: 'ignored'; reason: string };

/** Write these to the company's subscription, making it if it has none. */
async function record(db: CompanyDb, changes: Partial<Omit<Row<'subscriptions'>, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
  const existing = await subscriptionOf(db);
  if (existing) await db.update('subscriptions', existing.id, changes);
  else await db.insert('subscriptions', { status: 'incomplete', ...changes });
}

/**
 * The company a subscription message is about: the one SetOut recorded for
 * its Stripe customer, or, for a customer not yet recorded, the company whose
 * id SetOut itself put on the subscription when Checkout was started. A
 * company that already has a different Stripe customer is never taken over.
 */
async function companyOfSubscription(env: Pick<Env, 'DB'>, subscription: Loose): Promise<string | null> {
  const customer = idOf(subscription.customer);
  const known = await companyByStripeCustomer(env, customer);
  if (known) return known;
  const named = isObject(subscription.metadata) ? subscription.metadata.company_id : null;
  if (typeof named !== 'string' || !COMPANY_ID.test(named)) return null;
  const db = companyDb(env, named);
  if (!(await db.company())) return null;
  const existing = await subscriptionOf(db);
  if (existing?.stripe_customer_id && existing.stripe_customer_id !== customer) return null;
  return named;
}

/**
 * Act on one of Stripe's messages. The caller has checked its signature and
 * that it has not been handled before.
 */
export async function handleStripeEvent(env: Pick<Env, 'DB'>, event: StripeEvent): Promise<Handled> {
  const object = event.data.object;

  switch (event.type) {
    // The owner finished Checkout. This ties the company to its Stripe
    // customer. The company is the one SetOut named when it started Checkout,
    // twice over: a payment link made by hand in Stripe cannot name one.
    case 'checkout.session.completed': {
      const companyId = object.client_reference_id;
      const named = isObject(object.metadata) ? object.metadata.company_id : null;
      if (object.mode !== 'subscription' || typeof companyId !== 'string' || !COMPANY_ID.test(companyId) || named !== companyId) {
        return { outcome: 'ignored', reason: 'not a SetOut checkout' };
      }
      const customer = idOf(object.customer);
      const subscription = idOf(object.subscription);
      if (!customer || !subscription) return { outcome: 'ignored', reason: 'no customer or subscription' };
      const db = companyDb(env, companyId);
      if (!(await db.company())) return { outcome: 'ignored', reason: 'unknown company' };
      const existing = await subscriptionOf(db);
      if (existing?.stripe_customer_id && existing.stripe_customer_id !== customer) {
        return { outcome: 'ignored', reason: 'company has another customer' };
      }
      const owner = await companyByStripeCustomer(env, customer);
      if (owner && owner !== companyId) return { outcome: 'ignored', reason: 'customer belongs to another company' };
      await record(db, { stripe_customer_id: customer, stripe_subscription_id: subscription });
      return { outcome: 'recorded', companyId };
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const companyId = await companyOfSubscription(env, object);
      if (!companyId) return { outcome: 'ignored', reason: 'unknown customer' };
      const status = event.type === 'customer.subscription.deleted' ? 'canceled' : object.status;
      if (typeof status !== 'string' || !(SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) {
        return { outcome: 'ignored', reason: 'unknown status' };
      }
      const db = companyDb(env, companyId);
      const existing = await subscriptionOf(db);
      // An older subscription ending must not undo a newer one.
      const id = idOf(object.id);
      if (event.type === 'customer.subscription.deleted' && existing?.stripe_subscription_id && existing.stripe_subscription_id !== id) {
        return { outcome: 'ignored', reason: 'not the current subscription' };
      }
      const items = isObject(object.items) && Array.isArray(object.items.data) ? (object.items.data as unknown[]).filter(isObject) : [];
      const price = idOf(items[0]?.price);
      const plan = price ? await planByStripePrice(env, price) : null;
      // Stripe moved the period's end from the subscription to its items.
      // Either is read, so the account's API version does not matter.
      const periodEnd = isoOf(object.current_period_end) ?? isoOf(items[0]?.current_period_end);
      await record(db, {
        status: status as SubscriptionStatus,
        stripe_customer_id: idOf(object.customer),
        stripe_subscription_id: id,
        ...(plan ? { plan_id: plan.id } : {}),
        trial_ends_at: isoOf(object.trial_end) ?? (status === 'trialing' ? (existing?.trial_ends_at ?? null) : null),
        current_period_ends_at: periodEnd ?? existing?.current_period_ends_at ?? null,
        cancel_at_period_end: object.cancel_at_period_end === true ? 1 : 0,
        ...(status === 'active' ? { payment_failed_at: null } : {}),
      });
      if (plan && status !== 'canceled') await setPlanFromStripe(env, companyId, plan.id);
      return { outcome: 'recorded', companyId };
    }

    case 'invoice.payment_failed':
    case 'invoice.paid': {
      const companyId = await companyByStripeCustomer(env, idOf(object.customer));
      if (!companyId) return { outcome: 'ignored', reason: 'unknown customer' };
      const db = companyDb(env, companyId);
      const failed = event.type === 'invoice.payment_failed';
      await record(db, { payment_failed_at: failed ? new Date().toISOString() : null });
      return { outcome: 'recorded', companyId, ...(failed ? { paymentFailed: true } : {}) };
    }

    default:
      return { outcome: 'ignored', reason: 'not acted on' };
  }
}
