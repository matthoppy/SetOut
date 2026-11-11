/**
 * The emails sent when a design arrives: what they say, who they go to, and
 * what is written on the job's timeline about them.
 */
import { buildSpec, DEFAULT_RULESET, designFromTemplate } from '@setout/engine';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { companyDb, type CompanyDb } from '../src/db/company-db';
import { createCompany, newSiteKey } from '../src/db/platform';
import {
  attachmentsFor,
  companyEmail,
  customerEmail,
  MailError,
  sendEmail,
  summarise,
  type EmailMessage,
  type EnquiryEmailInput,
} from '../src/lib/email';
import type { EnquiryFile } from '../src/lib/enquiry';
import { fromLine, mailIsSetUp, notifyEnquiry, type Notification } from '../src/lib/notify';

const context = { rules: DEFAULT_RULESET, companyName: 'Custom Showers' };

const file = (kind: EnquiryFile['kind'], filename: string, size = 10): EnquiryFile => ({
  kind,
  filename,
  contentType: kind === 'drawing' ? 'image/png' : 'image/jpeg',
  bytes: new Uint8Array(size),
  base64: `base64-of-${filename}`,
});

function input(changes: Partial<EnquiryEmailInput> = {}): EnquiryEmailInput {
  const design = changes.design ?? designFromTemplate('alcove-panel-door');
  return {
    companyName: 'Custom Showers',
    reference: 'CS-1001',
    customer: { name: 'Asha Patel', email: 'asha@example.test', phone: '020 7946 0000', postcode: 'SW1A 1AA', notes: '' },
    design,
    spec: buildSpec(design, context),
    labels: { finishes: [{ id: 'chrome', label: 'Polished chrome' }], handles: [{ id: 'pull', label: 'Pull handle' }] },
    disclaimer: 'I have measured this myself.',
    files: [file('photo', 'left-wall.jpg'), file('drawing', 'plan-view.png'), file('drawing', 'elevation-view.png')],
    botCheck: 'passed',
    sentQuicklyMs: null,
    ...changes,
  };
}

const FROM = 'Custom Showers <enquiries@setout.test>';

describe('what the customer chose, in words', () => {
  test('every line has its unit and its proper name', () => {
    const { design, spec, labels } = input();
    expect(Object.fromEntries(summarise(design, spec, labels))).toMatchObject({
      'Overall run': '1100mm',
      Height: '2000mm',
      Panels: '2',
      Corners: '0',
      Fixing: 'U-channel',
      Finish: 'Polished chrome',
      Handle: 'Pull handle',
      Glass: '10mm toughened',
      'Glass type': 'Clear',
      Coating: 'None',
      'Checked with': 'Not stated',
    });
  });

  test('an option the designer no longer lists is shown by its id, not dropped', () => {
    const { design, spec } = input();
    const summary = Object.fromEntries(summarise({ ...design, finishId: 'gun-metal' }, spec, {}));
    expect(summary.Finish).toBe('gun-metal');
  });
});

describe('the email to the company', () => {
  test('is the whole job, from the server’s own sizes', () => {
    const message = companyEmail(input(), FROM, ['sales@cs.example']);
    expect(message.from).toBe(FROM);
    expect(message.to).toEqual(['sales@cs.example']);
    expect(message.reply_to).toBe('asha@example.test');
    expect(message.subject).toBe('CS-1001: shower design from Asha Patel (SW1A 1AA)');
    for (const expected of [
      'New shower design CS-1001',
      'Asha Patel',
      '020 7946 0000',
      '395 × 1980',
      '690 × 1980',
      '2 × Geneva hinges, right hand',
      'hinge centres 250 / 1730mm from the bottom',
      'Hinge notch 58 × 47, r8',
      'Channel required',
      'Polished chrome',
      'The customer confirmed: I have measured this myself.',
      'Drawings: plan-view.png, elevation-view.png.',
      'Customer photos: left-wall.jpg.',
    ]) {
      expect(message.html, expected).toContain(expected);
    }
  });

  test('carries drawings before photos', () => {
    const message = companyEmail(input(), FROM, ['sales@cs.example']);
    expect(message.attachments).toEqual([
      { filename: 'plan-view.png', content: 'base64-of-plan-view.png' },
      { filename: 'elevation-view.png', content: 'base64-of-elevation-view.png' },
      { filename: 'left-wall.jpg', content: 'base64-of-left-wall.jpg' },
    ]);
  });

  test('leaves out what will not fit, never a drawing, and says so', () => {
    const files = [file('photo', 'huge.jpg', 7 * 1024 * 1024), file('photo', 'also-huge.jpg', 7 * 1024 * 1024), file('drawing', 'plan-view.png', 1024)];
    const message = companyEmail(input({ files }), FROM, ['sales@cs.example']);
    expect(message.attachments.map((a) => a.filename)).toEqual(['plan-view.png', 'huge.jpg']);
    expect(message.html).toContain('1 more could not be attached for size and are kept with the job.');
  });

  test('says when there is nothing attached', () => {
    const message = companyEmail(input({ files: [] }), FROM, ['sales@cs.example']);
    expect(message.attachments).toEqual([]);
    expect(message.html).toContain('No drawings were attached.');
  });

  test('says up front when the design cannot be made as drawn', () => {
    const design = designFromTemplate('alcove-door');
    design.panels[0].width_mm = 1100;
    const message = companyEmail(input({ design, spec: buildSpec(design, context) }), FROM, ['sales@cs.example']);
    expect(message.html).toContain('Cannot be made as drawn.');
    expect(message.html).toContain('1000mm is the widest single hinged door we hang');
  });

  test('marks a design that arrived too fast, or unchecked', () => {
    const fast = companyEmail(input({ sentQuicklyMs: 4200 }), FROM, ['sales@cs.example']);
    expect(fast.subject.startsWith('[Check] CS-1001')).toBe(true);
    expect(fast.html).toContain('completed in 4 seconds');
    const unchecked = companyEmail(input({ botCheck: 'not_run' }), FROM, ['sales@cs.example']);
    expect(unchecked.html).toContain('Security check did not run.');
    expect(companyEmail(input(), FROM, ['sales@cs.example']).html).not.toContain('Security check did not run.');
  });

  test('escapes everything a customer typed', () => {
    const hostile = input({
      customer: {
        name: '<script>alert(1)</script>',
        email: 'a"onmouseover="x@example.test',
        phone: '<b>07</b>',
        postcode: "SW1'A",
        notes: '<img src=x onerror=alert(2)>\nSecond line & more',
      },
    });
    for (const message of [companyEmail(hostile, FROM, ['sales@cs.example']), customerEmail(hostile, FROM, 'sales@cs.example')]) {
      expect(message.html).not.toContain('<script>');
      expect(message.html).not.toContain('<img src=x');
      expect(message.html).not.toContain('"onmouseover="');
      expect(message.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    }
    expect(companyEmail(hostile, FROM, ['sales@cs.example']).html).toContain('Second line &amp; more');
  });
});

describe('the copy to the customer', () => {
  test('is what they sent, with their reference and the company to reply to', () => {
    const message = customerEmail(input(), FROM, 'sales@cs.example');
    expect(message.to).toEqual(['asha@example.test']);
    expect(message.reply_to).toBe('sales@cs.example');
    expect(message.subject).toBe('Your shower design CS-1001: Custom Showers');
    expect(message.html).toContain('Thanks, Asha');
    expect(message.html).toContain('Custom Showers has your design');
    expect(message.html).toContain('690 × 1980');
    expect(message.html).toContain('You confirmed: I have measured this myself.');
  });

  test('carries the drawings and none of their own photos', () => {
    const message = customerEmail(input(), FROM, undefined);
    expect(message.attachments.map((a) => a.filename)).toEqual(['plan-view.png', 'elevation-view.png']);
    expect(message.reply_to).toBeUndefined();
    expect(attachmentsFor(input().files, 'photo').map((a) => a.filename)).toEqual(['left-wall.jpg']);
  });
});

describe('sending', () => {
  const message: EmailMessage = { from: FROM, to: ['a@example.test'], subject: 'Hello', html: '<p>Hi</p>', attachments: [] };

  test('goes to the mail service with the key, and nowhere else', async () => {
    let asked: { url: string; auth: string | null; body: unknown } | null = null;
    const spy = (async (url: string, init: RequestInit) => {
      asked = { url, auth: new Headers(init.headers).get('authorization'), body: JSON.parse(init.body as string) };
      return Response.json({ id: 'email_1' });
    }) as unknown as typeof fetch;
    await sendEmail('re_test_key', message, spy);
    expect(asked).toEqual({ url: 'https://api.resend.com/emails', auth: 'Bearer re_test_key', body: message });
  });

  test('a refusal is an error that says why', async () => {
    const refusing = (async () => new Response('{"message":"The domain is not verified"}', { status: 403 })) as unknown as typeof fetch;
    const error = await sendEmail('re_test_key', message, refusing).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailError);
    expect((error as MailError).status).toBe(403);
    expect((error as MailError).message).toContain('The domain is not verified');
  });

  test('the sender’s name cannot break the header it sits in', () => {
    expect(fromLine('Custom Showers', 'enquiries@setout.test')).toBe('Custom Showers <enquiries@setout.test>');
    expect(fromLine('Evil" <a@b.c>\r\nBcc: x@y.z', 'enquiries@setout.test')).toBe('Evil a@b.c Bcc x@y.z <enquiries@setout.test>');
    expect(fromLine('  ', 'enquiries@setout.test')).toBe('enquiries@setout.test');
  });

  test('mail is only set up with both a key and a real address', () => {
    expect(mailIsSetUp({ apiKey: 're_x', from: 'enquiries@setout.test' })).toBe(true);
    expect(mailIsSetUp({ apiKey: undefined, from: 'enquiries@setout.test' })).toBe(false);
    expect(mailIsSetUp({ apiKey: 're_x', from: '' })).toBe(false);
    expect(mailIsSetUp({ apiKey: 're_x', from: 'not an address' })).toBe(false);
    expect(mailIsSetUp({ apiKey: 're_x', from: 'Name <a@b.c>' })).toBe(false);
  });
});

describe('telling people, and writing down what happened', () => {
  let db: CompanyDb;
  let designerId = '';
  let quietDesignerId = '';
  let customerId = '';

  beforeAll(async () => {
    const company = await createCompany(env, { name: 'Custom Showers', referencePrefix: 'CS' });
    db = companyDb(env, company.id);
    designerId = (
      await db.insert('designers', {
        name: 'Website',
        site_key: newSiteKey('test'),
        notify_emails: ['sales@cs.example', 'not an address', 'workshop@cs.example'],
        config: { finishes: [{ id: 'chrome', label: 'Polished chrome', swatch: '#ddd' }], measurementDisclaimer: 'Their own wording.' },
      })
    ).id;
    quietDesignerId = (await db.insert('designers', { name: 'No inbox', site_key: newSiteKey('test') })).id;
    customerId = (await db.insert('customers', { name: 'Asha Patel', email: 'asha@example.test' })).id;
  });

  async function notify(changes: Partial<Notification> = {}, answer: (to: string[]) => Response = () => Response.json({ id: 'ok' })) {
    const job = await db.insert('jobs', { reference: await db.allocateJobReference(), customer_id: customerId });
    const sent: EmailMessage[] = [];
    const send = (async (_url: string, init: RequestInit) => {
      const message = JSON.parse(init.body as string) as EmailMessage;
      sent.push(message);
      return answer(message.to);
    }) as unknown as typeof fetch;
    const { labels: _labels, disclaimer: _disclaimer, ...rest } = input();
    await notifyEnquiry({
      ...rest,
      reference: job.reference,
      db,
      mail: { apiKey: 're_test_key', from: 'enquiries@setout.test' },
      designerId,
      jobId: job.id,
      defaultDisclaimer: 'The default wording.',
      send,
      ...changes,
    });
    const events = await db.find('job_events', { where: { job_id: job.id }, orderBy: { column: 'created_at' } });
    return { sent, events: events.map((e) => [e.type, e.data.to, e.data.reason ?? e.data.attachments]) };
  }

  test('the company first, then the customer, each written on the timeline', async () => {
    const { sent, events } = await notify();
    expect(sent.map((m) => m.to)).toEqual([['sales@cs.example', 'workshop@cs.example'], ['asha@example.test']]);
    expect(sent[0].from).toBe('Custom Showers <enquiries@setout.test>');
    expect(sent[0].reply_to).toBe('asha@example.test');
    expect(sent[1].reply_to).toBe('sales@cs.example');
    expect(sent[0].html).toContain('The customer confirmed: Their own wording.');
    expect(sent[0].html).toContain('Polished chrome');
    expect(events).toEqual([
      ['email_sent', 'company', 3],
      ['email_sent', 'customer', 2],
    ]);
  });

  test('a refused email is recorded with the reason, and the other still goes', async () => {
    const { sent, events } = await notify({}, (to) =>
      to.includes('sales@cs.example') ? new Response('The domain is not verified', { status: 403 }) : Response.json({ id: 'ok' })
    );
    expect(sent).toHaveLength(2);
    expect(events[0][0]).toBe('email_failed');
    expect(events[0][1]).toBe('company');
    expect(String(events[0][2])).toContain('403');
    expect(events[1]).toEqual(['email_sent', 'customer', 2]);
  });

  test('a design that arrived too fast is not copied to the address it gave', async () => {
    const { sent, events } = await notify({ sentQuicklyMs: 3000 });
    expect(sent.map((m) => m.to)).toEqual([['sales@cs.example', 'workshop@cs.example']]);
    expect(sent[0].subject.startsWith('[Check] ')).toBe(true);
    expect(events).toEqual([
      ['email_sent', 'company', 3],
      ['email_not_sent', 'customer', 'The design arrived too quickly to be sure a person sent it.'],
    ]);
  });

  test('a designer with nowhere to send enquiries says so, and the customer still hears', async () => {
    const { sent, events } = await notify({ designerId: quietDesignerId });
    expect(sent.map((m) => m.to)).toEqual([['asha@example.test']]);
    expect(sent[0].reply_to).toBeUndefined();
    expect(sent[0].html).toContain('You confirmed: The default wording.');
    expect(events).toEqual([
      ['email_not_sent', 'company', 'This designer has no address to send enquiries to.'],
      ['email_sent', 'customer', 2],
    ]);
  });

  test('with mail not set up, nothing is sent and nothing is claimed', async () => {
    for (const mail of [{ apiKey: undefined, from: 'enquiries@setout.test' }, { apiKey: 're_test_key', from: '' }]) {
      const { sent, events } = await notify({ mail });
      expect(sent).toEqual([]);
      expect(events).toEqual([]);
    }
  });
});
