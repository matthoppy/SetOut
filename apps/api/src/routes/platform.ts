/**
 * The platform admin's routes: SetOut's own staff, looking after every
 * company.
 *
 * Who they are is a setting on the server, PLATFORM_ADMINS, read on every
 * request. It is not in the database and no route can change it, so a
 * company cannot make one of its own people an admin. An admin signs in the
 * way everyone does, by emailed link, and these answer on the workspace's
 * address only, to that session.
 *
 * To anyone else these answer "not found", owner or not, so the routes do
 * not even say that they exist.
 *
 * Nothing here reads a company's customers, jobs or designs. Whatever an
 * admin does to a company is written to that company's audit log.
 */

import { Hono, type Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { listCompanies, listPlans, savePlan, setCompanyPlan, setCompanyStatus, startTrial, type Plan } from '../db/admin';
import { normaliseEmail, resolveSession, type Session } from '../db/auth';
import { DataError } from '../db/company-db';
import { openCompany } from '../db/onboarding';
import { billingIsOn, trialDays, trialEnd } from '../lib/billing';
import { sendEmail } from '../lib/email';
import { RequestError } from '../lib/enquiry';
import { fromLine, mailIsSetUp } from '../lib/notify';
import { SESSION_COOKIE } from '../lib/session-cookie';
import { readCompanyName } from '../lib/settings';
import { isPlatformAdmin, signUpsAreOpen } from '../lib/sign-up';
import { addedToTeamEmail } from '../lib/team-email';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const platform = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };
const NOT_FOUND = { error: 'not_found' } as const;
const NO_COMPANY = { error: 'not_found', message: 'There is no such company.' } as const;

// Signed in, and one of SetOut's own. Both are checked on every request,
// first, so that to anyone else these routes say nothing at all.
platform.use('*', async (c, next) => {
  const session = await resolveSession(c.env, getCookie(c, SESSION_COOKIE));
  if (!session || !isPlatformAdmin(c.env, session.email)) return c.json(NOT_FOUND, 404, PRIVATE);
  c.set('session', session);
  await next();
});

// A change must come from the workspace's own pages, as in the workspace.
platform.use('*', async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.header('origin') !== new URL(c.req.url).origin) {
    return c.json({ error: 'wrong_origin', message: 'That request did not come from the workspace.' }, 403);
  }
  await next();
});

async function bodyOf(c: Context<Bindings>): Promise<Record<string, unknown>> {
  const body: unknown = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'invalid_request', 'The request must be a JSON object.');
  }
  return body as Record<string, unknown>;
}

/** Run a route, turning what was wrong with the request into its answer. */
async function answering(c: Context<Bindings>, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    if (error instanceof DataError) return c.json({ error: 'invalid_request', message: error.message }, 400, PRIVATE);
    throw error;
  }
}

/** Every company, the plans, and how this deploy is switched. */
platform.get('/companies', async (c) => {
  const [companies, plans] = await Promise.all([listCompanies(c.env), listPlans(c.env)]);
  return c.json(
    {
      companies,
      plans,
      switches: {
        environment: c.env.ENVIRONMENT,
        signUps: signUpsAreOpen(c.env),
        billing: billingIsOn(c.env),
        trialDays: trialDays(c.env),
        // Whether each secret is set, never what it is.
        stripeKey: Boolean(c.env.STRIPE_SECRET_KEY),
        stripeWebhookSecret: Boolean(c.env.STRIPE_WEBHOOK_SECRET),
        botCheck: Boolean(c.env.TURNSTILE_SECRET_KEY) && Boolean(c.env.TURNSTILE_SITE_KEY),
        mail: Boolean(c.env.RESEND_API_KEY) && Boolean(c.env.EMAIL_FROM),
      },
    },
    200,
    PRIVATE
  );
});

/**
 * Add a company with its first owner, as SetOut. The same function opens it
 * as when someone signs up. The owner is emailed to say so, with the way to
 * the sign-in page, where they ask for a link.
 */
platform.post('/companies', (c) =>
  answering(c, async () => {
    const body = await bodyOf(c);
    const name = readCompanyName(body.name);
    const email = normaliseEmail(body.ownerEmail);
    if (!email) throw new RequestError(400, 'invalid_email', 'The owner’s address does not look like an email address.');
    const ownerName = typeof body.ownerName === 'string' ? body.ownerName.replace(/\s+/g, ' ').trim().slice(0, 100) || null : null;
    const plan = typeof body.plan === 'string' && body.plan ? body.plan : 'free';
    if (plan !== 'trial' && !(await listPlans(c.env)).some((p) => p.id === plan)) {
      throw new RequestError(400, 'no_such_plan', 'There is no such plan.');
    }
    const prefix = typeof body.referencePrefix === 'string' && body.referencePrefix.trim() ? body.referencePrefix.trim().toUpperCase() : undefined;
    const opened = await openCompany(c.env, {
      name,
      owner: { email, name: ownerName },
      via: 'setout',
      actorId: c.get('session').userId,
      plan,
      keyKind: c.env.ENVIRONMENT === 'production' ? 'live' : 'test',
      ...(prefix ? { referencePrefix: prefix } : {}),
      settings: { setUp: { done: false } },
      designer: { settings: c.env.TURNSTILE_SITE_KEY ? { turnstileSiteKey: c.env.TURNSTILE_SITE_KEY } : {} },
      trialEndsAt: plan === 'trial' && billingIsOn(c.env) ? trialEnd(c.env) : null,
    });
    console.log(JSON.stringify({ message: 'company opened', via: 'setout', company: opened.companyId }));

    const session = c.get('session');
    const mail = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
    let emailed = false;
    if (mailIsSetUp(mail)) {
      const base = c.env.APP_HOST ? `https://${c.env.APP_HOST}` : new URL(c.req.url).origin;
      const message = addedToTeamEmail(fromLine('SetOut', mail.from), email, {
        company: name,
        by: session.name ? `${session.name} at SetOut` : 'SetOut',
        byEmail: session.email,
        role: 'owner',
        link: `${base}/sign-in?email=${encodeURIComponent(email)}`,
      });
      c.executionCtx.waitUntil(
        sendEmail(mail.apiKey, message).catch((error: unknown) => {
          console.error(JSON.stringify({ message: 'new company email failed', reason: error instanceof Error ? error.message : String(error) }));
        })
      );
      emailed = true;
    }
    return c.json(
      { ok: true, emailed, company: { id: opened.companyId, referencePrefix: opened.referencePrefix, siteKey: opened.siteKey } },
      201,
      PRIVATE
    );
  })
);

/** Switch a company off or on, or put it on another plan. */
platform.patch('/companies/:id', (c) =>
  answering(c, async () => {
    const body = await bodyOf(c);
    const actor = c.get('session').userId;
    const id = c.req.param('id');
    if (body.status === undefined && body.plan === undefined) {
      throw new RequestError(400, 'invalid_request', 'Send the status or the plan to change.');
    }
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'suspended') {
        throw new RequestError(400, 'invalid_status', 'A company is active or suspended.');
      }
      const reason = typeof body.reason === 'string' ? body.reason.replace(/\s+/g, ' ').trim().slice(0, 300) || null : null;
      if ((await setCompanyStatus(c.env, id, actor, body.status, reason)) === 'not_found') return c.json(NO_COMPANY, 404, PRIVATE);
    }
    if (body.plan !== undefined) {
      if (typeof body.plan !== 'string') throw new RequestError(400, 'no_such_plan', 'There is no such plan.');
      const result = await setCompanyPlan(c.env, id, actor, body.plan);
      if (result === 'not_found') return c.json(NO_COMPANY, 404, PRIVATE);
      if (result === 'no_such_plan') throw new RequestError(400, 'no_such_plan', 'There is no such plan.');
    }
    return c.json({ ok: true }, 200, PRIVATE);
  })
);

/** Start a company's trial from today, for one that signed up while billing was off. */
platform.post('/companies/:id/trial', (c) =>
  answering(c, async () => {
    const body = await bodyOf(c);
    const days = body.days === undefined ? trialDays(c.env) : body.days;
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) {
      throw new RequestError(400, 'invalid_days', 'A trial lasts between 1 and 365 days.');
    }
    const endsAt = new Date(Date.now() + days * 86_400_000).toISOString();
    const result = await startTrial(c.env, c.req.param('id'), c.get('session').userId, endsAt);
    if (result === 'not_found') return c.json(NO_COMPANY, 404, PRIVATE);
    if (result === 'already_paying') {
      return c.json({ error: 'already_paying', message: 'This company already pays through Stripe, so it has no trial to start.' }, 409, PRIVATE);
    }
    return c.json({ ok: true, trialEndsAt: endsAt }, 200, PRIVATE);
  })
);

const PLAN_ID = /^[a-z][a-z0-9-]{1,30}$/;
const STRIPE_PRICE = /^price_[A-Za-z0-9]{1,250}$/;
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Add a plan, or change one: its name, what it costs, what it includes, and the Stripe price it is charged as. */
platform.put('/plans/:id', (c) =>
  answering(c, async () => {
    const body = await bodyOf(c);
    const id = c.req.param('id');
    if (!PLAN_ID.test(id) || id === 'trial') {
      throw new RequestError(400, 'invalid_plan', 'A plan’s id is lower-case letters, digits and hyphens, such as standard. "trial" is taken.');
    }
    const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > 60) throw new RequestError(400, 'invalid_plan', 'A plan needs a name of up to 60 characters.');
    if (!isWhole(body.monthlyPricePence, 0, 10_000_000)) throw new RequestError(400, 'invalid_plan', 'The monthly price is in whole pence.');
    if (body.enquiriesPerMonth !== null && !isWhole(body.enquiriesPerMonth, 0, 1_000_000)) {
      throw new RequestError(400, 'invalid_plan', 'The designs a month must be a whole number, or empty for no limit.');
    }
    const stripePriceId = typeof body.stripePriceId === 'string' && body.stripePriceId.trim() ? body.stripePriceId.trim() : null;
    if (stripePriceId && !STRIPE_PRICE.test(stripePriceId)) {
      throw new RequestError(400, 'invalid_plan', 'A Stripe price id starts price_. It is on the price’s page in Stripe.');
    }
    const offered = body.offered === true;
    if (offered && !stripePriceId) throw new RequestError(400, 'invalid_plan', 'A plan can only be offered once it has a Stripe price.');
    const plan: Plan = {
      id,
      name,
      monthlyPricePence: body.monthlyPricePence,
      enquiriesPerMonth: body.enquiriesPerMonth as number | null,
      stripePriceId,
      offered,
      position: isWhole(body.position, 0, 1000) ? body.position : 0,
    };
    await savePlan(c.env, plan);
    return c.json({ ok: true, plan }, 200, PRIVATE);
  })
);
