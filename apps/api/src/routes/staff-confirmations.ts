/**
 * Order confirmation links, for a company's staff.
 *
 * Staff make a link for a job and send it to the customer themselves. Making
 * a new one for the same job replaces the old, which stops working. Once the
 * customer has confirmed, the job keeps that confirmation and no new link is
 * made.
 *
 * TODO: a button in the workspace's job page. Until then this is called
 * directly, by a signed-in member of staff.
 */

import { Hono } from 'hono';
import type { Session } from '../db/auth';
import { companyDb } from '../db/company-db';
import { hashResumeToken, newConfirmationToken } from '../db/platform';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const staffConfirmations = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };

staffConfirmations.post('/jobs/:id/confirmation-link', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const job = await db.get('jobs', c.req.param('id'));
  if (!job) return c.json({ error: 'not_found', message: 'There is no such job.' }, 404, PRIVATE);
  const [design] = await db.find('designs', { where: { job_id: job.id }, limit: 1 });
  if (!design || design.current_revision < 1) {
    return c.json({ error: 'no_shower', message: 'This job has no shower to confirm yet.' }, 409, PRIVATE);
  }
  const existing = await db.find('order_confirmations', { where: { job_id: job.id } });
  if (existing.some((o) => o.confirmed_at)) {
    return c.json({ error: 'already_confirmed', message: 'The customer has already confirmed this order.' }, 409, PRIVATE);
  }

  const token = newConfirmationToken();
  const hash = await hashResumeToken(token);
  await db.batch((batch) => {
    // One live link per job: a new one replaces the last.
    for (const old of existing) batch.remove('order_confirmations', old.id);
    batch.insert('order_confirmations', { job_id: job.id, link_token_hash: hash, created_by: session.userId });
    batch.insert('job_events', { job_id: job.id, type: 'confirmation_link_made', actor_kind: 'staff', actor_id: session.userId, data: {} });
  });
  // The customer's page is public, so it is on the designer's address.
  const base = c.env.DESIGNER_HOST ? `https://${c.env.DESIGNER_HOST}` : new URL(c.req.url).origin;
  return c.json({ link: `${base}/confirm/${token}` }, 201, PRIVATE);
});
