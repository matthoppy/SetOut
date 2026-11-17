/**
 * Installation sheets, for the customer they were sent to.
 *
 * Public: whoever holds a sent sheet's link can read that one job's sheets,
 * as they were approved, and nothing else. The link is the only thing that
 * ties a request to a company. It answers on the designer's address, never
 * where staff sign in, and the link never travels on as a referrer.
 *
 * Every shower is given at the revision that was approved, with the spec the
 * server worked out for it, so the page draws what staff looked over even if
 * the job has moved on since.
 */

import { TEMPLATES } from '@setout/engine';
import { Hono } from 'hono';
import { companyDb } from '../db/company-db';
import { resolveInstallationLink } from '../db/platform';
import { optionLabelsFor } from '../lib/designer-config';

export const installation = new Hono<{ Bindings: Env }>();

const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const NOT_FOUND = { error: 'not_found', message: 'This installation sheet could not be found. Check the link in your email.' } as const;

installation.get('/:token', async (c) => {
  const found = await resolveInstallationLink(c.env, c.req.param('token'));
  if (!found) return c.json(NOT_FOUND, 404, HEADERS);
  const db = companyDb(c.env, found.companyId);
  const sheet = await db.get('installation_sheets', found.sheetId);
  const job = sheet ? await db.get('jobs', sheet.job_id) : null;
  if (!sheet || !job) return c.json(NOT_FOUND, 404, HEADERS);

  const [company, customer, labels, designs, revisions, [received]] = await Promise.all([
    db.company(),
    db.get('customers', job.customer_id),
    optionLabelsFor(db, job),
    Promise.all(sheet.covers.map((c) => db.get('designs', c.designId))),
    Promise.all(sheet.covers.map((c) => db.get('design_revisions', c.revisionId))),
    db.find('job_events', { where: { job_id: job.id, type: 'received' }, limit: 1 }),
  ]);
  // A lone shower is named for the layout it started from, as the workspace's sheet names it.
  const template = received?.data.template;
  const layout = TEMPLATES.find((t) => t.id === template)?.name ?? 'Your shower';
  const branding = (company?.branding ?? {}) as Record<string, unknown>;
  const colour = (v: unknown, fallback: string) => (typeof v === 'string' && v ? v : fallback);
  const count = sheet.covers.length;
  const showers = sheet.covers.flatMap((covered, i) => {
    const revision = revisions[i];
    if (!revision) return [];
    const label = designs[i]?.label ?? '';
    return [
      {
        title: label && label !== 'Shower' ? label : count > 1 ? `Shower ${i + 1}` : layout,
        revision: covered.number,
        design: revision.document.design,
        spec: revision.computed,
      },
    ];
  });
  return c.json(
    {
      company: {
        name: company?.name ?? '',
        primary: colour(branding.primary, '#1e293b'),
        primaryForeground: colour(branding.primaryForeground, '#ffffff'),
      },
      reference: job.reference,
      customerName: customer?.name ?? null,
      address: sheet.address,
      postcode: sheet.postcode,
      notes: sheet.notes,
      approvedAt: sheet.approved_at,
      sentAt: sheet.sent_at,
      // The company's standard hinges, which the panes' cut-outs are drawn for.
      hinges: labels.hinges,
      showers,
    },
    200,
    HEADERS
  );
});
