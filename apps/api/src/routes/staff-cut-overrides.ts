/**
 * Cut size overrides, for a company's staff.
 *
 * Set one pane of one shower to be cut with different deductions from the
 * company's rule, with a reason, or clear it to go back to the rule. Who did
 * it is kept on the override and written on the job's timeline. The customer
 * never sees any of it.
 */

import { Hono } from 'hono';
import type { Session } from '../db/auth';
import { companyDb } from '../db/company-db';
import { readDeduction, REASON_LIMITS } from '../lib/cut-overrides';

type Bindings = { Bindings: Env; Variables: { session: Session } };

export const staffCutOverrides = new Hono<Bindings>();

const PRIVATE = { 'Cache-Control': 'no-store' };
const NO_PANE = { error: 'not_found', message: 'There is no such pane on this job.' } as const;

async function paneOf(db: ReturnType<typeof companyDb>, jobId: string, designId: string, paneId: string) {
  const job = await db.get('jobs', jobId);
  const design = job ? await db.get('designs', designId) : null;
  if (!job || !design || design.job_id !== job.id) return null;
  const [revision] = await db.find('design_revisions', { where: { design_id: design.id, number: design.current_revision }, limit: 1 });
  const panel = revision?.computed.panels.find((p) => p.id === paneId);
  if (!revision || !panel) return null;
  const [existing] = await db.find('cut_overrides', { where: { design_id: design.id, pane_id: paneId }, limit: 1 });
  return { job, design, revision, panel, existing: existing ?? null };
}

staffCutOverrides.put('/jobs/:id/designs/:designId/panes/:paneId/cut-override', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const found = await paneOf(db, c.req.param('id'), c.req.param('designId'), c.req.param('paneId'));
  if (!found) return c.json(NO_PANE, 404, PRIVATE);
  const { job, design, revision, panel, existing } = found;
  if (revision.computed.sliding) {
    return c.json({ error: 'sliding', message: "A sliding shower is cut to its maker's formula, so it can't be overridden." }, 409, PRIVATE);
  }
  const body = (await c.req.json().catch(() => null)) as { widthDeductionMm?: unknown; heightDeductionMm?: unknown; reason?: unknown } | null;
  const width = readDeduction(body?.widthDeductionMm);
  const height = readDeduction(body?.heightDeductionMm);
  if (width === null || height === null) {
    return c.json({ error: 'invalid_deduction', message: 'Give each deduction in whole millimetres, from 0 to 200.' }, 400, PRIVATE);
  }
  const reason = typeof body?.reason === 'string' ? body.reason.replace(/\s+/g, ' ').trim() : '';
  if (reason.length < REASON_LIMITS.min) return c.json({ error: 'reason_needed', message: 'Say why this pane is cut differently.' }, 400, PRIVATE);
  if (reason.length > REASON_LIMITS.max) {
    return c.json({ error: 'reason_too_long', message: `Keep the reason to ${REASON_LIMITS.max} characters.` }, 400, PRIVATE);
  }

  const values = {
    width_deduction_mm: width,
    height_deduction_mm: height,
    reason,
    revision_number: revision.number,
    set_by: session.userId,
  };
  await db.batch((batch) => {
    if (existing) batch.update('cut_overrides', existing.id, values);
    else batch.insert('cut_overrides', { job_id: job.id, design_id: design.id, pane_id: panel.id, ...values });
    batch.insert('job_events', {
      job_id: job.id,
      type: 'cut_override_set',
      actor_kind: 'staff',
      actor_id: session.userId,
      data: {
        designId: design.id,
        paneId: panel.id,
        pane: panel.label,
        widthDeductionMm: width,
        heightDeductionMm: height,
        standardWidthDeductionMm: panel.deductions.horizontal.total,
        standardHeightDeductionMm: panel.deductions.vertical.total,
        cut: `${panel.tightWidthMm - width} × ${panel.tightHeightMm - height}`,
        reason,
      },
    });
  });
  return c.json({ ok: true, cutWidthMm: panel.tightWidthMm - width, cutHeightMm: panel.tightHeightMm - height }, 200, PRIVATE);
});

staffCutOverrides.delete('/jobs/:id/designs/:designId/panes/:paneId/cut-override', async (c) => {
  const session = c.get('session');
  const db = companyDb(c.env, session.companyId);
  const found = await paneOf(db, c.req.param('id'), c.req.param('designId'), c.req.param('paneId'));
  if (!found) return c.json(NO_PANE, 404, PRIVATE);
  const { job, design, panel, existing } = found;
  if (!existing) return c.json({ ok: true }, 200, PRIVATE);
  await db.batch((batch) => {
    batch.remove('cut_overrides', existing.id);
    batch.insert('job_events', {
      job_id: job.id,
      type: 'cut_override_cleared',
      actor_kind: 'staff',
      actor_id: session.userId,
      data: { designId: design.id, paneId: panel.id, pane: panel.label, cut: `${panel.cutWidthMm} × ${panel.cutHeightMm}` },
    });
  });
  return c.json({ ok: true, cutWidthMm: panel.cutWidthMm, cutHeightMm: panel.cutHeightMm }, 200, PRIVATE);
});
