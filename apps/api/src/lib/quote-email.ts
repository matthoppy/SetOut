/**
 * The emails about a quote: the one that sends it to the customer, and the
 * one that tells the company it was accepted.
 *
 * The customer's says who it is from, what it comes to and until when, with
 * a button to read and accept it. Their reply goes to the company. The
 * company's says who accepted it, for how much, and where the job is.
 */

import { esc, type EmailMessage } from './email';

const WRAP = 'font-family:Arial,Helvetica,sans-serif;color:#17202a;';
const BUTTON =
  'display:inline-block;background:#17202a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:6px;';
const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ');

export function money(pence: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);
}

export function dayOf(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).format(new Date(iso));
}

export interface QuoteForCustomer {
  company: string;
  reference: string;
  number: number;
  customerName: string;
  total: string;
  validUntil: string;
  note: string | null;
  link: string;
  /** Where a reply goes: the company's own inbox. */
  replyTo: string | null;
}

export function quoteEmail(from: string, to: string, q: QuoteForCustomer): EmailMessage {
  const first = q.customerName.split(' ')[0] || 'there';
  const html = `
    <div style="${WRAP}max-width:560px;">
      <h2 style="margin:0 0 12px;font-size:20px;">Your quote from ${esc(q.company)}</h2>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">Hello ${esc(first)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
        Here is our quote for your shower, ${esc(q.reference)}. It comes to <strong>${esc(q.total)}</strong> including VAT,
        and stands until ${esc(q.validUntil)}.
      </p>
      ${q.note ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;white-space:pre-line;">${esc(q.note)}</p>` : ''}
      <p style="margin:20px 0 24px;"><a href="${esc(q.link)}" style="${BUTTON}">Read and accept your quote</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b6672;line-height:1.5;">
        The link is yours alone, so please do not share it. Any questions, just reply to this email.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#5b6672;word-break:break-all;">Or open this address: ${esc(q.link)}</p>
    </div>`;
  return {
    from,
    to: [to],
    subject: oneLine(`Your quote ${q.reference} from ${q.company}`),
    html,
    ...(q.replyTo ? { reply_to: q.replyTo } : {}),
    attachments: [],
  };
}

export interface AcceptedQuote {
  reference: string;
  number: number;
  acceptedName: string;
  customerEmail: string | null;
  total: string;
  jobLink: string;
}

export function quoteAcceptedEmail(from: string, to: string[], q: AcceptedQuote): EmailMessage {
  const html = `
    <div style="${WRAP}max-width:560px;">
      <h2 style="margin:0 0 12px;font-size:20px;">${esc(q.reference)}: quote ${q.number} accepted</h2>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
        ${esc(q.acceptedName)} accepted quote ${q.number} for ${esc(q.reference)}, for <strong>${esc(q.total)}</strong> including VAT.
        The job has moved to Ordered.
      </p>
      <p style="margin:20px 0 0;"><a href="${esc(q.jobLink)}" style="${BUTTON}">Open the job</a></p>
    </div>`;
  return {
    from,
    to,
    subject: oneLine(`${q.reference}: quote ${q.number} accepted by ${q.acceptedName}`),
    html,
    ...(q.customerEmail ? { reply_to: q.customerEmail } : {}),
    attachments: [],
  };
}
