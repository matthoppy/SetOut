/**
 * The data layer's own rules: what it sets itself, what it refuses, and that
 * writes made together stand or fall together.
 */
import { DOCUMENT_FORMAT, ENGINE_VERSION } from '@setout/engine';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { companyDb, DataError } from '../src/db/company-db';
import { createCompany } from '../src/db/platform';
import { refusal, seedCompany, type Seeded } from './seed';

let seeded: Seeded;

beforeAll(async () => {
  seeded = await seedCompany('Custom Showers', 'CS');
});

describe('what the data layer sets itself', () => {
  test('ids say what they are', () => {
    expect(seeded.company.id).toMatch(/^co_[0-9A-Z]{26}$/);
    expect(seeded.rows.customers.id).toMatch(/^cus_[0-9A-Z]{26}$/);
    expect(seeded.rows.jobs.id).toMatch(/^job_[0-9A-Z]{26}$/);
    expect(seeded.rows.designs.id).toMatch(/^dsg_[0-9A-Z]{26}$/);
    expect(seeded.rows.design_revisions.id).toMatch(/^rev_[0-9A-Z]{26}$/);
    expect(seeded.rows.files.id).toMatch(/^fil_[0-9A-Z]{26}$/);
    expect(seeded.rows.job_events.id).toMatch(/^evt_[0-9A-Z]{26}$/);
  });

  test('times are UTC, and a change moves updated_at only', async () => {
    const { db, rows } = seeded;
    expect(rows.customers.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(rows.customers.updated_at).toBe(rows.customers.created_at);
    const changed = await db.update('customers', rows.customers.id, { phone: '020 7946 0000' });
    expect(changed?.phone).toBe('020 7946 0000');
    expect(changed?.created_at).toBe(rows.customers.created_at);
    expect(changed!.updated_at >= rows.customers.updated_at).toBe(true);
  });

  test('defaults come from the database', () => {
    expect(seeded.rows.jobs.stage).toBe('new');
    expect(seeded.rows.jobs.source).toBe('designer');
    expect(seeded.rows.designs.label).toBe('Shower');
    expect(seeded.rows.designs.current_revision).toBe(0);
    expect(seeded.rows.designers.config).toEqual({});
  });

  test('JSON goes in and comes back as it was', async () => {
    const { db, rows } = seeded;
    const revision = await db.get('design_revisions', rows.design_revisions.id);
    expect(revision?.document.format).toBe(DOCUMENT_FORMAT);
    expect(revision?.document.design.panels[0].width_mm).toBe(700);
    expect(revision?.computed.panels[0].cutWidthMm).toBe(685);
    expect(revision?.engine_version).toBe(ENGINE_VERSION);
    expect((await db.get('job_events', rows.job_events.id))?.data).toEqual({ via: 'designer' });
    expect((await db.get('designers', rows.designers.id))?.allowed_origins).toEqual(['https://cs.example']);
  });

  test('rows come back without the company on them', () => {
    for (const row of Object.values(seeded.rows)) expect(row).not.toHaveProperty('company_id');
  });
});

describe('finding rows', () => {
  test('by a column, in order, a page at a time', async () => {
    const { db, rows } = seeded;
    for (const name of ['Asha', 'Bola', 'Carys']) await db.insert('customers', { name, postcode: 'SW1A 1AA' });
    const all = await db.find('customers', { orderBy: { column: 'name' } });
    expect(all.map((c) => c.name)).toEqual(['Asha', 'Bola', 'Carys', 'Custom Showers customer']);
    const page = await db.find('customers', { orderBy: { column: 'name', direction: 'desc' }, limit: 2, offset: 1 });
    expect(page.map((c) => c.name)).toEqual(['Carys', 'Bola']);
    expect(await db.count('customers', { postcode: 'SW1A 1AA' })).toBe(3);
    expect(await db.count('customers', { postcode: null })).toBe(1);
    expect((await db.find('jobs', { where: { stage: 'new' } })).map((j) => j.id)).toEqual([rows.jobs.id]);
    expect(await db.find('jobs', { where: { stage: 'closed' } })).toEqual([]);
  });
});

describe('what the data layer refuses', () => {
  const refused = async (attempt: () => unknown) => {
    let error: unknown;
    try {
      await attempt();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).message;
  };

  test('a handle with no company', () => {
    expect(() => companyDb(env, '')).toThrow(DataError);
    expect(() => companyDb(env, undefined as never)).toThrow(DataError);
  });

  test('naming the company, in a new row, a change or a search', async () => {
    const { db, rows } = seeded;
    const other = 'co_SOMEONEELSE';
    expect(await refused(() => db.insert('customers', { name: 'X', company_id: other } as never))).toMatch(/cannot be named/);
    expect(await refused(() => db.update('customers', rows.customers.id, { company_id: other } as never))).toMatch(/cannot be named/);
    expect(await refused(() => db.find('customers', { where: { company_id: other } as never }))).toMatch(/cannot be named/);
    expect(await refused(() => db.count('customers', { company_id: other } as never))).toMatch(/cannot be named/);
  });

  test('a table or column that is not one of ours, however it is spelt', async () => {
    const { db } = seeded;
    await refused(() => db.find('companies' as never));
    await refused(() => db.find('customers; DROP TABLE customers' as never));
    await refused(() => db.get('sqlite_master' as never, 'x'));
    await refused(() => db.insert('customers', { name: 'X', "email) VALUES ('a'); --": 1 } as never));
    await refused(() => db.find('customers', { where: { "1=1 OR name": 'x' } as never }));
    await refused(() => db.find('customers', { orderBy: { column: 'name; DROP TABLE jobs' as never } }));
    await refused(() => db.find('toString' as never));
    expect(await db.count('customers')).toBeGreaterThan(0);
  });

  test('setting what the data layer sets', async () => {
    const { db, rows } = seeded;
    await refused(() => db.insert('customers', { name: 'X', id: 'cus_MINE' } as never));
    await refused(() => db.insert('customers', { name: 'X', created_at: '2000-01-01' } as never));
    await refused(() => db.update('customers', rows.customers.id, { id: 'cus_OTHER' } as never));
    await refused(() => db.update('customers', rows.customers.id, {}));
  });

  test('a value that is not on a column’s list', async () => {
    const { db, rows } = seeded;
    expect(await refused(() => db.update('jobs', rows.jobs.id, { stage: 'lost in the post' as never }))).toMatch(/one of new, reviewing/);
    await refused(() => db.insert('files', { kind: 'virus' as never, storage_key: 'k', content_type: 'x', size_bytes: 1 }));
    await refused(() => db.insert('job_events', { job_id: rows.jobs.id, type: 'note', actor_kind: 'robot' as never }));
    await refused(() => db.insert('customers', { name: true as never }));
    await refused(() => db.find('design_revisions', { where: { document: {} as never } }));
  });

  test('what the database itself will not hold', async () => {
    const { db, rows } = seeded;
    expect(await refusal(db.insert('customers', {} as never))).toMatch(/NOT NULL/i);
    expect(await refusal(db.insert('jobs', { reference: rows.jobs.reference, customer_id: rows.customers.id }))).toMatch(/UNIQUE/i);
    expect(await refusal(db.insert('files', { kind: 'photo', storage_key: 'k2', content_type: 'x', size_bytes: -1 }))).toMatch(/CHECK/i);
    expect(await refusal(db.insert('designers', { name: 'Second site', site_key: rows.designers.site_key }))).toMatch(/UNIQUE/i);
  });
});

describe('writes made together', () => {
  test('all happen', async () => {
    const { db } = seeded;
    const reference = await db.allocateJobReference();
    let jobId = '';
    await db.batch((batch) => {
      const customerId = batch.insert('customers', { name: 'Dana', email: 'dana@example.test' });
      jobId = batch.insert('jobs', { reference, customer_id: customerId, source: 'form' });
      batch.insert('designs', { job_id: jobId, label: 'En suite' });
      batch.insert('designs', { job_id: jobId, label: 'Main bathroom', position: 2 });
      batch.insert('job_events', { job_id: jobId, type: 'received', actor_kind: 'customer' });
    });
    const job = await db.get('jobs', jobId);
    expect(job?.reference).toBe(reference);
    expect(job?.source).toBe('form');
    const designs = await db.find('designs', { where: { job_id: jobId }, orderBy: { column: 'position' } });
    expect(designs.map((d) => d.label)).toEqual(['En suite', 'Main bathroom']);
    expect(await db.count('job_events', { job_id: jobId })).toBe(1);
  });

  test('or none do', async () => {
    const { db } = seeded;
    const before = await db.count('customers');
    const failure = await refusal(
      db.batch((batch) => {
        const customerId = batch.insert('customers', { name: 'Never saved' });
        batch.insert('jobs', { reference: 'CS-7777', customer_id: customerId });
        batch.insert('designs', { job_id: 'job_DOESNOTEXIST' });
      })
    );
    expect(failure).toMatch(/FOREIGN KEY/i);
    expect(await db.count('customers')).toBe(before);
    expect(await db.count('jobs', { reference: 'CS-7777' })).toBe(0);
  });

  test('an empty batch does nothing', async () => {
    await seeded.db.batch(() => {});
  });
});

describe('a design revision', () => {
  test('cannot be edited, by any column that says what it is', async () => {
    const { db, rows } = seeded;
    const revision = rows.design_revisions;
    const edits = [
      { document: { format: 1, design: { ...revision.document.design, heightMm: 2500 } } },
      { computed: { ...revision.computed, heightMm: 1 } },
      { number: 9 },
      { engine_version: '9.9.9' },
      { ruleset_version: 5 },
      { format_version: 2 },
      { author_kind: 'staff' as const },
      { reason: 'Rewriting history' },
    ];
    for (const edit of edits) {
      expect(await refusal(db.update('design_revisions', revision.id, edit as never)), Object.keys(edit)[0]).toMatch(
        /never edited/
      );
    }
    expect(await db.get('design_revisions', revision.id)).toEqual(revision);
  });

  test('can be signed off', async () => {
    const { db, rows } = seeded;
    const signed = await db.update('design_revisions', rows.design_revisions.id, {
      checked_by: 'usr_MATT',
      checked_at: '2026-11-10T12:00:00.000Z',
    });
    expect(signed?.checked_by).toBe('usr_MATT');
    expect(signed?.document).toEqual(rows.design_revisions.document);
  });

  test('has one number per design', async () => {
    const { db, rows } = seeded;
    const { id: _id, created_at: _created, ...again } = rows.design_revisions;
    expect(await refusal(db.insert('design_revisions', { ...again, checked_by: null, checked_at: null }))).toMatch(/UNIQUE/i);
    const second = await db.insert('design_revisions', { ...again, number: 2, author_kind: 'staff', reason: 'Door 20mm wider', checked_by: null, checked_at: null });
    expect(second.number).toBe(2);
  });
});

describe('companies', () => {
  test('need a name and a sensible reference prefix', async () => {
    expect(await refusal(createCompany(env, { name: ' ', referencePrefix: 'XX' }))).toMatch(/name/);
    for (const prefix of ['', 'x', 'cs', '1A', 'TOOLONG7', 'A-B', "A'; --"]) {
      expect(await refusal(createCompany(env, { name: 'Test', referencePrefix: prefix })), prefix).toMatch(/prefix/);
    }
  });

  test('cannot share a reference prefix', async () => {
    expect(await refusal(createCompany(env, { name: 'Copy Showers', referencePrefix: 'CS' }))).toMatch(/UNIQUE/i);
  });

  test('start on the free plan, active, in pounds', () => {
    expect(seeded.company).toMatchObject({ status: 'active', plan: 'free', currency: 'GBP', features: {}, settings: {} });
  });
});
