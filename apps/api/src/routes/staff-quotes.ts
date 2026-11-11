/**
 * Quotes, for a company's staff.
 *
 * A quote starts as a draft, filled in from the job's showers as they now
 * stand, with the prices the company last sent for the same things. Staff
 * change it freely until they send it. Sending is refused unless every shower
 * it prices still stands at the revision it priced and has been checked, so a
 * customer is never offered something staff have not looked over. Once sent,
 * it is frozen: the database refuses any change to it. It can be withdrawn,
 * and the customer accepts it with their own link.
 */

import { Hono } from 'hono';
import type { Session } from '../db/auth';
import { companyDb, type CompanyDb } from '../db/company-db';
import { hashResumeToken, newQuoteToken } from '../db/platform';
import type { JobStage, QuoteRow } from '../db/tables';
import { optionLabelsFor } from '../lib/designer-config';
import { sendEmail } from '../lib/email';
import { RequestError } from '../lib/enquiry';
import { fromLine, mailIsSetUp } from '../lib/notify';
import { dayOf, money, quoteEmail } from '../lib/quote-email';
import { draftLines, lineTotal, readLines, totals } from '../lib/quote-lines';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const staffQuotes = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };
const MAX_NOTE = 2000;
const NO_QUOTE = { error: 'not_found', message: 'There is no such quote on this job.' } as const;

/** A job's showers, in order, each with the revision it stands at. */
async function showersOf(db: CompanyDb, jobId: string) {
  const designs = await db.find('designs', { where: { job_id: jobId }, orderBy: { column: 'position' } });
  const revisions = await Promise.all(
    designs.map((d) => db.find('design_revisions', { where: { design_id: d.id, number: d.current_revision }, limit: 1 }))
  );
  return designs.flatMap((design, i) => (revisions[i][0] ? [{ design, revision: revisions[i][0] }] : []));
}

const showerName = (label: string, i: number, count: number) =>
  label && label !== 'Shower' ? label : count > 1 ? `Shower ${i + 1}` : 'the shower';

/** A quote as the workspace shows it: never the hash of its link. */
function present(quote: QuoteRow) {
  const { link_token_hash: _, ...rest } = quote;
  return { ...rest, lines: quote.lines.map((line) => ({ ...line, totalPence: lineTotal(line) })) };
}

/**
 * Why a quote cannot be sent as things stand, or null if it can: a shower
 * has moved on since it was written, or one has not been checked.
 */
async function blockerFor(db: CompanyDb, quote: QuoteRow): Promise<{ error: string; message: string } | null> {
  const showers = await showersOf(db, quote.job_id);
  const priced = new Map(quote.priced.map((p) => [p.designId, p]));
  const moved = showers.length !== priced.size || showers.some(({ design }) => priced.get(design.id)?.number !== design.current_revision);
  if (moved) {
    return {
      error: 'stale',
      message: 'A shower has changed since this quote was written. Write a new quote, so it prices the showers as they now stand.',
    };
  }
  const unchecked = showers.findIndex(({ revision }) => !revision.checked_at);
  if (unchecked >= 0) {
    const { design } = showers[unchecked];
    return {
      error: 'not_checked',
      message: `Check ${showerName(design.label, unchecked, showers.length)} on the job page before sending a quote for it.`,
    };
  }
  return null;
}

async function quoteOn(db: CompanyDb, jobId: string, quoteId: string) {
  const quote = await db.get('quotes', quoteId);
  return quote && quote.job_id === jobId ? quote : null;
}

/** Write a new quote for a job, filled in from its showers as they now stand. */
staffQuotes.post('/jobs/:id/quotes', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json({ error: 'not_found', message: 'There is no such job.' }, 404, PRIVATE);
  const showers = await showersOf(db, job.id);
  if (showers.length === 0) {
    return c.json({ error: 'nothing_to_quote', message: 'This job has no shower to quote for yet.' }, 409, PRIVATE);
  }
  const [labels, prices, company, number] = await Promise.all([
    optionLabelsFor(db, job),
    db.prices.all(),
    db.company(),
    db.quotes.nextNumber(job.id),
  ]);
  const lines = draftLines(
    showers.map(({ design, revision }, i) => ({
      prefix: showers.length > 1 ? `${showerName(design.label, i, showers.length)}: ` : '',
      design: revision.document.design,
      spec: revision.computed,
    })),
    labels,
    prices
  );
  const settings = (company?.settings ?? {}) as { vatRateBp?: unknown };
  const vatRateBp = typeof settings.vatRateBp === 'number' ? settings.vatRateBp : 2000;
  const sum = totals(lines, vatRateBp);
  try {
    const quote = await db.insert('quotes', {
      job_id: job.id,
      number,
      lines,
      priced: showers.map(({ design, revision }) => ({ designId: design.id, revisionId: revision.id, number: revision.number })),
      currency: typeof company?.currency === 'string' ? company.currency : 'GBP',
      vat_rate_bp: vatRateBp,
      subtotal_pence: sum.subtotal,
      vat_pence: sum.vat,
      total_pence: sum.total,
      created_by: session.userId,
    });
    return c.json({ ok: true, id: quote.id, number: quote.number }, 201, PRIVATE);
  } catch (error) {
    if (/UNIQUE/i.test(error instanceof Error ? error.message : String(error))) {
      return c.json({ error: 'busy', message: 'Someone wrote a quote for this job at the same moment. Please try again.' }, 409, PRIVATE);
    }
    throw error;
  }
});

/** One quote, with what it would take to send it. */
staffQuotes.get('/jobs/:id/quotes/:quoteId', async (c) => {
  const db = companyDb(c.env, c.get('session').companyId);
  const quote = await quoteOn(db, c.req.param('id'), c.req.param('quoteId'));
  if (!quote) return c.json(NO_QUOTE, 404, PRIVATE);
  const job = await db.get('jobs', quote.job_id);
  const customer = job ? await db.get('customers', job.customer_id) : null;
  return c.json(
    {
      quote: present(quote),
      job: job && { id: job.id, reference: job.reference, stage: job.stage },
      customer: customer && { name: customer.name, email: customer.email },
      // Only a draft can be sent, and only when nothing stands in its way.
      blocker: quote.status === 'draft' ? await blockerFor(db, quote) : null,
    },
    200,
    PRIVATE
  );
});

/** Change a draft: its lines, its note to the customer, its VAT and how long it stands. */
staffQuotes.patch('/jobs/:id/quotes/:quoteId', async (c) => {
  const db = companyDb(c.env, c.get('session').companyId);
  const quote = await quoteOn(db, c.req.param('id'), c.req.param('quoteId'));
  if (!quote) return c.json(NO_QUOTE, 404, PRIVATE);
  if (quote.status !== 'draft') {
    return c.json({ error: 'not_a_draft', message: 'A sent quote cannot be changed. Write a new one.' }, 409, PRIVATE);
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return c.json({ error: 'invalid_request', message: 'The request must be a JSON object.' }, 400, PRIVATE);

  let lines = quote.lines;
  try {
    if (body.lines !== undefined) lines = readLines(body.lines);
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status, PRIVATE);
    throw error;
  }
  let note = quote.note;
  if (body.note !== undefined) {
    if (body.note !== null && typeof body.note !== 'string') return c.json({ error: 'invalid_note', message: 'A note is words.' }, 400, PRIVATE);
    note = typeof body.note === 'string' ? body.note.trim() || null : null;
    if (note && note.length > MAX_NOTE) {
      return c.json({ error: 'invalid_note', message: `Keep the note to ${MAX_NOTE} characters.` }, 400, PRIVATE);
    }
  }
  let vatRateBp = quote.vat_rate_bp;
  if (body.vatRateBp !== undefined) {
    if (typeof body.vatRateBp !== 'number' || !Number.isInteger(body.vatRateBp) || body.vatRateBp < 0 || body.vatRateBp > 10_000) {
      return c.json({ error: 'invalid_vat', message: 'VAT must be between 0% and 100%.' }, 400, PRIVATE);
    }
    vatRateBp = body.vatRateBp;
  }
  let validDays = quote.valid_days;
  if (body.validDays !== undefined) {
    if (typeof body.validDays !== 'number' || !Number.isInteger(body.validDays) || body.validDays < 1 || body.validDays > 365) {
      return c.json({ error: 'invalid_validity', message: 'A quote stands for between 1 and 365 days.' }, 400, PRIVATE);
    }
    validDays = body.validDays;
  }
  const sum = totals(lines, vatRateBp);
  // Only a draft is changed: if it was sent meanwhile, this changes nothing.
  const changed = await db.quotes.move(quote.id, 'draft', {
    lines,
    note,
    vat_rate_bp: vatRateBp,
    valid_days: validDays,
    subtotal_pence: sum.subtotal,
    vat_pence: sum.vat,
    total_pence: sum.total,
  });
  if (!changed) return c.json({ error: 'not_a_draft', message: 'This quote was sent meanwhile, so it cannot be changed.' }, 409, PRIVATE);
  return c.json({ ok: true, quote: present(changed) }, 200, PRIVATE);
});

/** Throw a draft away. A sent quote stays on record; withdraw it instead. */
staffQuotes.delete('/jobs/:id/quotes/:quoteId', async (c) => {
  const db = companyDb(c.env, c.get('session').companyId);
  const quote = await quoteOn(db, c.req.param('id'), c.req.param('quoteId'));
  if (!quote) return c.json(NO_QUOTE, 404, PRIVATE);
  if (quote.status !== 'draft') {
    return c.json({ error: 'not_a_draft', message: 'A sent quote stays on record. Withdraw it instead.' }, 409, PRIVATE);
  }
  await db.remove('quotes', quote.id);
  return c.json({ ok: true }, 200, PRIVATE);
});

/**
 * Send a draft to the customer. It is frozen from here on. The customer is
 * emailed a link to read and accept it; the link is shown to staff once, too,
 * to pass on another way if they like. The prices on it become the ones the
 * next quote starts from.
 */
staffQuotes.post('/jobs/:id/quotes/:quoteId/send', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const quote = await quoteOn(db, c.req.param('id'), c.req.param('quoteId'));
  if (!quote) return c.json(NO_QUOTE, 404, PRIVATE);
  if (quote.status !== 'draft') return c.json({ error: 'not_a_draft', message: 'This quote has already been sent.' }, 409, PRIVATE);
  if (quote.lines.length === 0 || quote.total_pence <= 0) {
    return c.json({ error: 'nothing_priced', message: 'Put a price on the quote before sending it.' }, 409, PRIVATE);
  }
  const job = await db.get('jobs', quote.job_id);
  const customer = job ? await db.get('customers', job.customer_id) : null;
  if (!job || !customer?.email) {
    return c.json({ error: 'no_email', message: 'The customer has no email address to send the quote to.' }, 409, PRIVATE);
  }
  const blocker = await blockerFor(db, quote);
  if (blocker) return c.json(blocker, 409, PRIVATE);

  const token = newQuoteToken();
  const now = new Date();
  const validUntil = new Date(now.getTime() + quote.valid_days * 86_400_000).toISOString();
  const sent = await db.quotes.move(quote.id, 'draft', {
    status: 'sent',
    link_token_hash: await hashResumeToken(token),
    sent_by: session.userId,
    sent_at: now.toISOString(),
    valid_until: validUntil,
  });
  if (!sent) return c.json({ error: 'not_a_draft', message: 'This quote has already been sent.' }, 409, PRIVATE);

  const stageTo: JobStage | null = job.stage === 'new' || job.stage === 'reviewing' ? 'quoted' : null;
  await db.batch((batch) => {
    if (stageTo) batch.update('jobs', job.id, { stage: stageTo });
    batch.insert('job_events', {
      job_id: job.id,
      type: 'quote_sent',
      actor_kind: 'staff',
      actor_id: session.userId,
      data: { quoteId: quote.id, number: quote.number, totalPence: quote.total_pence, currency: quote.currency, validUntil, from: job.stage, to: stageTo },
    });
  });
  await Promise.all([
    db.usage.add('quotes_sent'),
    db.prices.remember(
      quote.lines.flatMap((l) => (l.key && l.unitPricePence > 0 ? [{ key: l.key, unit: l.unit, unitPricePence: l.unitPricePence }] : []))
    ),
  ]);

  // The customer's link opens on the designer's address, the public one, so
  // nothing about staff sign-in is ever near it.
  const base = c.env.DESIGNER_HOST ? `https://${c.env.DESIGNER_HOST}` : new URL(c.req.url).origin;
  const link = `${base}/q/${token}`;
  const mail = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
  let emailed = false;
  if (mailIsSetUp(mail)) {
    const [company, designer] = await Promise.all([
      db.company(),
      job.designer_id ? db.get('designers', job.designer_id) : Promise.resolve(null),
    ]);
    const message = quoteEmail(fromLine(company?.name ?? 'SetOut', mail.from), customer.email, {
      company: company?.name ?? 'SetOut',
      reference: job.reference,
      number: quote.number,
      customerName: customer.name,
      total: money(quote.total_pence, quote.currency),
      validUntil: dayOf(validUntil),
      note: quote.note,
      link,
      replyTo: designer?.notify_emails[0] ?? null,
    });
    const record = (type: string, data: Record<string, unknown>) =>
      db.insert('job_events', { job_id: job.id, type, actor_kind: 'system', data: { to: 'customer', what: 'quote', number: quote.number, ...data } });
    c.executionCtx.waitUntil(
      sendEmail(mail.apiKey, message)
        .then(() => record('email_sent', {}))
        .catch((error: unknown) => record('email_failed', { reason: error instanceof Error ? error.message : String(error) }))
        .catch(() => undefined)
    );
    emailed = true;
  } else {
    await db.insert('job_events', {
      job_id: job.id,
      type: 'email_not_sent',
      actor_kind: 'system',
      data: { to: 'customer', what: 'quote', number: quote.number, reason: 'Mail is not set up here.' },
    });
  }
  return c.json({ ok: true, quote: present(sent), link, emailed }, 200, PRIVATE);
});

/** Take back a sent quote. Its link then says it was withdrawn. */
staffQuotes.post('/jobs/:id/quotes/:quoteId/withdraw', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const quote = await quoteOn(db, c.req.param('id'), c.req.param('quoteId'));
  if (!quote) return c.json(NO_QUOTE, 404, PRIVATE);
  const withdrawn = await db.quotes.move(quote.id, 'sent', { status: 'withdrawn' });
  if (!withdrawn) {
    return c.json({ error: 'not_sent', message: 'Only a quote that has been sent, and not accepted, can be withdrawn.' }, 409, PRIVATE);
  }
  await db.insert('job_events', {
    job_id: quote.job_id,
    type: 'quote_withdrawn',
    actor_kind: 'staff',
    actor_id: session.userId,
    data: { quoteId: quote.id, number: quote.number },
  });
  return c.json({ ok: true, quote: present(withdrawn) }, 200, PRIVATE);
});
