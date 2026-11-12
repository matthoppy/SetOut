/**
 * Telling people a design has arrived.
 *
 * This runs after the customer has had their answer, so a slow or failing
 * mail service never keeps them waiting and never loses their design: the job
 * is already saved. Whatever happens to each email is written on the job's
 * timeline, where the company can see it.
 */

import type { CompanyDb } from '../db/company-db';
import type { DesignerSettings } from '../db/platform';
import { standardHinges } from './designer-config';
import { companyEmail, customerEmail, sendEmail, type EnquiryEmailInput } from './email';

export interface MailSettings {
  /** The mail service's key. */
  apiKey: string | undefined;
  /** The address emails are sent from, such as enquiries@setoutglass.com. */
  from: string | undefined;
}

export const mailIsSetUp = (mail: MailSettings): mail is { apiKey: string; from: string } =>
  Boolean(mail.apiKey) && Boolean(mail.from) && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mail.from ?? '');

/** "Custom Showers <enquiries@setoutglass.com>", with nothing in the name that could break a header. */
export function fromLine(companyName: string, address: string): string {
  const name = companyName.replace(/[<>"\\\r\n,;:]/g, ' ').replace(/\s+/g, ' ').trim();
  return name ? `${name} <${address}>` : address;
}

export interface Notification extends Omit<EnquiryEmailInput, 'labels' | 'disclaimer'> {
  db: CompanyDb;
  mail: MailSettings;
  designerId: string;
  jobId: string;
  /** The wording the customer agreed to, when the designer's own settings have none. */
  defaultDisclaimer: string;
  send?: typeof fetch;
}

/**
 * Email the company and the customer, and record what happened.
 *
 * The company first: theirs is the one that matters. The customer's copy is
 * held back when the design arrived suspiciously fast, because the address
 * may belong to someone who never filled anything in, and mailing them would
 * make us the one sending junk.
 */
export async function notifyEnquiry(n: Notification): Promise<void> {
  if (!mailIsSetUp(n.mail)) return;
  const designer = await n.db.get('designers', n.designerId);
  if (!designer) return;

  const settings = designer.config as DesignerSettings;
  const input: EnquiryEmailInput = {
    companyName: n.companyName,
    reference: n.reference,
    customer: n.customer,
    design: n.design,
    spec: n.spec,
    labels: { finishes: settings.finishes, handles: settings.handles, hinges: standardHinges(settings) },
    disclaimer: settings.measurementDisclaimer || n.defaultDisclaimer,
    files: n.files,
    botCheck: n.botCheck,
    sentQuicklyMs: n.sentQuicklyMs,
  };
  const from = fromLine(n.companyName, n.mail.from);
  const inboxes = designer.notify_emails.filter((e) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e));

  const record = (type: 'email_sent' | 'email_failed' | 'email_not_sent', data: Record<string, unknown>) =>
    n.db.insert('job_events', { job_id: n.jobId, type, actor_kind: 'system', data });

  const deliver = async (to: 'company' | 'customer', build: () => ReturnType<typeof companyEmail>) => {
    try {
      const message = build();
      await sendEmail(n.mail.apiKey as string, message, n.send);
      await record('email_sent', { to, attachments: message.attachments.length });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ message: 'email failed', job: n.jobId, to, reason }));
      await record('email_failed', { to, reason: reason.slice(0, 300) });
    }
  };

  if (inboxes.length === 0) {
    await record('email_not_sent', { to: 'company', reason: 'This designer has no address to send enquiries to.' });
  } else {
    await deliver('company', () => companyEmail(input, from, inboxes));
  }

  if (n.sentQuicklyMs !== null) {
    await record('email_not_sent', { to: 'customer', reason: 'The design arrived too quickly to be sure a person sent it.' });
  } else {
    await deliver('customer', () => customerEmail(input, from, inboxes[0]));
  }
}
