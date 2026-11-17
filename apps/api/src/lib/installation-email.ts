/**
 * The email that sends a customer their installation sheets: who it is from,
 * that the sheets are for whoever fits the shower, and a button to open them.
 * Their reply goes to the company.
 */

import { esc, type EmailMessage } from './email';

const WRAP = 'font-family:Arial,Helvetica,sans-serif;color:#17202a;';
const BUTTON =
  'display:inline-block;background:#17202a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:6px;';
const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ');

export interface InstallationForCustomer {
  company: string;
  reference: string;
  customerName: string;
  /** How many showers the sheets cover. */
  showers: number;
  link: string;
  /** Where a reply goes: the company's own inbox. */
  replyTo: string | null;
}

export function installationEmail(from: string, to: string, i: InstallationForCustomer): EmailMessage {
  const first = i.customerName.split(' ')[0] || 'there';
  const sheets = i.showers > 1 ? `the installation sheets for your ${i.showers} showers` : 'the installation sheet for your shower';
  const html = `
    <div style="${WRAP}max-width:560px;">
      <h2 style="margin:0 0 12px;font-size:20px;">Your installation sheet from ${esc(i.company)}</h2>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">Hello ${esc(first)},</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">
        Here is ${esc(sheets)}, ${esc(i.reference)}. It has every pane's size, where each one stands, the fittings,
        and a step-by-step fitting guide. Please pass it to whoever is fitting your shower, and ask them to read it through before they start.
      </p>
      <p style="margin:20px 0 24px;"><a href="${esc(i.link)}" style="${BUTTON}">Open your installation sheet</a></p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b6672;line-height:1.5;">
        It prints on A4. Any questions, from you or your fitter, just reply to this email.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#5b6672;word-break:break-all;">Or open this address: ${esc(i.link)}</p>
    </div>`;
  return {
    from,
    to: [to],
    subject: oneLine(`Your installation sheet ${i.reference} from ${i.company}`),
    html,
    ...(i.replyTo ? { reply_to: i.replyTo } : {}),
    attachments: [],
  };
}
