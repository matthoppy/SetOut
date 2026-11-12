/**
 * A company's billing, for its owners: where it stands, the plans on offer,
 * and the way to Stripe's own pages to pay and to manage what is paid.
 *
 * All of it is behind the billing switch. With billing off these answer "not
 * found" and nothing here calls Stripe. SetOut never sees a card: the owner
 * types it on Stripe's pages, and Stripe tells SetOut what happened by
 * webhook (see stripe-webhook.ts).
 */

import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { listPlans, recentMonths } from '../db/admin';
import type { Session } from '../db/auth';
import { companyDb } from '../db/company-db';
import { billingIsOn, standingOf, subscriptionOf } from '../lib/billing';
import { createCheckoutSession, createPortalSession, StripeError } from '../lib/stripe';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const staffBilling = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };
const OFF = { error: 'not_found' } as const;
const NOT_SET_UP = { error: 'billing_not_set_up', message: 'Billing is not set up yet. Please try again later.' } as const;
const STRIPE_DOWN = { error: 'stripe_unavailable', message: 'The payment page could not be opened. Please try again in a minute.' } as const;

staffBilling.use('/billing/*', async (c, next) => {
  if (!billingIsOn(c.env)) return c.json(OFF, 404, PRIVATE);
  await next();
});
staffBilling.use('/billing', async (c, next) => {
  if (!billingIsOn(c.env)) return c.json(OFF, 404, PRIVATE);
  await next();
});

/** Only an owner may pay, or change what is paid. The role is read from the membership on every request. */
const ownersOnly = createMiddleware<Bindings>(async (c, next) => {
  if (c.get('session').role !== 'owner') {
    return c.json({ error: 'owners_only', message: 'Only an owner can change the company’s billing.' }, 403, PRIVATE);
  }
  await next();
});

const baseOf = (env: Env, url: string) => (env.APP_HOST ? `https://${env.APP_HOST}` : new URL(url).origin);

/** Where the company stands, what it has used this month, and the plans it may choose. */
staffBilling.get('/billing', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const [company, subscription, plans] = await Promise.all([db.company(), subscriptionOf(db), listPlans(c.env)]);
  if (!company) return c.json({ error: 'not_found', message: 'This company could not be found.' }, 404, PRIVATE);
  const [month] = recentMonths();
  const usage = await db.usage.get(month);
  const current = plans.find((plan) => plan.id === (subscription?.plan_id ?? company.plan));
  const present = ({ id, name, monthlyPricePence, enquiriesPerMonth }: (typeof plans)[number]) => ({ id, name, monthlyPricePence, enquiriesPerMonth });
  return c.json(
    {
      canChange: session.role === 'owner',
      standing: standingOf(company, subscription),
      plan: current ? present(current) : null,
      currency: company.currency,
      subscription: subscription && {
        status: subscription.status,
        trialEndsAt: subscription.trial_ends_at,
        currentPeriodEndsAt: subscription.current_period_ends_at,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === 1,
        paymentFailedAt: subscription.payment_failed_at,
        // Whether there is anything to manage on Stripe's own pages.
        withStripe: Boolean(subscription.stripe_customer_id),
      },
      usage: { month, enquiries: usage.enquiries, quotesSent: usage.quotes_sent },
      // Only plans that can be paid for are offered.
      plans: plans.filter((plan) => plan.offered && plan.stripePriceId).map(present),
    },
    200,
    PRIVATE
  );
});

/** Start paying for a plan. Answers with Stripe's page to send the browser to. */
staffBilling.post('/billing/checkout', ownersOnly, async (c) => {
  const session = c.get('session');
  if (!c.env.STRIPE_SECRET_KEY) return c.json(NOT_SET_UP, 503, PRIVATE);
  const body = (await c.req.json().catch(() => null)) as { planId?: unknown } | null;
  const plan = (await listPlans(c.env)).find((p) => p.id === body?.planId && p.offered && p.stripePriceId);
  if (!plan?.stripePriceId) return c.json({ error: 'no_such_plan', message: 'That plan is not on offer.' }, 400, PRIVATE);

  const db = companyDb(c.env, session.companyId);
  const subscription = await subscriptionOf(db);
  // A company that is already paying changes plan on Stripe's own pages, so
  // it is never charged twice.
  if (subscription?.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(subscription.status)) {
    return c.json({ error: 'already_subscribed', message: 'This company already has a plan. Use Manage billing to change it.' }, 409, PRIVATE);
  }
  const base = baseOf(c.env, c.req.url);
  try {
    const { url } = await createCheckoutSession(c.env.STRIPE_SECRET_KEY, {
      priceId: plan.stripePriceId,
      companyId: session.companyId,
      customerId: subscription?.stripe_customer_id ?? null,
      email: session.email,
      trialEndsAt: subscription?.status === 'trialing' ? subscription.trial_ends_at : null,
      successUrl: `${base}/billing?paid=1`,
      cancelUrl: `${base}/billing`,
    });
    return c.json({ ok: true, url }, 200, PRIVATE);
  } catch (error) {
    if (!(error instanceof StripeError)) throw error;
    console.error(JSON.stringify({ message: 'checkout failed', company: session.companyId, reason: error.message }));
    return c.json(STRIPE_DOWN, 502, PRIVATE);
  }
});

/** Open Stripe's own page for changing the card or the plan, seeing invoices, or cancelling. */
staffBilling.post('/billing/portal', ownersOnly, async (c) => {
  const session = c.get('session');
  if (!c.env.STRIPE_SECRET_KEY) return c.json(NOT_SET_UP, 503, PRIVATE);
  const subscription = await subscriptionOf(companyDb(c.env, session.companyId));
  if (!subscription?.stripe_customer_id) {
    return c.json({ error: 'no_billing_yet', message: 'There is nothing to manage yet. Choose a plan first.' }, 409, PRIVATE);
  }
  try {
    const { url } = await createPortalSession(c.env.STRIPE_SECRET_KEY, subscription.stripe_customer_id, `${baseOf(c.env, c.req.url)}/billing`);
    return c.json({ ok: true, url }, 200, PRIVATE);
  } catch (error) {
    if (!(error instanceof StripeError)) throw error;
    console.error(JSON.stringify({ message: 'portal failed', company: session.companyId, reason: error.message }));
    return c.json(STRIPE_DOWN, 502, PRIVATE);
  }
});
