/**
 * Enquiries from SetOut's own site: a shower company asking to start.
 *
 * They belong to the platform, not to a company, so they are kept here beside
 * the platform's other queries and not in the company data layer.
 *
 * The form is public, so how much it can store is capped here, counted in the
 * database as sign-in links are: so many from one address in a day, and so
 * many from everyone.
 */

import { newId } from '../lib/ids';

/** How many enquiries one email address may send in a day. */
export const ENQUIRIES_PER_ADDRESS_A_DAY = 3;
/** How many enquiries the site takes in a day from everyone. */
export const ENQUIRIES_A_DAY = 100;

type Env_ = Pick<Env, 'DB'>;

export type SiteEmailStatus = 'sending' | 'sent' | 'failed' | 'not_set_up';

export interface NewSiteEnquiry {
  company: string;
  name: string;
  email: string;
  phone: string;
  website: string;
  showers: string;
  message: string;
  botCheck: 'passed' | 'not_run' | 'not_configured';
  sentQuickly: boolean;
  emailStatus: SiteEmailStatus;
}

export interface SiteEnquiryRow {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  showers_per_month: string | null;
  message: string | null;
  bot_check: string;
  sent_quickly: number;
  email_status: SiteEmailStatus;
  email_detail: string | null;
  created_at: string;
}

export type Saved = { saved: true; id: string } | { saved: false; reason: 'address_limit' | 'day_limit' };

/**
 * Keep an enquiry, unless its address or the site has sent too many today.
 * The counting and the saving are one statement, so two arriving at the same
 * moment cannot both slip under a limit.
 */
export async function saveSiteEnquiry(env: Env_, enquiry: NewSiteEnquiry, now = new Date()): Promise<Saved> {
  const id = newId('siteEnquiry', now.getTime());
  const at = now.toISOString();
  // The day up to now.
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO site_enquiries
       (id, company_name, contact_name, email, phone, website, showers_per_month, message,
        bot_check, sent_quickly, email_status, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM site_enquiries WHERE email = ? AND created_at > ? AND created_at <= ?) < ?
        AND (SELECT COUNT(*) FROM site_enquiries WHERE created_at > ? AND created_at <= ?) < ?`
  )
    .bind(
      id,
      enquiry.company,
      enquiry.name,
      enquiry.email,
      enquiry.phone || null,
      enquiry.website || null,
      enquiry.showers || null,
      enquiry.message || null,
      enquiry.botCheck,
      enquiry.sentQuickly ? 1 : 0,
      enquiry.emailStatus,
      at,
      enquiry.email,
      dayAgo,
      at,
      ENQUIRIES_PER_ADDRESS_A_DAY,
      dayAgo,
      at,
      ENQUIRIES_A_DAY
    )
    .run();
  if (result.meta.changes > 0) return { saved: true, id };

  const fromAddress = await env.DB.prepare('SELECT COUNT(*) AS n FROM site_enquiries WHERE email = ? AND created_at > ? AND created_at <= ?')
    .bind(enquiry.email, dayAgo, at)
    .first<{ n: number }>();
  return { saved: false, reason: (fromAddress?.n ?? 0) >= ENQUIRIES_PER_ADDRESS_A_DAY ? 'address_limit' : 'day_limit' };
}

/** Write down what happened to the email that tells SetOut about an enquiry. */
export async function recordSiteEnquiryEmail(
  env: Env_,
  id: string,
  status: Exclude<SiteEmailStatus, 'sending'>,
  detail: string | null = null
): Promise<void> {
  await env.DB.prepare('UPDATE site_enquiries SET email_status = ?, email_detail = ? WHERE id = ?')
    .bind(status, detail ? detail.slice(0, 300) : null, id)
    .run();
}

/** The latest enquiries, newest first. For SetOut's own administration. */
export async function latestSiteEnquiries(env: Env_, limit = 50): Promise<SiteEnquiryRow[]> {
  const rows = await env.DB.prepare('SELECT * FROM site_enquiries ORDER BY created_at DESC, id DESC LIMIT ?')
    .bind(Math.min(Math.max(Math.trunc(limit), 1), 200))
    .all<SiteEnquiryRow>();
  return rows.results;
}
