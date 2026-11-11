/**
 * No company can see another's data.
 *
 * These tests try, from one company's side, every way there is of reaching
 * another company's rows: by id, by listing, by changing, by deleting, and by
 * pointing a new row at one. Each must fail, for every table a company owns.
 *
 * The loop runs over the data layer's own table list, so a table added there
 * is tested here without anyone remembering to.
 */
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { companyDb } from '../src/db/company-db';
import { optionsInUse, readSettings, saveSettings, settingsChanges, type SettingsWrite } from '../src/db/settings';
import { TABLES, type RowChanges, type TableName } from '../src/db/tables';
import { api, json, signIn } from './helpers';
import { refusal, seedCompany, type Seeded } from './seed';

const tables = Object.keys(TABLES) as TableName[];

/** A change to try on someone else's row, for each table. */
const TAMPER: { [T in TableName]: RowChanges<T> } = {
  designers: { name: 'Taken over' },
  customers: { name: 'Taken over', email: 'attacker@evil.example' },
  jobs: { stage: 'closed' },
  designs: { label: 'Taken over' },
  design_revisions: { checked_by: 'attacker' },
  drafts: { expires_at: '2000-01-01T00:00:00.000Z' },
  files: { kind: 'other' },
  job_events: { type: 'tampered' },
  memberships: { role: 'staff' },
  audit_log: { data: { tampered: true } },
  quotes: { note: 'tampered' },
  price_list: { unit_price_pence: 1 },
};

let ours: Seeded;
let theirs: Seeded;

beforeAll(async () => {
  ours = await seedCompany('Custom Showers', 'CS');
  theirs = await seedCompany('Brennan Glass', 'BG');
});

test('every table has a row to test with', () => {
  for (const table of tables) {
    expect(theirs.rows[table], `seed a ${table} row in test/seed.ts so its isolation is tested`).toBeDefined();
    expect(TAMPER[table], `add a change for ${table} to TAMPER`).toBeDefined();
  }
});

describe.each(tables)('%s', (table) => {
  test('another company’s row cannot be read by its id', async () => {
    expect(await ours.db.get(table, theirs.rows[table].id)).toBeNull();
    expect(await theirs.db.get(table, theirs.rows[table].id)).toEqual(theirs.rows[table]);
  });

  test('a listing holds only the company’s own rows', async () => {
    const listed = await ours.db.find(table);
    expect(listed.map((row) => row.id)).toEqual([ours.rows[table].id]);
    expect(await ours.db.count(table)).toBe(1);
  });

  test('another company’s row cannot be found by searching for it', async () => {
    const found = await ours.db.find(table, { where: { id: theirs.rows[table].id } as never });
    expect(found).toEqual([]);
  });

  test('another company’s row cannot be changed', async () => {
    expect(await ours.db.update(table, theirs.rows[table].id, TAMPER[table] as never)).toBeNull();
    expect(await theirs.db.get(table, theirs.rows[table].id)).toEqual(theirs.rows[table]);
  });

  test('another company’s row cannot be deleted', async () => {
    expect(await ours.db.remove(table, theirs.rows[table].id)).toBe(false);
    expect(await theirs.db.get(table, theirs.rows[table].id)).toEqual(theirs.rows[table]);
  });

  test('a batch cannot change or delete another company’s row', async () => {
    await ours.db.batch((batch) => {
      batch.update(table, theirs.rows[table].id, TAMPER[table] as never);
      batch.remove(table, theirs.rows[table].id);
    });
    expect(await theirs.db.get(table, theirs.rows[table].id)).toEqual(theirs.rows[table]);
  });
});

describe('pointing a row at another company’s row', () => {
  // Every link between two company tables, tried with the other company's id.
  const links: [string, () => Promise<unknown>][] = [
    ['a job for their customer', () =>
      ours.db.insert('jobs', { reference: 'CS-9001', customer_id: theirs.rows.customers.id })],
    ['a job from their designer', () =>
      ours.db.insert('jobs', { reference: 'CS-9002', customer_id: ours.rows.customers.id, designer_id: theirs.rows.designers.id })],
    ['a design on their job', () => ours.db.insert('designs', { job_id: theirs.rows.jobs.id })],
    ['a revision of their design', () =>
      ours.db.insert('design_revisions', { ...revisionOf(ours), design_id: theirs.rows.designs.id, number: 2 })],
    ['a draft on their designer', () =>
      ours.db.insert('drafts', { designer_id: theirs.rows.designers.id, resume_token_hash: 'hash-x', document: {}, format_version: 1, expires_at: '2027-01-01T00:00:00.000Z' })],
    ['a file on their job', () =>
      ours.db.insert('files', { job_id: theirs.rows.jobs.id, kind: 'photo', storage_key: 'x/1.jpg', content_type: 'image/jpeg', size_bytes: 1 })],
    ['a file on their revision', () =>
      ours.db.insert('files', { revision_id: theirs.rows.design_revisions.id, kind: 'drawing', storage_key: 'x/2.png', content_type: 'image/png', size_bytes: 1 })],
    ['a file on their draft', () =>
      ours.db.insert('files', { draft_id: theirs.rows.drafts.id, kind: 'photo', storage_key: 'x/3.jpg', content_type: 'image/jpeg', size_bytes: 1 })],
    ['an event on their job', () =>
      ours.db.insert('job_events', { job_id: theirs.rows.jobs.id, type: 'note', actor_kind: 'staff' })],
    ['our job moved to their customer', () =>
      ours.db.update('jobs', ours.rows.jobs.id, { customer_id: theirs.rows.customers.id })],
    ['our file moved to their job', () =>
      ours.db.update('files', ours.rows.files.id, { job_id: theirs.rows.jobs.id })],
    ['our design moved to their job', () =>
      ours.db.update('designs', ours.rows.designs.id, { job_id: theirs.rows.jobs.id })],
  ];

  test.each(links)('%s is refused by the database', async (_name, attempt) => {
    expect(await refusal(attempt())).toMatch(/FOREIGN KEY/i);
  });

  test('nothing was left behind by the refused attempts', async () => {
    for (const table of tables) {
      expect(await theirs.db.count(table), table).toBe(1);
      expect(await ours.db.count(table), table).toBe(1);
    }
    expect((await ours.db.get('jobs', ours.rows.jobs.id))?.customer_id).toBe(ours.rows.customers.id);
  });
});

describe('what belongs to a company besides its rows', () => {
  test('its own record', async () => {
    expect((await ours.db.company())?.name).toBe('Custom Showers');
    expect((await theirs.db.company())?.name).toBe('Brennan Glass');
  });

  test('its job references', async () => {
    expect(ours.rows.jobs.reference).toBe('CS-1001');
    expect(theirs.rows.jobs.reference).toBe('BG-1001');
    expect(await ours.db.allocateJobReference()).toBe('CS-1002');
    expect(await ours.db.allocateJobReference()).toBe('CS-1003');
    expect(await theirs.db.allocateJobReference()).toBe('BG-1002');
  });

  test('job references handed out together are all different', async () => {
    const references = await Promise.all(Array.from({ length: 20 }, () => ours.db.allocateJobReference()));
    expect(new Set(references).size).toBe(20);
  });

  test('its making rules', async () => {
    expect(await ours.db.rulesets.add({ 'deductions.door.outOnlyMm': 6 }, 'Tighter door')).toBe(1);
    expect(await ours.db.rulesets.add({ 'deductions.door.outOnlyMm': 7 })).toBe(2);
    expect(await ours.db.rulesets.current()).toEqual({ version: 2, overrides: { 'deductions.door.outOnlyMm': 7 } });
    expect(await theirs.db.rulesets.current()).toEqual({ version: 0, overrides: {} });

    const mine = await ours.db.engineContext();
    const yours = await theirs.db.engineContext();
    expect(mine.rulesetVersion).toBe(2);
    expect(mine.context.companyName).toBe('Custom Showers');
    expect(mine.context.rules.making.deductions.door.outOnlyMm).toBe(7);
    expect(yours.rulesetVersion).toBe(0);
    expect(yours.context.companyName).toBe('Brennan Glass');
    expect(yours.context.rules.making.deductions.door.outOnlyMm).toBe(5);
  });

  test('rules a company may not change are not saved', async () => {
    expect(await refusal(theirs.db.rulesets.add({ 'hinges.offsetMm': 100 } as never))).toMatch(/not a rule/);
    expect(await refusal(theirs.db.rulesets.add({ 'deductions.door.outOnlyMm': 99 }))).toMatch(/between/);
    expect((await theirs.db.rulesets.current()).version).toBe(0);
  });

  test('its usage', async () => {
    await ours.db.usage.add('enquiries', '2026-11');
    await ours.db.usage.add('enquiries', '2026-11');
    await ours.db.usage.add('quotes_sent', '2026-11');
    expect(await ours.db.usage.get('2026-11')).toEqual({ enquiries: 2, quotes_sent: 1 });
    expect(await theirs.db.usage.get('2026-11')).toEqual({ enquiries: 0, quotes_sent: 0 });
    expect(await ours.db.usage.get('2026-12')).toEqual({ enquiries: 0, quotes_sent: 0 });
  });

  test('a company that does not exist has nothing', async () => {
    const nobody = companyDb(env, 'co_DOESNOTEXIST');
    expect(await nobody.company()).toBeNull();
    for (const table of tables) expect(await nobody.find(table), table).toEqual([]);
    expect(await refusal(nobody.allocateJobReference())).toMatch(/does not exist/);
    expect(await refusal(nobody.insert('customers', { name: 'Ghost' }))).toMatch(/FOREIGN KEY/i);
  });
});

describe('a company’s settings', () => {
  test('are read for its own record and designers alone', async () => {
    const mine = await readSettings(env, ours.company.id);
    expect(mine?.company.name).toBe('Custom Showers');
    expect(mine?.designers.map((d) => d.id)).toEqual([ours.rows.designers.id]);
    expect(await readSettings(env, 'co_DOESNOTEXIST')).toBeNull();
  });

  test('cannot be written to another company’s designer, and nothing goes on record', async () => {
    const stored = await readSettings(env, theirs.company.id);
    const target = stored?.designers[0];
    if (!target) throw new Error('no designer');
    const write: SettingsWrite = {
      table: 'designers',
      id: target.id,
      columns: {
        notify_emails: { was: target.notify_emails, now: '["attacker@evil.example"]' },
        config: { was: target.config, now: '{"finishes":[]}' },
      },
    };
    expect(await saveSettings(env, ours.company.id, 'usr_attacker', write, { changes: [] })).toBe(false);
    expect(await theirs.db.get('designers', target.id)).toEqual(theirs.rows.designers);
    expect(await ours.db.count('audit_log')).toBe(1);
    expect(await theirs.db.count('audit_log')).toBe(1);
  });

  test('cannot rename another company', async () => {
    const stored = await readSettings(env, theirs.company.id);
    const write: SettingsWrite = { table: 'companies', columns: { name: { was: stored?.company.name ?? '', now: 'Taken over' } } };
    expect(await saveSettings(env, ours.company.id, 'usr_attacker', write, { changes: [] })).toBe(false);
    expect((await theirs.db.company())?.name).toBe('Brennan Glass');
    expect((await ours.db.company())?.name).toBe('Custom Showers');
  });

  test('never write which websites may show a designer, or anything else beyond the settings', async () => {
    const attempts = [
      { table: 'designers', id: ours.rows.designers.id, columns: { allowed_origins: { was: '[]', now: '["https://evil.example"]' } } },
      { table: 'designers', id: ours.rows.designers.id, columns: { status: { was: 'active', now: 'paused' } } },
      { table: 'designers', id: ours.rows.designers.id, columns: { company_id: { was: ours.company.id, now: theirs.company.id } } },
      { table: 'companies', columns: { status: { was: 'active', now: 'paused' } } },
      { table: 'companies', columns: { plan: { was: 'free', now: 'paid' } } },
    ];
    for (const write of attempts) {
      expect(await refusal(saveSettings(env, ours.company.id, 'usr_x', write as unknown as SettingsWrite, {}))).toMatch(/not a setting/);
    }
    expect(await ours.db.get('designers', ours.rows.designers.id)).toEqual(ours.rows.designers);
  });

  test('count only the company’s own showers against each option', async () => {
    // Each seeded shower stands at its first revision.
    await ours.db.update('designs', ours.rows.designs.id, { current_revision: 1 });
    await theirs.db.update('designs', theirs.rows.designs.id, { current_revision: 1 });
    expect(await optionsInUse(env, theirs.company.id, theirs.rows.designers.id, true)).toEqual({ finishes: { chrome: 1 }, handles: { pull: 1 } });
    expect(await optionsInUse(env, ours.company.id, ours.rows.designers.id, true)).toEqual({ finishes: { chrome: 1 }, handles: { pull: 1 } });
    expect(await optionsInUse(env, ours.company.id, theirs.rows.designers.id, true)).toEqual({ finishes: {}, handles: {} });
  });

  test('list only the company’s own changes', async () => {
    await theirs.db.insert('audit_log', { actor_id: null, action: 'settings_changed', target_id: theirs.company.id, data: { changes: [] } });
    expect(await settingsChanges(env, ours.company.id)).toEqual([]);
    expect(await settingsChanges(env, theirs.company.id)).toHaveLength(1);
  });

  test('cannot be seen or changed by another company’s owner in the workspace', async () => {
    const rival = await signIn('owner@bg.example');
    const seen = await json<{ company: { name: string }; designers: { id: string; versions: Record<string, string> }[] }>(
      await api('/settings', { cookie: rival })
    );
    expect(seen.company.name).toBe('Brennan Glass');
    expect(seen.designers.map((d) => d.id)).toEqual([theirs.rows.designers.id]);
    const response = await api(`/settings/designers/${ours.rows.designers.id}`, {
      cookie: rival,
      method: 'PATCH',
      body: JSON.stringify({ notifyEmails: ['attacker@evil.example'], basedOn: seen.designers[0].versions }),
    });
    expect(response.status).toBe(404);
    expect(await ours.db.get('designers', ours.rows.designers.id)).toEqual(ours.rows.designers);
    expect(await settingsChanges(env, ours.company.id)).toEqual([]);
  });
});

function revisionOf(seeded: Seeded) {
  const { id: _id, created_at: _created, ...rest } = seeded.rows.design_revisions;
  return rest;
}
