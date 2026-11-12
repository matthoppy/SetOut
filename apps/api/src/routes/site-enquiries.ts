/**
 * The routes behind SetOut's own site.
 *
 * Public, like the designer's, and called only by the get-started form. There
 * is no company and no sign-in here: a shower company is asking to become
 * one. So everything is checked, how much can arrive is capped, and nothing
 * is told to anyone but SetOut.
 */

import { Hono } from 'hono';
import { saveSiteEnquiry } from '../db/site-enquiries';
import { checkBot, RequestError, type BotCheck } from '../lib/enquiry';
import type { MailSettings } from '../lib/notify';
import {
  MAX_SITE_BODY_BYTES,
  notifySiteEnquiry,
  readSiteEnquiry,
  siteMailIsSetUp,
  SUSPICIOUS_SITE_ELAPSED_MS,
} from '../lib/site-enquiry';

export const siteRoutes = new Hono<{ Bindings: Env }>();

/** What the form needs to know: the bot check's public key, when there is one. */
siteRoutes.get('/config', (c) =>
  c.json({ turnstileSiteKey: c.env.SITE_TURNSTILE_SITE_KEY || null }, 200, { 'Cache-Control': 'public, max-age=300' })
);

/**
 * A shower company asks to start.
 *
 * The enquiry is saved first and the person answered. Only then is SetOut
 * emailed, and what happened to that email is written on the enquiry.
 */
siteRoutes.post('/enquiries', async (c) => {
  // Only the site's own pages send this. Another website cannot make a
  // visitor's browser send it for them.
  if (c.req.header('origin') !== new URL(c.req.url).origin) {
    return c.json({ error: 'wrong_origin', message: 'That request did not come from this site.' }, 403);
  }

  const tooLarge = () =>
    c.json({ error: 'too_large', message: 'That is too much to send. Please shorten your message.' }, 413);
  if (Number(c.req.header('content-length') ?? 0) > MAX_SITE_BODY_BYTES) return tooLarge();
  const raw = await c.req.text();
  if (raw.length > MAX_SITE_BODY_BYTES) return tooLarge();

  let enquiry;
  try {
    let body: unknown = null;
    try {
      body = JSON.parse(raw);
    } catch {
      // Not JSON at all. readSiteEnquiry says so.
    }
    enquiry = readSiteEnquiry(body);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status);
    throw error;
  }

  // A hidden field no person can see or fill. Answer as if it worked, so a
  // script learns nothing, and keep none of it.
  if (enquiry.honeypot.length > 0) {
    console.warn(JSON.stringify({ message: 'site enquiry dropped', reason: 'honeypot' }));
    return c.json({ ok: true }, 201);
  }

  const botCheck: BotCheck = await checkBot(
    c.env.TURNSTILE_SECRET_KEY,
    enquiry.turnstileToken,
    c.req.header('cf-connecting-ip') ?? null
  );
  if (botCheck === 'failed') {
    return c.json(
      { error: 'bot_check_failed', message: 'The security check did not pass. Please reload the page and try again.' },
      403
    );
  }

  const mail: MailSettings = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
  const to = c.env.SITE_NOTIFY_EMAIL;
  const sentQuickly = enquiry.elapsedMs !== null && enquiry.elapsedMs < SUSPICIOUS_SITE_ELAPSED_MS;
  const willEmail = siteMailIsSetUp(mail, to);

  const kept = await saveSiteEnquiry(c.env, {
    ...enquiry,
    botCheck,
    sentQuickly,
    emailStatus: willEmail ? 'sending' : 'not_set_up',
  });
  if (!kept.saved) {
    console.warn(JSON.stringify({ message: 'site enquiry refused', reason: kept.reason }));
    return c.json(
      {
        error: 'too_many',
        message:
          kept.reason === 'address_limit'
            ? 'We already have your details and will be in touch. There is no need to send them again.'
            : 'We cannot take any more enquiries today. Please try again tomorrow.',
      },
      429
    );
  }

  if (willEmail) {
    const email = notifySiteEnquiry({
      env: c.env,
      id: kept.id,
      mail,
      to,
      enquiry,
      botCheck,
      sentQuickly,
      environment: c.env.ENVIRONMENT,
    }).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          message: 'site enquiry notification failed',
          enquiry: kept.id,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    });
    try {
      c.executionCtx.waitUntil(email);
    } catch {
      // No way to carry on after the response here, so finish before it.
      await email;
    }
  }

  console.log(
    JSON.stringify({ message: 'site enquiry received', enquiry: kept.id, botCheck, sentQuickly, emailed: willEmail })
  );
  return c.json({ ok: true }, 201);
});
