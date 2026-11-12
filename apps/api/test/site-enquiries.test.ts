/**
 * SetOut's own site: the get-started form. What it takes, what it refuses,
 * how much it will hold, where it answers, and the email it sends.
 */
import { env, exports } from 'cloudflare:workers';
import { describe, expect, test } from 'vitest';
import {
  ENQUIRIES_A_DAY,
  ENQUIRIES_PER_ADDRESS_A_DAY,
  latestSiteEnquiries,
  saveSiteEnquiry,
  type NewSiteEnquiry,
  type SiteEnquiryRow,
} from '../src/db/site-enquiries';
import {
  MAX_SITE_BODY_BYTES,
  notifySiteEnquiry,
  readSiteEnquiry,
  siteEnquiryEmail,
  websiteAddress,
  type SiteEnquiryEmailInput,
} from '../src/lib/site-enquiry';

const SITE = 'https://site.test';
const WWW = 'https://www.site.test';
const BOTH = 'https://setout-staging.example.workers.dev';
const DESIGNER = 'https://designer.test';
const APP = 'https://app.test';

function form(changes: Record<string, unknown> = {}) {
  return {
    company: 'Northgate Glass',
    name: 'Priya Shah',
    email: 'Priya@Northgate.example',
    phone: '0161 496 0000',
    website: 'northgate.example',
    showers: '5-20',
    message: 'We fit about ten a month and measure every one by hand.',
    turnstileToken: null,
    antispam: { honeypot: '', elapsedMs: 45_000 },
    ...changes,
  };
}

interface SendOptions {
  host?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  raw?: string;
}

function send(body: unknown, options: SendOptions = {}): Promise<Response> {
  const host = options.host ?? SITE;
  const headers = new Headers({ 'Content-Type': 'application/json', ...options.headers });
  if (options.origin !== null) headers.set('Origin', options.origin ?? host);
  return exports.default.fetch(`${host}/api/site/enquiries`, {
    method: 'POST',
    headers,
    body: options.raw ?? JSON.stringify(body),
  });
}

const stored = async (email: string): Promise<SiteEnquiryRow[]> =>
  (await env.DB.prepare('SELECT * FROM site_enquiries WHERE email = ? ORDER BY created_at').bind(email).all<SiteEnquiryRow>())
    .results;

const message = async (response: Response) => ((await response.json()) as { message?: string }).message;

describe('a shower company asks to start', () => {
  test('the enquiry is saved as it was sent, tidied', async () => {
    const response = await send(form());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });

    const [row, ...others] = await stored('priya@northgate.example');
    expect(others).toEqual([]);
    expect(row).toMatchObject({
      company_name: 'Northgate Glass',
      contact_name: 'Priya Shah',
      email: 'priya@northgate.example',
      phone: '0161 496 0000',
      website: 'https://northgate.example/',
      showers_per_month: '5-20',
      message: 'We fit about ten a month and measure every one by hand.',
      // No secret in tests, so the check did not run and the row says so.
      bot_check: 'not_configured',
      sent_quickly: 0,
      // And no mail key, so nobody was emailed and the row says that too.
      email_status: 'not_set_up',
      email_detail: null,
    });
    expect(row.id).toMatch(/^enq_[0-9A-Z]{26}$/);
    expect(Date.parse(row.created_at)).toBeGreaterThan(Date.now() - 60_000);
  });

  test('only the company, a name and an email are needed', async () => {
    const response = await send({ company: 'Bare Glass', name: 'Jo Bare', email: 'jo@bare.example' });
    expect(response.status).toBe(201);
    const [row] = await stored('jo@bare.example');
    expect(row).toMatchObject({ phone: null, website: null, showers_per_month: null, message: null, sent_quickly: 0 });
  });

  test('one sent in under three seconds is kept and marked', async () => {
    await send(form({ email: 'quick@northgate.example', antispam: { honeypot: '', elapsedMs: 900 } }));
    expect((await stored('quick@northgate.example'))[0].sent_quickly).toBe(1);
  });

  test('a script that fills the hidden field is told it worked, and nothing is kept', async () => {
    const response = await send(form({ email: 'bot@northgate.example', antispam: { honeypot: 'http://spam.example', elapsedMs: 5 } }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(await stored('bot@northgate.example')).toEqual([]);
  });
});

describe('what the form refuses', () => {
  test('each thing that is missing or wrong, with a sentence a person can read', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ company: '' }, 'Your company is needed.'],
      [{ company: 'A' }, 'Your company is needed.'],
      [{ name: '   ' }, 'Your name is needed.'],
      [{ email: '' }, 'Your email is needed.'],
      [{ email: 'not an address' }, 'That email address does not look right.'],
      [{ company: 'x'.repeat(101) }, 'Your company is too long. The limit is 100 characters.'],
      [{ message: 'x'.repeat(2001) }, 'Your message is too long. The limit is 2000 characters.'],
      [{ phone: 12345 }, 'Your phone number must be text.'],
      [{ website: 'not a website' }, 'That website address does not look right.'],
      [{ website: 'javascript:alert(1)' }, 'That website address does not look right.'],
      [{ showers: 'lots' }, 'Choose how many showers a month from the list.'],
      [{ showers: 'constructor' }, 'Choose how many showers a month from the list.'],
    ];
    for (const [change, sentence] of cases) {
      const response = await send(form({ email: 'refused@northgate.example', ...change }));
      expect(response.status, JSON.stringify(change)).toBe(400);
      expect(await message(response), JSON.stringify(change)).toBe(sentence);
    }
    expect(await stored('refused@northgate.example')).toEqual([]);
  });

  test('anything that is not the form', async () => {
    for (const raw of ['', 'not json', '[]', '"text"', 'null']) {
      const response = await send(null, { raw });
      expect(response.status, raw).toBe(400);
      expect(await message(response), raw).toBe('The request must be a JSON object.');
    }
  });

  test('more than a form could hold', async () => {
    const response = await send(form({ email: 'big@northgate.example', message: 'x'.repeat(MAX_SITE_BODY_BYTES) }));
    expect(response.status).toBe(413);
    expect(await stored('big@northgate.example')).toEqual([]);
  });

  test('a request from another website, or from no page at all', async () => {
    for (const origin of ['https://evil.example', 'https://designer.test', null]) {
      const response = await send(form({ email: 'elsewhere@northgate.example' }), { origin });
      expect(response.status, String(origin)).toBe(403);
      expect(await response.json()).toMatchObject({ error: 'wrong_origin' });
    }
    expect(await stored('elsewhere@northgate.example')).toEqual([]);
  });

  test('reading it back: there is no route that lists enquiries', async () => {
    const response = await exports.default.fetch(`${SITE}/api/site/enquiries`);
    expect(response.status).toBe(404);
  });
});

describe('how a website is read', () => {
  test('as people type it', () => {
    expect(websiteAddress('')).toBe('');
    expect(websiteAddress('northgate.example')).toBe('https://northgate.example/');
    expect(websiteAddress('WWW.Northgate.Example/showers')).toBe('https://www.northgate.example/showers');
    expect(websiteAddress('http://northgate.example')).toBe('http://northgate.example/');
  });

  test('and never as anything but a plain web address', () => {
    for (const typed of ['northgate', 'ftp://northgate.example', 'javascript:alert(1)', 'https://user:pass@northgate.example', 'two words.example', 'https://']) {
      expect(websiteAddress(typed), typed).toBeNull();
    }
  });
});

describe('how much the form will hold', () => {
  const enquiry = (email: string): NewSiteEnquiry => ({
    company: 'Flood Glass',
    name: 'Sam Flood',
    email,
    phone: '',
    website: '',
    showers: '',
    message: '',
    botCheck: 'not_run',
    sentQuickly: false,
    emailStatus: 'not_set_up',
  });

  test(`${ENQUIRIES_PER_ADDRESS_A_DAY} from one address in a day, and the next is told we have it`, async () => {
    for (let i = 0; i < ENQUIRIES_PER_ADDRESS_A_DAY; i++) {
      expect((await send(form({ email: 'again@northgate.example' }))).status).toBe(201);
    }
    const response = await send(form({ email: 'Again@Northgate.example' }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: 'too_many',
      message: 'We already have your details and will be in touch. There is no need to send them again.',
    });
    expect(await stored('again@northgate.example')).toHaveLength(ENQUIRIES_PER_ADDRESS_A_DAY);
    // Another address is not held up by it.
    expect((await send(form({ email: 'someone-else@northgate.example' }))).status).toBe(201);
  });

  test('a day later the address can write again', async () => {
    const day = new Date('2020-03-01T09:00:00Z');
    for (let i = 0; i < ENQUIRIES_PER_ADDRESS_A_DAY; i++) {
      expect((await saveSiteEnquiry(env, enquiry('later@flood.example'), day)).saved).toBe(true);
    }
    expect(await saveSiteEnquiry(env, enquiry('later@flood.example'), new Date('2020-03-02T08:59:00Z'))).toEqual({
      saved: false,
      reason: 'address_limit',
    });
    expect((await saveSiteEnquiry(env, enquiry('later@flood.example'), new Date('2020-03-02T09:00:01Z'))).saved).toBe(true);
  });

  test(`${ENQUIRIES_A_DAY} in a day from everyone, and no more`, async () => {
    // A day of its own, long before any other test's rows.
    const day = new Date('2021-06-01T09:00:00Z');
    for (let i = 0; i < ENQUIRIES_A_DAY; i++) {
      const kept = await saveSiteEnquiry(env, enquiry(`flood-${i}@flood.example`), new Date(day.getTime() + i * 1000));
      expect(kept.saved, String(i)).toBe(true);
    }
    const next = new Date(day.getTime() + 3_600_000);
    expect(await saveSiteEnquiry(env, enquiry('one-more@flood.example'), next)).toEqual({ saved: false, reason: 'day_limit' });
    expect(await stored('one-more@flood.example')).toEqual([]);
    // The day after, there is room again.
    expect((await saveSiteEnquiry(env, enquiry('one-more@flood.example'), new Date(day.getTime() + 2 * 86_400_000))).saved).toBe(true);
  });

  test('the latest come back newest first', async () => {
    const latest = await latestSiteEnquiries(env, 3);
    expect(latest).toHaveLength(3);
    expect(latest[0].created_at >= latest[1].created_at && latest[1].created_at >= latest[2].created_at).toBe(true);
  });
});

describe('where the form answers', () => {
  test('on the site’s address, and where everything shares one', async () => {
    expect((await send(form({ email: 'site@where.example' }))).status).toBe(201);
    expect((await send(form({ email: 'both@where.example' }), { host: BOTH })).status).toBe(201);
    expect(await stored('both@where.example')).toHaveLength(1);
  });

  test('never on the designer’s address or the workspace’s', async () => {
    for (const host of [DESIGNER, APP]) {
      const response = await send(form({ email: 'wrong-place@where.example' }), { host });
      expect(response.status, host).toBe(404);
      expect(await response.json(), host).toEqual({ error: 'not_found' });
      expect((await exports.default.fetch(`${host}/api/site/config`)).status, host).toBe(404);
    }
    expect(await stored('wrong-place@where.example')).toEqual([]);
  });

  test('the site’s address has none of the designer’s, the quote’s or the workspace’s routes', async () => {
    for (const host of [SITE, WWW]) {
      for (const path of ['/api/designer/config?key=pk_test_x', '/api/quote/qt_abcdefghijkmnpqrstuvwxyz23456789', '/api/workspace/me']) {
        const response = await exports.default.fetch(host + path);
        expect(response.status, host + path).toBe(404);
        expect(await response.json(), host + path).toEqual({ error: 'not_found' });
      }
      expect((await exports.default.fetch(`${host}/api/health`)).status).toBe(200);
    }
  });

  test('the form is told the bot check’s public key, or that there is none', async () => {
    const response = await exports.default.fetch(`${SITE}/api/site/config`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ turnstileSiteKey: null });
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
  });
});

describe('the email that tells SetOut', () => {
  const input = (changes: Partial<SiteEnquiryEmailInput> = {}): SiteEnquiryEmailInput => ({
    enquiry: readSiteEnquiry(form()),
    botCheck: 'passed',
    sentQuickly: false,
    environment: 'production',
    ...changes,
  });
  const FROM = 'SetOut <hello@setout.test>';

  test('goes to the inbox set for the environment, and replies go to the person who asked', () => {
    const email = siteEnquiryEmail(input(), FROM, 'new@setout.test');
    expect(email.from).toBe(FROM);
    expect(email.to).toEqual(['new@setout.test']);
    expect(email.reply_to).toBe('priya@northgate.example');
    expect(email.subject).toBe('New SetOut enquiry: Northgate Glass');
    expect(email.attachments).toEqual([]);
    for (const said of ['Northgate Glass', 'Priya Shah', '0161 496 0000', 'https://northgate.example/', '5 to 20', 'measure every one by hand']) {
      expect(email.html, said).toContain(said);
    }
    expect(email.html).not.toContain('bot check');
    expect(email.html).not.toContain('not the real one');
  });

  test('says what was not given, and what to be wary of', () => {
    const bare = readSiteEnquiry({ company: 'Bare Glass', name: 'Jo Bare', email: 'jo@bare.example' });
    const email = siteEnquiryEmail(input({ enquiry: bare, botCheck: 'not_run', sentQuickly: true, environment: 'staging' }), FROM, 'new@setout.test');
    expect(email.html.match(/Not given/g)).toHaveLength(3);
    expect(email.html).toContain('It arrived with no bot check.');
    expect(email.html).toContain('faster than a person usually fills it in');
    expect(email.html).toContain('It came from the staging site, not the real one.');
    expect(email.html).not.toContain('Their message');
  });

  test('escapes everything that came from outside', () => {
    const hostile = readSiteEnquiry(
      form({ company: '<script>alert(1)</script>', name: 'A "quoted" <b>name</b>', message: '<img src=x onerror=alert(1)>\nSecond line' })
    );
    const email = siteEnquiryEmail(input({ enquiry: hostile }), FROM, 'new@setout.test');
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('<b>name');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.subject).toBe('New SetOut enquiry: <script>alert(1)</script>');
  });

  const saved = async (email: string) => {
    const kept = await saveSiteEnquiry(
      env,
      { ...readSiteEnquiry(form({ email })), botCheck: 'passed', sentQuickly: false, emailStatus: 'sending' },
      new Date('2022-01-01T09:00:00Z')
    );
    if (!kept.saved) throw new Error('not saved');
    return kept.id;
  };
  const row = async (email: string) => (await stored(email))[0];

  test('is sent through the mail service, and the enquiry says so', async () => {
    const id = await saved('sent@mail.example');
    const sentTo: { url: string; auth: string | null; body: { to: string[]; reply_to: string } }[] = [];
    const mailer = (async (url: string, init: RequestInit) => {
      sentTo.push({ url, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(init.body as string) });
      return Response.json({ id: 'email_1' });
    }) as unknown as typeof fetch;

    await notifySiteEnquiry({
      ...input({ enquiry: readSiteEnquiry(form({ email: 'sent@mail.example' })) }),
      env,
      id,
      mail: { apiKey: 're_test', from: 'hello@setout.test' },
      to: 'new@setout.test',
      send: mailer,
    });
    expect(sentTo).toHaveLength(1);
    expect(sentTo[0].url).toBe('https://api.resend.com/emails');
    expect(sentTo[0].auth).toBe('Bearer re_test');
    expect(sentTo[0].body.to).toEqual(['new@setout.test']);
    expect(sentTo[0].body.reply_to).toBe('sent@mail.example');
    expect(await row('sent@mail.example')).toMatchObject({ email_status: 'sent', email_detail: null });
  });

  test('a refusal is written on the enquiry, which is kept all the same', async () => {
    const id = await saved('failed@mail.example');
    const refusing = (async () => new Response('The domain is not verified.', { status: 403 })) as unknown as typeof fetch;
    await notifySiteEnquiry({
      ...input(),
      env,
      id,
      mail: { apiKey: 're_test', from: 'hello@setout.test' },
      to: 'new@setout.test',
      send: refusing,
    });
    const kept = await row('failed@mail.example');
    expect(kept.email_status).toBe('failed');
    expect(kept.email_detail).toContain('403');
    expect(kept.email_detail).toContain('The domain is not verified.');
  });

  test('with no inbox, no key or no sending address, nothing is sent and the enquiry says so', async () => {
    const never = (async () => {
      throw new Error('nothing should be sent');
    }) as unknown as typeof fetch;
    const settings: { mail: { apiKey: string | undefined; from: string | undefined }; to: string | undefined }[] = [
      { mail: { apiKey: 're_test', from: 'hello@setout.test' }, to: '' },
      { mail: { apiKey: 're_test', from: 'hello@setout.test' }, to: 'not an address' },
      { mail: { apiKey: undefined, from: 'hello@setout.test' }, to: 'new@setout.test' },
      { mail: { apiKey: 're_test', from: '' }, to: 'new@setout.test' },
    ];
    for (const [i, setting] of settings.entries()) {
      const id = await saved(`unset-${i}@mail.example`);
      await notifySiteEnquiry({ ...input(), env, id, ...setting, send: never });
      expect((await row(`unset-${i}@mail.example`)).email_status, String(i)).toBe('not_set_up');
    }
  });
});
