/**
 * Stripe's webhook: how SetOut hears what happened to a payment.
 *
 * Anyone can post to this address, so nothing is read until the signature
 * has been checked against the endpoint's secret: the body exactly as it
 * arrived, signed by Stripe, within the last five minutes. A message is
 * handled once however often it is delivered.
 *
 * With billing off this answers "not found".
 */

import { Hono } from 'hono';
import { forgetStripeEvent, rememberStripeEvent } from '../db/admin';
import { companyDb } from '../db/company-db';
import { teamOf } from '../db/team';
import { billingIsOn, handleStripeEvent, readStripeEvent } from '../lib/billing';
import { sendEmail } from '../lib/email';
import { fromLine, mailIsSetUp } from '../lib/notify';
import { paymentFailedEmail } from '../lib/sign-up';
import { verifyStripeSignature } from '../lib/stripe';

export const stripeWebhook = new Hono<{ Bindings: Env }>();

/** Far more than any of Stripe's messages. */
const MAX_BODY_BYTES = 512 * 1024;

stripeWebhook.post('/webhook', async (c) => {
  if (!billingIsOn(c.env)) return c.json({ error: 'not_found' }, 404);
  if (!c.env.STRIPE_WEBHOOK_SECRET) return c.json({ error: 'billing_not_set_up' }, 503);
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY_BYTES) return c.json({ error: 'too_large' }, 413);

  const body = await c.req.text();
  if (body.length > MAX_BODY_BYTES) return c.json({ error: 'too_large' }, 413);
  if (!(await verifyStripeSignature(c.env.STRIPE_WEBHOOK_SECRET, c.req.header('stripe-signature'), body))) {
    return c.json({ error: 'bad_signature' }, 400);
  }
  const event = readStripeEvent(body);
  if (!event) return c.json({ error: 'invalid_event' }, 400);

  // Stripe sends a message again until it is told it arrived, and sometimes
  // twice anyway.
  if (!(await rememberStripeEvent(c.env, event.id, event.type))) return c.json({ ok: true, handled: 'already' });

  let handled;
  try {
    handled = await handleStripeEvent(c.env, event);
  } catch (error) {
    // Not handled, so not remembered: Stripe's next try gets another go.
    await forgetStripeEvent(c.env, event.id);
    throw error;
  }
  console.log(JSON.stringify({ message: 'stripe event', type: event.type, ...handled }));

  if (handled.outcome === 'recorded' && handled.paymentFailed) {
    const mail = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
    if (mailIsSetUp(mail)) {
      const [company, team] = await Promise.all([companyDb(c.env, handled.companyId).company(), teamOf(c.env, handled.companyId)]);
      const owners = team.filter((member) => member.role === 'owner').map((member) => member.email).slice(0, 10);
      if (company && owners.length > 0) {
        const base = c.env.APP_HOST ? `https://${c.env.APP_HOST}` : new URL(c.req.url).origin;
        c.executionCtx.waitUntil(
          sendEmail(mail.apiKey, paymentFailedEmail(fromLine('SetOut', mail.from), owners, { companyName: company.name, link: `${base}/billing` })).catch(
            (error: unknown) => {
              console.error(JSON.stringify({ message: 'payment email failed', reason: error instanceof Error ? error.message : String(error) }));
            }
          )
        );
      }
    }
  }
  return c.json({ ok: true, handled: handled.outcome });
});
