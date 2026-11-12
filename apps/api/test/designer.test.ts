/**
 * The designer's routes: what a designer is told about its company, and what
 * happens when a customer sends a design.
 */
import { createDocument, designFromTemplate, DOCUMENT_FORMAT, ENGINE_VERSION, handlePhotoOf } from '@setout/engine';
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { companyDb, type CompanyDb, type CompanyRecord } from '../src/db/company-db';
import { createCompany, newSiteKey, resolveDesigner } from '../src/db/platform';
import { TABLES, type TableName } from '../src/db/tables';
import { handlePhotos } from '../src/lib/designer-config';
import { checkBot, MAX_FILES } from '../src/lib/enquiry';

const ORIGIN = 'https://setout.test';

/** What the config route answers, as far as these tests read it. */
interface ConfigBody {
  brand: { name: string };
  finishes: unknown[];
  handles: { id: string }[];
  measurementDisclaimer: string;
  rules: unknown;
}

interface Company {
  record: CompanyRecord;
  db: CompanyDb;
  siteKey: string;
  designerId: string;
}

async function company(name: string, prefix: string, settings: Record<string, unknown> = {}): Promise<Company> {
  const record = await createCompany(env, { name, referencePrefix: prefix });
  const db = companyDb(env, record.id);
  const siteKey = newSiteKey('test');
  const designer = await db.insert('designers', {
    name: `${name} website`,
    site_key: siteKey,
    allowed_origins: [`https://${prefix.toLowerCase()}.example`],
    notify_emails: [`sales@${prefix.toLowerCase()}.example`],
    config: settings,
  });
  return { record, db, siteKey, designerId: designer.id };
}

const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const PNG = base64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3]);
const JPEG = base64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]);

function enquiry(siteKey: string, changes: Record<string, unknown> = {}) {
  return {
    siteKey,
    document: createDocument(designFromTemplate('alcove-panel-door')),
    templateId: 'alcove-panel-door',
    customer: {
      name: 'Asha Patel',
      email: 'Asha@Example.test',
      phone: '020 7946 0000',
      postcode: 'sw1a 1aa',
      notes: 'The tray is already in.',
      measurementsAcknowledged: true,
    },
    attachments: [
      { filename: 'plan-view.png', content: PNG, kind: 'drawing' },
      { filename: '../../Left wall (1).JPG', content: JPEG, kind: 'photo' },
    ],
    turnstileToken: null,
    antispam: { honeypot: '', elapsedMs: 240_000 },
    ...changes,
  };
}

const send = (body: unknown) =>
  exports.default.fetch(`${ORIGIN}/api/designer/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const config = (key?: string) =>
  exports.default.fetch(`${ORIGIN}/api/designer/config${key === undefined ? '' : `?key=${encodeURIComponent(key)}`}`);

async function counts(db: CompanyDb) {
  const out: Record<string, number> = {};
  for (const table of Object.keys(TABLES) as TableName[]) out[table] = await db.count(table);
  return out;
}

let ours: Company;
let theirs: Company;

beforeAll(async () => {
  ours = await company('Custom Showers', 'CS', {
    finishes: [{ id: 'gun-metal', label: 'Gun metal', swatch: '#4a4f54' }],
    intro: 'Design your enclosure.',
  });
  theirs = await company('Brennan Glass', 'BG');
});

describe('what a designer is told about its company', () => {
  test('an unknown, missing or malformed key is not a designer', async () => {
    for (const key of [undefined, '', 'pk_test_doesnotexist0000000000', 'CS', "' OR 1=1 --", ours.siteKey.toUpperCase()]) {
      const response = await config(key);
      expect(response.status, String(key)).toBe(404);
      expect(await response.json()).toMatchObject({ error: 'unknown_designer' });
    }
    expect(await resolveDesigner(env, 42)).toBeNull();
  });

  test('its name, its options and its rules, with defaults for what it has not set', async () => {
    await ours.db.rulesets.add({ 'deductions.door.outOnlyMm': 7 });
    const response = await config(ours.siteKey);
    expect(response.status).toBe(200);
    const body = (await response.json()) as ConfigBody;
    expect(body).toMatchObject({
      id: ours.designerId,
      siteKey: ours.siteKey,
      brand: { name: 'Custom Showers', primary: '#1e293b', primaryForeground: '#ffffff' },
      finishes: [{ id: 'gun-metal', label: 'Gun metal', swatch: '#4a4f54' }],
      glassThicknessMm: 10,
      intro: 'Design your enclosure.',
      rules: { version: 1, overrides: { 'deductions.door.outOnlyMm': 7 } },
    });
    expect(body.handles.map((h) => h.id)).toEqual(['pull', 'knob']);
    expect(body.measurementDisclaimer).toContain('I have measured this myself');
  });

  test('nothing private', async () => {
    const text = await (await config(ours.siteKey)).text();
    for (const secret of ['sales@cs.example', 'notify', 'allowed_origins', ours.record.id, 'reference_prefix', 'plan']) {
      expect(text, secret).not.toContain(secret);
    }
  });

  test('each key gets its own company', async () => {
    const body = (await (await config(theirs.siteKey)).json()) as ConfigBody;
    expect(body.brand.name).toBe('Brennan Glass');
    expect(body.rules).toEqual({ version: 0, overrides: {} });
    expect(body.finishes).toHaveLength(4);
  });

  test('which of CRL’s photos to show for a handle with a CRL number, and never the number', async () => {
    const coded = await company('Coded Glass', 'CG', {
      finishes: [{ id: 'gold', label: 'Brushed gold', swatch: '#c0a062', code: 'SB' }],
      handles: [
        { id: 'pull', label: 'Pull handle', description: 'Back to back.', code: 'BM8X8' },
        { id: 'knob', label: 'Knob', description: 'Round.' },
        { id: 'bar', label: 'Bar', description: 'Not one of CRL’s.', code: 'NOSUCH' },
      ],
    });
    const response = await config(coded.siteKey);
    const body = (await response.clone().json()) as { handles: Record<string, unknown>[]; finishes: Record<string, unknown>[] };
    expect(body.handles[0]).toEqual({ id: 'pull', label: 'Pull handle', description: 'Back to back.', photo: handlePhotoOf('BM8X8', 'CH')!.file });
    expect(body.handles[1]).toEqual({ id: 'knob', label: 'Knob', description: 'Round.' });
    expect(body.handles[2]).toEqual({ id: 'bar', label: 'Bar', description: 'Not one of CRL’s.' });
    expect(body.finishes).toEqual([{ id: 'gold', label: 'Brushed gold', swatch: '#c0a062' }]);
    const text = await response.text();
    for (const code of ['BM8X8', 'NOSUCH', '"code"']) expect(text, code).not.toContain(code);
  });

  test('a handle’s photo in a finish, where CRL shows a different one for it', () => {
    const finishes = [
      { id: 'chrome', label: 'Polished chrome', swatch: '#ddd' },
      { id: 'gold', label: 'Brushed gold', swatch: '#c0a062', code: 'SB' },
      { id: 'pink', label: 'Pink', swatch: '#f0f' },
    ];
    const pull = { id: 'pull', label: 'Pull', description: '', code: 'BM8X8' };
    const chrome = handlePhotoOf('BM8X8', 'CH')!.file;
    // CRL shows one photo for every finish of this handle, so there is only the one to send.
    expect(handlePhotos(pull, finishes)).toEqual({ photo: chrome });
    expect(handlePhotos({ ...pull, code: undefined }, finishes)).toEqual({});
  });

  test('a designer that has been switched off stops answering', async () => {
    const paused = await company('Paused Glass', 'PG');
    expect((await config(paused.siteKey)).status).toBe(200);
    await paused.db.update('designers', paused.designerId, { status: 'paused' });
    expect((await config(paused.siteKey)).status).toBe(404);
    expect((await send(enquiry(paused.siteKey))).status).toBe(404);
  });
});

describe('a customer sends a design', () => {
  test('it is saved whole: customer, job, design, revision, files and timeline', async () => {
    const response = await send(enquiry(ours.siteKey));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, reference: 'CS-1001' });

    const { db } = ours;
    const [customer] = await db.find('customers');
    expect(customer).toMatchObject({
      name: 'Asha Patel',
      email: 'asha@example.test',
      phone: '020 7946 0000',
      postcode: 'SW1A 1AA',
    });

    const [job] = await db.find('jobs');
    expect(job).toMatchObject({
      reference: 'CS-1001',
      customer_id: customer.id,
      designer_id: ours.designerId,
      stage: 'new',
      source: 'designer',
      site_postcode: 'SW1A 1AA',
    });

    const [design] = await db.find('designs');
    expect(design).toMatchObject({ job_id: job.id, current_revision: 1 });

    const [revision] = await db.find('design_revisions');
    expect(revision).toMatchObject({
      design_id: design.id,
      number: 1,
      format_version: DOCUMENT_FORMAT,
      engine_version: ENGINE_VERSION,
      ruleset_version: 1,
      author_kind: 'customer',
      checked_by: null,
    });
    expect(revision.document).toEqual(createDocument(designFromTemplate('alcove-panel-door')));

    const [event] = await db.find('job_events');
    expect(event).toMatchObject({
      job_id: job.id,
      type: 'received',
      actor_kind: 'customer',
      data: {
        template: 'alcove-panel-door',
        notes: 'The tray is already in.',
        botCheck: 'not_configured',
        sentQuickly: false,
        files: 2,
      },
    });

    const month = new Date().toISOString().slice(0, 7);
    expect(await db.usage.get(month)).toEqual({ enquiries: 1, quotes_sent: 0 });
  });

  test('the sizes are the server’s own, made to the company’s rules', async () => {
    const [revision] = await ours.db.find('design_revisions');
    // Custom Showers set a 7mm door clearance above, so the door is 688, not 690.
    expect(revision.computed.panels.map((p) => [p.cutWidthMm, p.cutHeightMm])).toEqual([
      [395, 1980],
      [688, 1980],
    ]);
  });

  test('anything the browser claims to have worked out is ignored', async () => {
    const response = await send(
      enquiry(ours.siteKey, {
        spec: { panels: [{ cutWidthMm: 1, cutHeightMm: 1 }] },
        computed: { panels: [] },
        reference: 'CS-9999',
        stage: 'ordered',
      })
    );
    expect(await response.json()).toEqual({ ok: true, reference: 'CS-1002' });
    const revisions = await ours.db.find('design_revisions', { orderBy: { column: 'created_at' } });
    expect(revisions[1].computed.panels.map((p) => p.cutWidthMm)).toEqual([395, 688]);
    expect((await ours.db.find('jobs', { where: { reference: 'CS-1002' } }))[0].stage).toBe('new');
  });

  test('the same customer sending again is the same customer', async () => {
    expect(await ours.db.count('customers')).toBe(1);
    expect(await ours.db.count('jobs')).toBe(2);
  });

  test('drawings and photos are stored in the company’s own folder', async () => {
    const [job] = await ours.db.find('jobs', { where: { reference: 'CS-1001' } });
    const [revision] = await ours.db.find('design_revisions', { orderBy: { column: 'created_at' } });
    const files = await ours.db.find('files', { where: { job_id: job.id }, orderBy: { column: 'kind' } });
    expect(files.map((f) => [f.kind, f.content_type, f.size_bytes, f.revision_id])).toEqual([
      ['drawing', 'image/png', 19, revision.id],
      ['photo', 'image/jpeg', 16, null],
    ]);
    for (const file of files) {
      expect(file.storage_key.startsWith(`${ours.record.id}/jobs/${job.id}/`)).toBe(true);
      expect(file.storage_key).not.toContain('..');
      const object = await env.FILES.get(file.storage_key);
      expect(object?.httpMetadata?.contentType).toBe(file.content_type);
      expect((await object!.arrayBuffer()).byteLength).toBe(file.size_bytes);
    }
    expect(files[1].storage_key.endsWith('-Left-wall-1.jpg')).toBe(true);
  });

  test('it lands in the company its key belongs to, whatever else it says', async () => {
    const before = await counts(ours.db);
    const response = await send(
      enquiry(theirs.siteKey, { companyId: ours.record.id, company_id: ours.record.id, designerId: ours.designerId })
    );
    expect(await response.json()).toEqual({ ok: true, reference: 'BG-1001' });
    expect(await counts(ours.db)).toEqual(before);
    expect(await theirs.db.count('jobs')).toBe(1);
    const [revision] = await theirs.db.find('design_revisions');
    // Brennan Glass has no rule changes, so its door is 690.
    expect(revision.computed.panels.map((p) => p.cutWidthMm)).toEqual([395, 690]);
    expect(revision.ruleset_version).toBe(0);
    const [job] = await theirs.db.find('jobs');
    expect(job.designer_id).toBe(theirs.designerId);
  });
});

describe('what is refused, and leaves nothing behind', () => {
  const refusals: [string, (key: string) => unknown, number, string][] = [
    ['a body that is not JSON', () => '{not json', 400, 'invalid_request'],
    ['no site key', (key) => ({ ...enquiry(key), siteKey: undefined }), 400, 'invalid_request'],
    ['a key that is not a designer', () => enquiry('pk_test_nobodyathome00000000'), 404, 'unknown_designer'],
    ['no name', (key) => enquiry(key, { customer: { ...enquiry(key).customer, name: ' ' } }), 400, 'invalid_request'],
    ['an email that is not one', (key) => enquiry(key, { customer: { ...enquiry(key).customer, email: 'asha at home' } }), 400, 'invalid_request'],
    ['measurements not confirmed', (key) => enquiry(key, { customer: { ...enquiry(key).customer, measurementsAcknowledged: false } }), 400, 'not_acknowledged'],
    ['a note the length of a novel', (key) => enquiry(key, { customer: { ...enquiry(key).customer, notes: 'x'.repeat(2001) } }), 400, 'invalid_request'],
    ['no design', (key) => enquiry(key, { document: undefined }), 422, 'invalid_design'],
    ['a design from a newer engine', (key) => enquiry(key, { document: { format: 99, design: {} } }), 422, 'invalid_design'],
    ['a width that is text', (key) => {
      const body = enquiry(key);
      (body.document.design.panels[0] as { width_mm: unknown }).width_mm = 'wide';
      return body;
    }, 422, 'invalid_design'],
    ['a file that is not a picture', (key) => enquiry(key, { attachments: [{ filename: 'run.exe', content: btoa('MZ this is a program'), kind: 'photo' }] }), 400, 'unsupported_file'],
    ['a file that is not base64', (key) => enquiry(key, { attachments: [{ filename: 'a.png', content: '***', kind: 'photo' }] }), 400, 'invalid_request'],
    ['one file more than may be sent', (key) => enquiry(key, { attachments: Array.from({ length: MAX_FILES + 1 }, () => ({ filename: 'a.png', content: PNG, kind: 'photo' })) }), 400, 'invalid_request'],
  ];

  test.each(refusals)('%s', async (_name, build, status, code) => {
    const before = await counts(theirs.db);
    const response = await send(build(theirs.siteKey));
    expect(response.status).toBe(status);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe(code);
    expect(body.message.length).toBeGreaterThan(10);
    expect(await counts(theirs.db)).toEqual(before);
  });

  test('a script that fills the hidden field is told it worked and nothing is kept', async () => {
    const before = await counts(theirs.db);
    const response = await send(enquiry(theirs.siteKey, { antispam: { honeypot: 'http://spam.example', elapsedMs: 900 } }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, reference: null });
    expect(await counts(theirs.db)).toEqual(before);
    expect(await theirs.db.allocateJobReference()).toBe('BG-1002');
  });

  test('a design sent in seconds is kept but marked', async () => {
    await send(enquiry(theirs.siteKey, { antispam: { honeypot: '', elapsedMs: 2_000 }, attachments: [] }));
    const events = await theirs.db.find('job_events', { orderBy: { column: 'created_at', direction: 'desc' }, limit: 1 });
    expect(events[0].data).toMatchObject({ sentQuickly: true, files: 0 });
  });

  test('only POST sends a design', async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/designer/enquiries`);
    expect(response.status).toBe(404);
  });
});

describe('the bot check', () => {
  const answering = (success: boolean) => (async () => Response.json({ success })) as unknown as typeof fetch;

  test('is not run without a secret, and says so', async () => {
    expect(await checkBot(undefined, 'token', null)).toBe('not_configured');
  });

  test('lets a missing token through, marked', async () => {
    expect(await checkBot('secret', null, null, answering(true))).toBe('not_run');
  });

  test('passes a good token and fails a bad one', async () => {
    expect(await checkBot('secret', 'good', '203.0.113.9', answering(true))).toBe('passed');
    expect(await checkBot('secret', 'bad', null, answering(false))).toBe('failed');
  });

  test('does not blame the customer when the checker itself is down', async () => {
    const down = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await checkBot('secret', 'token', null, down)).toBe('not_run');
  });

  test('sends the secret and the token to Cloudflare, and nowhere else', async () => {
    let asked: { url: string; body: string } | null = null;
    const spy = (async (url: string, init: { body: URLSearchParams }) => {
      asked = { url, body: init.body.toString() };
      return Response.json({ success: true });
    }) as unknown as typeof fetch;
    await checkBot('s3cret', 'tok', '203.0.113.9', spy);
    expect(asked).toEqual({
      url: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      body: 'secret=s3cret&response=tok&remoteip=203.0.113.9',
    });
  });
});
