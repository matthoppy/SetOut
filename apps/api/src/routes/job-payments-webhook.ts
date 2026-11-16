/**
 * The company's Stripe webhook: how SetOut hears what happened to a
 * customer's payment for a job. Not SetOut's own billing webhook
 * (stripe-webhook.ts): a different Stripe account, a different endpoint and
 * a different secret, JOB_STRIPE_WEBHOOK_SECRET.
 *
 * Anyone can post here, so nothing is read until the signature has been
 * checked: the body exactly as it arrived, signed with the endpoint's secret,
 * within the last five minutes. A message is handled once however often it is
 * delivered. A live-mode message is refused unless live payments are allowed.
 *
 * With payments off this answers "not found".
 */

import { Hono } from 'hono';
import { forgetJobStripeEvent, rememberJobStripeEvent } from '../db/admin';
import { handleJobPaymentMessage, readMessage } from '../lib/job-payment-events';
import { webhookCompany } from '../lib/job-payments';
import { verifyStripeSignature } from '../lib/stripe';

export const jobPaymentsWebhook = new Hono<{ Bindings: Env }>();

/** Far more than any of Stripe's messages. */
const MAX_BODY_BYTES = 512 * 1024;

jobPaymentsWebhook.post('/webhook', async (c) => {
  const companyId = webhookCompany(c.env);
  if (!companyId) return c.json({ error: 'not_found' }, 404);
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY_BYTES) return c.json({ error: 'too_large' }, 413);

  const body = await c.req.text();
  if (body.length > MAX_BODY_BYTES) return c.json({ error: 'too_large' }, 413);
  if (!(await verifyStripeSignature(c.env.JOB_STRIPE_WEBHOOK_SECRET, c.req.header('stripe-signature'), body))) {
    return c.json({ error: 'bad_signature' }, 400);
  }
  const message = readMessage(body);
  if (!message) return c.json({ error: 'invalid_event' }, 400);
  if (message.livemode && c.env.JOB_PAYMENTS_ALLOW_LIVE !== 'on') return c.json({ error: 'live_not_allowed' }, 400);

  // Stripe sends a message again until it is told it arrived, and sometimes twice anyway.
  if (!(await rememberJobStripeEvent(c.env, message.id, message.type))) return c.json({ ok: true, handled: 'already' });

  let handled;
  try {
    handled = await handleJobPaymentMessage(c.env, companyId, message);
  } catch (error) {
    // Not handled, so not remembered: Stripe's next try gets another go.
    await forgetJobStripeEvent(c.env, message.id);
    throw error;
  }
  console.log(JSON.stringify({ message: 'job payment event', type: message.type, ...handled }));
  return c.json({ ok: true, handled: handled.outcome });
});
