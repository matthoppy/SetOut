import {
  buildSpec,
  createDocument,
  designFromTemplate,
  DOCUMENT_FORMAT,
  ENGINE_VERSION,
} from '@setout/engine';
import { env } from 'cloudflare:workers';
import { companyDb, type CompanyDb, type CompanyRecord } from '../src/db/company-db';
import { addMember } from '../src/db/auth';
import { createCompany } from '../src/db/platform';
import type { Row, TableName } from '../src/db/tables';

export interface Seeded {
  company: CompanyRecord;
  db: CompanyDb;
  /** One row in every table the company owns. */
  rows: { [T in TableName]: Row<T> };
}

/**
 * A company with one of everything: a designer, a customer, a job with a
 * design and a revision, a draft, a file, an event, a member of staff, a
 * quote, a price and a subscription.
 */
export async function seedCompany(name: string, prefix: string): Promise<Seeded> {
  const company = await createCompany(env, { name, referencePrefix: prefix });
  const db = companyDb(env, company.id);

  const designer = await db.insert('designers', {
    name: `${name} website`,
    site_key: `pk_test_${prefix.toLowerCase()}`,
    allowed_origins: [`https://${prefix.toLowerCase()}.example`],
  });
  const customer = await db.insert('customers', {
    name: `${name} customer`,
    email: `customer@${prefix.toLowerCase()}.example`,
  });
  const job = await db.insert('jobs', {
    reference: await db.allocateJobReference(),
    customer_id: customer.id,
    designer_id: designer.id,
  });
  const design = await db.insert('designs', { job_id: job.id });

  const document = createDocument(designFromTemplate('alcove-door'));
  const { context, rulesetVersion } = await db.engineContext();
  const revision = await db.insert('design_revisions', {
    design_id: design.id,
    number: 1,
    document,
    format_version: DOCUMENT_FORMAT,
    engine_version: ENGINE_VERSION,
    ruleset_version: rulesetVersion,
    computed: buildSpec(document.design, context),
    author_kind: 'customer',
  });
  const draft = await db.insert('drafts', {
    designer_id: designer.id,
    resume_token_hash: `hash-of-${prefix}-token`,
    document,
    format_version: DOCUMENT_FORMAT,
    expires_at: '2027-01-01T00:00:00.000Z',
  });
  const file = await db.insert('files', {
    job_id: job.id,
    revision_id: revision.id,
    kind: 'photo',
    storage_key: `${company.id}/jobs/${job.id}/photo-1.jpg`,
    content_type: 'image/jpeg',
    size_bytes: 123_456,
  });
  const event = await db.insert('job_events', {
    job_id: job.id,
    type: 'received',
    actor_kind: 'customer',
    data: { via: 'designer' },
  });
  const { userId } = await addMember(env, company.id, `owner@${prefix.toLowerCase()}.example`, 'owner');
  const [membership] = await db.find('memberships', { where: { user_id: userId } });
  const audit = await db.insert('audit_log', {
    actor_id: null,
    action: 'member_added',
    target_id: membership.id,
    data: { email: `owner@${prefix.toLowerCase()}.example`, role: 'owner' },
  });

  const quote = await db.insert('quotes', {
    job_id: job.id,
    number: 1,
    lines: [{ key: 'fitting', description: 'Fitting', quantity: 1, unit: 'job', unitPricePence: 25_000 }],
    subtotal_pence: 25_000,
    vat_pence: 5_000,
    total_pence: 30_000,
  });
  const price = await db.insert('price_list', { key: 'fitting', unit: 'job', unit_price_pence: 25_000 });
  const subscription = await db.insert('subscriptions', {
    status: 'trialing',
    trial_ends_at: '2027-01-01T00:00:00.000Z',
    stripe_customer_id: `cus_${prefix}`,
  });

  return {
    company,
    db,
    rows: {
      designers: designer,
      customers: customer,
      jobs: job,
      designs: design,
      design_revisions: revision,
      drafts: draft,
      files: file,
      job_events: event,
      memberships: membership,
      audit_log: audit,
      quotes: quote,
      price_list: price,
      subscriptions: subscription,
    },
  };
}

/** Whether a promise was refused, and what it said. */
export async function refusal(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
