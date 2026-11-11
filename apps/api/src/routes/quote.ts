/**
 * A quote, for the customer it was sent to.
 *
 * These are public: whoever holds a quote's link can read that one quote and
 * accept it, and nothing else. The link is the only thing that ties a request
 * to a company. They answer on the designer's address, the public one, never
 * where staff sign in, and the link never travels on as a referrer.
 */

import { Hono } from 'hono';
import { companyDb } from '../db/company-db';
import { resolveQuoteLink } from '../db/platform';
import type { JobStage } from '../db/tables';
import { sendEmail } from '../lib/email';
import { fromLine, mailIsSetUp } from '../lib/notify';
import { money, quoteAcceptedEmail } from '../lib/quote-email';
import { lineTotal } from '../lib/quote-lines';

export const quote = new Hono<{ Bindings: Env }>();

const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const NOT_FOUND = { error: 'not_found', message: 'This quote could not be found. Check the link in your email.' } as const;

async function open(env: Env, token: string) {
  const found = await resolveQuoteLink(env, token);
  if (!found) return null;
  const db = companyDb(env, found.companyId);
  const row = await db.get('quotes', found.quoteId);
  const job = row ? await db.get('jobs', row.job_id) : null;
  return row && job ? { db, row, job } : null;
}

const isExpired = (validUntil: string | null, now = new Date()) => !!validUntil && Date.parse(validUntil) < now.getTime();

/** The quote, as the customer reads it. */
quote.get('/:token', async (c) => {
  const found = await open(c.env, c.req.param('token'));
  if (!found) return c.json(NOT_FOUND, 404, HEADERS);
  const { db, row, job } = found;
  const [company, customer] = await Promise.all([db.company(), db.get('customers', job.customer_id)]);
  const branding = (company?.branding ?? {}) as Record<string, unknown>;
  const colour = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback);
  return c.json(
    {
      company: {
        name: company?.name ?? '',
        primary: colour(branding.primary, '#1e293b'),
        primaryForeground: colour(branding.primaryForeground, '#ffffff'),
        ...(typeof branding.logoUrl === 'string' ? { logoUrl: branding.logoUrl } : {}),
      },
      reference: job.reference,
      number: row.number,
      status: row.status,
      expired: row.status === 'sent' && isExpired(row.valid_until),
      customerName: customer?.name ?? null,
      lines: row.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unitPricePence: l.unitPricePence,
        totalPence: lineTotal(l),
      })),
      subtotalPence: row.subtotal_pence,
      vatPence: row.vat_pence,
      vatRateBp: row.vat_rate_bp,
      totalPence: row.total_pence,
      currency: row.currency,
      note: row.note,
      sentAt: row.sent_at,
      validUntil: row.valid_until,
      acceptedAt: row.accepted_at,
      acceptedName: row.accepted_name,
    },
    200,
    HEADERS
  );
});

/**
 * Accept the quote. The customer types their name and says they agree. The
 * job moves to Ordered and the company is emailed. Accepting twice changes
 * nothing; a withdrawn or out-of-date quote cannot be accepted.
 */
quote.post('/:token/accept', async (c) => {
  if (c.req.header('origin') !== new URL(c.req.url).origin) {
    return c.json({ error: 'wrong_origin', message: 'That request did not come from the quote page.' }, 403, HEADERS);
  }
  const found = await open(c.env, c.req.param('token'));
  if (!found) return c.json(NOT_FOUND, 404, HEADERS);
  const { db, row, job } = found;
  const body = (await c.req.json().catch(() => null)) as { name?: unknown; agreed?: unknown } | null;
  const name = typeof body?.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2 || name.length > 100) {
    return c.json({ error: 'name_needed', message: 'Type your name to accept the quote.' }, 400, HEADERS);
  }
  if (body?.agreed !== true) {
    return c.json({ error: 'not_agreed', message: 'Tick the box to say you accept the quote.' }, 400, HEADERS);
  }
  if (row.status === 'accepted') return c.json({ ok: true, acceptedAt: row.accepted_at }, 200, HEADERS);
  if (row.status !== 'sent') {
    return c.json({ error: 'withdrawn', message: 'This quote has been withdrawn, so it can no longer be accepted.' }, 409, HEADERS);
  }
  if (isExpired(row.valid_until)) {
    return c.json({ error: 'expired', message: 'This quote has run out. Please ask for a new one.' }, 409, HEADERS);
  }

  const at = new Date().toISOString();
  const accepted = await db.quotes.move(row.id, 'sent', { status: 'accepted', accepted_at: at, accepted_name: name });
  if (!accepted) {
    return c.json({ error: 'withdrawn', message: 'This quote has been withdrawn, so it can no longer be accepted.' }, 409, HEADERS);
  }
  const stageTo: JobStage | null = ['new', 'reviewing', 'quoted'].includes(job.stage) ? 'ordered' : null;
  await db.batch((batch) => {
    if (stageTo) batch.update('jobs', job.id, { stage: stageTo });
    batch.insert('job_events', {
      job_id: job.id,
      type: 'quote_accepted',
      actor_kind: 'customer',
      data: { quoteId: row.id, number: row.number, name, totalPence: row.total_pence, currency: row.currency, from: job.stage, to: stageTo },
    });
  });

  // Tell the company, on the addresses its designer sends enquiries to.
  const mail = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
  const designer = job.designer_id ? await db.get('designers', job.designer_id) : (await db.find('designers', { limit: 1 }))[0];
  const to = designer?.notify_emails ?? [];
  if (mailIsSetUp(mail) && to.length > 0) {
    const [company, customer] = await Promise.all([db.company(), db.get('customers', job.customer_id)]);
    const appBase = c.env.APP_HOST ? `https://${c.env.APP_HOST}` : new URL(c.req.url).origin;
    const message = quoteAcceptedEmail(fromLine(company?.name ?? 'SetOut', mail.from), to, {
      reference: job.reference,
      number: row.number,
      acceptedName: name,
      customerEmail: customer?.email ?? null,
      total: money(row.total_pence, row.currency),
      jobLink: `${appBase}/jobs/${job.id}`,
    });
    const record = (type: string, data: Record<string, unknown>) =>
      db.insert('job_events', { job_id: job.id, type, actor_kind: 'system', data: { to: 'company', what: 'quote_accepted', number: row.number, ...data } });
    c.executionCtx.waitUntil(
      sendEmail(mail.apiKey, message)
        .then(() => record('email_sent', {}))
        .catch((error: unknown) => record('email_failed', { reason: error instanceof Error ? error.message : String(error) }))
        .catch(() => undefined)
    );
  }
  return c.json({ ok: true, acceptedAt: at }, 200, HEADERS);
});
