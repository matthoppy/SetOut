/**
 * Signing up: a shower company makes its own account.
 *
 * Someone types the company's name, their own and their email address. They
 * are emailed a link, and nothing is made until they use it: no company, no
 * user. Using it opens the company, with its first designer and its owner,
 * and signs that browser in.
 *
 * These answer on the workspace's address, before any sign-in, and only when
 * sign-ups are open. The answer to asking is the same whoever the address
 * belongs to, so it never says who has an account.
 */

import { Hono } from 'hono';
import { redeemSignUp, requestSignUp, SIGNUP_LINK_HOURS } from '../db/onboarding';
import { billingIsOn, trialEnd } from '../lib/billing';
import { sendEmail } from '../lib/email';
import { checkBot, RequestError } from '../lib/enquiry';
import { fromLine, mailIsSetUp } from '../lib/notify';
import { setSessionCookie } from '../lib/session-cookie';
import { botCheckIsSetUp, readSignUp, signUpEmail, signUpsAreOpen } from '../lib/sign-up';

export const signUp = new Hono<{ Bindings: Env }>();

const PRIVATE = { 'Cache-Control': 'no-store' };
const MAX_BODY_BYTES = 16 * 1024;
const CLOSED = { error: 'sign_ups_closed', message: 'New accounts cannot be opened here yet.' } as const;

/** What the sign-up page needs before it shows its form: whether it may, and the bot check's public key. */
signUp.get('/sign-up', (c) => {
  const open = signUpsAreOpen(c.env);
  return c.json(
    {
      open,
      linkHours: SIGNUP_LINK_HOURS,
      ...(open && botCheckIsSetUp(c.env) ? { turnstileSiteKey: c.env.TURNSTILE_SITE_KEY } : {}),
    },
    200,
    PRIVATE
  );
});

/** Ask to open a company. The person is emailed a link, and nothing is made until they use it. */
signUp.post('/sign-up', async (c) => {
  if (!signUpsAreOpen(c.env)) return c.json(CLOSED, 403, PRIVATE);
  if (Number(c.req.header('content-length') ?? 0) > MAX_BODY_BYTES) {
    return c.json({ error: 'too_large', message: 'That is too much to send.' }, 413, PRIVATE);
  }
  let form;
  try {
    form = readSignUp(await c.req.json().catch(() => null));
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }

  // A hidden field no person can see or fill. Answer as if it worked, so a
  // script learns nothing, and keep none of it.
  if (form.honeypot.length > 0) {
    console.warn(JSON.stringify({ message: 'sign-up dropped', reason: 'honeypot' }));
    return c.json({ ok: true }, 202, PRIVATE);
  }

  // Stricter than the designer: where the check is set up, a sign-up without
  // a passed check is refused. Nobody loses their measuring by trying again.
  const ip = c.req.header('cf-connecting-ip') ?? null;
  if (botCheckIsSetUp(c.env)) {
    const botCheck = await checkBot(c.env.TURNSTILE_SECRET_KEY, form.turnstileToken, ip);
    if (botCheck !== 'passed') {
      return c.json({ error: 'bot_check_failed', message: 'The security check did not pass. Please reload the page and try again.' }, 403, PRIVATE);
    }
  }

  const asked = await requestSignUp(c.env, { email: form.email, personName: form.personName, companyName: form.companyName, ip });
  if (!asked.ok) {
    // An address that has been sent enough links gets the same answer as one
    // that is sent another, as sign-in does.
    if (asked.reason === 'too_many_for_address') return c.json({ ok: true }, 202, PRIVATE);
    return c.json({ error: 'too_many', message: 'Too many accounts have been asked for from here. Please try again later.' }, 429, PRIVATE);
  }

  const base = c.env.APP_HOST ? `https://${c.env.APP_HOST}` : new URL(c.req.url).origin;
  const link = `${base}/sign-up?token=${asked.token}`;
  const mail = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
  if (mailIsSetUp(mail)) {
    const message = signUpEmail(fromLine('SetOut', mail.from), form.email, { companyName: form.companyName, personName: form.personName, link });
    c.executionCtx.waitUntil(
      sendEmail(mail.apiKey, message).catch((error: unknown) => {
        console.error(JSON.stringify({ message: 'sign-up email failed', reason: error instanceof Error ? error.message : String(error) }));
      })
    );
  } else if (c.env.ENVIRONMENT === 'local') {
    // On a developer's own machine there is no mail, so the link comes back
    // in the answer. Nowhere else does it.
    return c.json({ ok: true, link }, 202, PRIVATE);
  }
  return c.json({ ok: true }, 202, PRIVATE);
});

/** Use a sign-up link: the company is opened and the browser that used it is signed in as its owner. */
signUp.post('/sign-up/verify', async (c) => {
  if (!signUpsAreOpen(c.env)) return c.json(CLOSED, 403, PRIVATE);
  const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
  const signedUp = await redeemSignUp(c.env, body?.token, {
    // A live key is for a company's real website. Anywhere but production a
    // new company gets a test key, which may also be tried from localhost.
    keyKind: c.env.ENVIRONMENT === 'production' ? 'live' : 'test',
    trialEndsAt: billingIsOn(c.env) ? trialEnd(c.env) : null,
    ...(c.env.TURNSTILE_SITE_KEY ? { turnstileSiteKey: c.env.TURNSTILE_SITE_KEY } : {}),
  });
  if (!signedUp) {
    return c.json(
      { error: 'link_not_valid', message: 'That link has been used or has run out. If you have already set up, sign in. Otherwise start again.' },
      400,
      PRIVATE
    );
  }
  console.log(JSON.stringify({ message: 'company opened', via: 'sign_up', company: signedUp.companyId }));
  setSessionCookie(c, signedUp.token);
  return c.json({ ok: true, company: { id: signedUp.companyId, name: signedUp.companyName } }, 200, PRIVATE);
});
