/**
 * A shower company asks to start using SetOut, from the form on SetOut's own
 * site.
 *
 * Everything arrives from a browser we do not control, so every field is
 * checked for shape and size before anything is kept, in the same way a
 * customer's design is. And everything that reaches the email came from
 * outside, so all of it is escaped.
 */

import { recordSiteEnquiryEmail } from '../db/site-enquiries';
import { esc, sendEmail, type EmailMessage } from './email';
import { EMAIL, isObject, RequestError, text, type BotCheck } from './enquiry';
import { fromLine, mailIsSetUp, type MailSettings } from './notify';

/** The form is a few short fields. Anything bigger is not the form. */
export const MAX_SITE_BODY_BYTES = 20_000;

/** Sent faster than this, an enquiry is flagged: nobody fills the form in in three seconds. */
export const SUSPICIOUS_SITE_ELAPSED_MS = 3_000;

/** Roughly how many showers a month, as the form offers it. */
export const SHOWER_BANDS = {
  'under-5': 'Fewer than 5',
  '5-20': '5 to 20',
  '20-50': '20 to 50',
  'over-50': 'More than 50',
  unsure: 'Not sure',
} as const;

export type ShowerBand = keyof typeof SHOWER_BANDS;

export interface SiteEnquiry {
  company: string;
  name: string;
  email: string;
  phone: string;
  /** A full https or http address, or nothing. */
  website: string;
  showers: ShowerBand | '';
  message: string;
  turnstileToken: string | null;
  honeypot: string;
  elapsedMs: number | null;
}

/**
 * A website as people type it, made into a full address: "acme.example"
 * becomes "https://acme.example/". Empty stays empty. Null if it is not one.
 */
export function websiteAddress(typed: string): string | null {
  if (typed.length === 0) return '';
  const withScheme = /^https?:\/\//i.test(typed) ? typed : `https://${typed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(url.hostname)) return null;
  return url.href;
}

export function readSiteEnquiry(body: unknown): SiteEnquiry {
  if (!isObject(body)) throw new RequestError(400, 'invalid_request', 'The request must be a JSON object.');

  const company = text(body.company, 'Your company', 100, true);
  const name = text(body.name, 'Your name', 100, true);
  const email = text(body.email, 'Your email', 200, true).toLowerCase();
  const phone = text(body.phone, 'Your phone number', 40);
  const typedWebsite = text(body.website, 'Your website', 200);
  const message = text(body.message, 'Your message', 2000);

  if (company.length < 2) throw new RequestError(400, 'invalid_request', 'Your company is needed.');
  if (name.length < 2) throw new RequestError(400, 'invalid_request', 'Your name is needed.');
  if (!EMAIL.test(email)) throw new RequestError(400, 'invalid_request', 'That email address does not look right.');
  const website = websiteAddress(typedWebsite);
  if (website === null) throw new RequestError(400, 'invalid_request', 'That website address does not look right.');

  const showers = body.showers === undefined || body.showers === null ? '' : body.showers;
  if (showers !== '' && !(typeof showers === 'string' && Object.hasOwn(SHOWER_BANDS, showers))) {
    throw new RequestError(400, 'invalid_request', 'Choose how many showers a month from the list.');
  }

  const antispam = isObject(body.antispam) ? body.antispam : {};
  return {
    company,
    name,
    email,
    phone,
    website,
    showers: showers as ShowerBand | '',
    message,
    turnstileToken:
      typeof body.turnstileToken === 'string' && body.turnstileToken.length > 0 && body.turnstileToken.length < 4096
        ? body.turnstileToken
        : null,
    honeypot: typeof antispam.honeypot === 'string' ? antispam.honeypot : '',
    elapsedMs:
      typeof antispam.elapsedMs === 'number' && Number.isFinite(antispam.elapsedMs) ? antispam.elapsedMs : null,
  };
}

// ---------------------------------------------------------------------------
// Telling SetOut
// ---------------------------------------------------------------------------

/** An address an enquiry can be emailed to. */
export const isInbox = (address: string | undefined): address is string =>
  typeof address === 'string' && /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/.test(address);

export interface SiteEnquiryEmailInput {
  enquiry: Pick<SiteEnquiry, 'company' | 'name' | 'email' | 'phone' | 'website' | 'showers' | 'message'>;
  botCheck: BotCheck;
  sentQuickly: boolean;
  /** Which deploy it came from, so a test on staging is never taken for a real one. */
  environment: string;
}

const TD = 'style="padding:8px 10px;border-bottom:1px solid #dcd9d2;vertical-align:top;"';

/** The email that tells SetOut a company has asked to start. Replies go to the person who asked. */
export function siteEnquiryEmail(input: SiteEnquiryEmailInput, from: string, to: string): EmailMessage {
  const { enquiry } = input;
  const rows: [string, string][] = [
    ['Company', enquiry.company],
    ['Name', enquiry.name],
    ['Email', enquiry.email],
    ['Phone', enquiry.phone || 'Not given'],
    ['Website', enquiry.website || 'Not given'],
    ['Showers a month', enquiry.showers ? SHOWER_BANDS[enquiry.showers] : 'Not given'],
  ];
  const flags: string[] = [];
  if (input.botCheck === 'not_run') flags.push('It arrived with no bot check.');
  if (input.botCheck === 'not_configured') flags.push('The bot check is not set up, so it was not checked.');
  if (input.sentQuickly) flags.push('The form was sent faster than a person usually fills it in.');
  if (input.environment !== 'production') flags.push(`It came from the ${input.environment} site, not the real one.`);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#17202a;max-width:620px;">
      <h2 style="margin:0 0 12px;font-size:20px;">${esc(enquiry.company)} would like to start using SetOut</h2>
      <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:14px;">
        ${rows.map(([label, value]) => `<tr><td ${TD} width="150"><strong>${esc(label)}</strong></td><td ${TD}>${esc(value)}</td></tr>`).join('')}
      </table>
      ${
        enquiry.message
          ? `<h3 style="margin:20px 0 6px;font-size:15px;">Their message</h3><p style="margin:0;font-size:14px;line-height:1.5;white-space:pre-wrap;">${esc(enquiry.message)}</p>`
          : ''
      }
      ${
        flags.length
          ? `<p style="margin:20px 0 0;font-size:13px;color:#925a06;line-height:1.5;">${flags.map(esc).join(' ')}</p>`
          : ''
      }
      <p style="margin:20px 0 0;font-size:13px;color:#5b6672;line-height:1.5;">Reply to this email to answer ${esc(enquiry.name)}. Sent from the get-started form on SetOut's site.</p>
    </div>`;
  return {
    from,
    to: [to],
    reply_to: enquiry.email,
    subject: `New SetOut enquiry: ${enquiry.company.replace(/[\r\n]+/g, ' ')}`,
    html,
    attachments: [],
  };
}

export interface SiteNotification extends SiteEnquiryEmailInput {
  env: Pick<Env, 'DB'>;
  id: string;
  mail: MailSettings;
  /** Where enquiries are emailed. Set per environment as SITE_NOTIFY_EMAIL. */
  to: string | undefined;
  send?: typeof fetch;
}

/** Whether an enquiry will be emailed to anyone. */
export const siteMailIsSetUp = (mail: MailSettings, to: string | undefined): boolean => mailIsSetUp(mail) && isInbox(to);

/**
 * Email SetOut, and write on the enquiry what happened. This runs after the
 * person has had their answer: the enquiry is already saved, so a slow or
 * failing mail service loses nothing.
 */
export async function notifySiteEnquiry(n: SiteNotification): Promise<void> {
  if (!mailIsSetUp(n.mail) || !isInbox(n.to)) {
    await recordSiteEnquiryEmail(n.env, n.id, 'not_set_up');
    return;
  }
  try {
    await sendEmail(n.mail.apiKey, siteEnquiryEmail(n, fromLine('SetOut', n.mail.from), n.to), n.send);
    await recordSiteEnquiryEmail(n.env, n.id, 'sent');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ message: 'site enquiry email failed', enquiry: n.id, reason }));
    await recordSiteEnquiryEmail(n.env, n.id, 'failed', reason);
  }
}
