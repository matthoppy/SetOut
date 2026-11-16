/** A job like Custom Showers' CS-1001, for the confirmation and cut override tests. */
import { buildSpec, createDocument, designFromTemplate, DOCUMENT_FORMAT, ENGINE_VERSION } from '@setout/engine';
import type { Company } from './helpers';

/** A walk-in screen like CS-1001: one 400 × 1800 fixed panel, matte black channel on the floor and up the wall, a 900 opening. */
export async function walkInJob(c: Company, name = 'Oliver Milton', postcode = 'AL3 5QN') {
  const designer = (await c.db.find('designers', { limit: 1 }))[0];
  await c.db.update('designers', designer.id, { notify_emails: ['workshop@cs.example'] });
  const customer = await c.db.insert('customers', { name, email: 'oliver@example.test', phone: '07000 000000', postcode });
  const job = await c.db.insert('jobs', { reference: await c.db.allocateJobReference(), customer_id: customer.id, designer_id: designer.id, site_postcode: postcode });
  const design = designFromTemplate('walk-in');
  design.panels[0].width_mm = 400;
  design.heightMm = 1800;
  design.glassType = 'low-iron';
  design.glassCoating = 'easy-clean';
  design.finishId = 'matte-black';
  design.opening.walkInOpeningMm = 900;
  design.opening.runs[0].widthAtFloorMm = 400;
  const { context, rulesetVersion } = await c.db.engineContext();
  const computed = buildSpec(design, context);
  const row = await c.db.insert('designs', { job_id: job.id, current_revision: 1 });
  await c.db.insert('design_revisions', {
    design_id: row.id,
    number: 1,
    document: createDocument(design),
    format_version: DOCUMENT_FORMAT,
    engine_version: ENGINE_VERSION,
    ruleset_version: rulesetVersion,
    computed,
    author_kind: 'customer',
  });
  return { job, computed, designId: row.id };
}

