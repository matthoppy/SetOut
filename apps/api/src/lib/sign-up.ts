/**
 * Signing up: whether it is open, what a person must type, and the email
 * that carries their link.
 *
 * Everything typed is checked here before anything is kept, and nothing is
 * made until the link is used.
 */

import { normaliseEmail } from '../db/auth';
import { SIGNUP_LINK_HOURS } from '../db/onboarding';
import { esc, type EmailMessage } from './email';
import { RequestError } from './enquiry';
import { LIMITS } from './settings';

/**
 * Sign-ups are open only where SIGNUPS says so, and anywhere but a
 * developer's own machine only where the bot check is set up too. The form
 * emails whatever address is typed into it, so without the check a script
 * could use it to send SetOut's mail to anyone. Anything else is closed.
 */
export const signUpsAreOpen = (env: Pick<Env, 'SIGNUPS' | 'ENVIRONMENT' | 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY'>): boolean =>
  env.SIGNUPS === 'open' && (env.ENVIRONMENT === 'local' || botCheckIsSetUp(env));

/** The bot check is asked for where both of its keys are set: the one the page shows and the one the server checks with. */
export const botCheckIsSetUp = (env: Pick<Env, 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY'>): boolean =>
  Boolean(env.TURNSTILE_SECRET_KEY) && Boolean(env.TURNSTILE_SITE_KEY);

export interface SignUpForm {
  email: string;
  personName: string;
  companyName: string;
  turnstileToken: string | null;
  /** A hidden field no person fills. */
  honeypot: string;
}

/** Words on one line: invisible formatting goes, and any run of spaces, breaks or control characters becomes one space. */
const oneLine = (value: string) =>
  value
    .replace(/\p{Cf}/gu, '')
    .replace(/[\s\p{Cc}]+/gu, ' ')
    .trim();

const PERSON_NAME = 100;

/** What was typed on the sign-up page, checked. */
export function readSignUp(body: unknown): SignUpForm {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestError(400, 'invalid_request', 'The request must be a JSON object.');
  }
  const b = body as Record<string, unknown>;
  const companyName = typeof b.companyName === 'string' ? oneLine(b.companyName) : '';
  if (!companyName || companyName.length > LIMITS.companyName) {
    throw new RequestError(400, 'invalid_company_name', `Your company needs a name of up to ${LIMITS.companyName} characters.`);
  }
  const personName = typeof b.name === 'string' ? oneLine(b.name) : '';
  if (!personName || personName.length > PERSON_NAME) {
    throw new RequestError(400, 'invalid_name', `Tell us your name, in up to ${PERSON_NAME} characters.`);
  }
  // A name that is a link is not a name, and it would be sent out in an email.
  if (/https?:\/\/|www\./i.test(`${companyName} ${personName}`)) {
    throw new RequestError(400, 'invalid_name', 'A name cannot be a web address.');
  }
  const email = normaliseEmail(b.email);
  if (!email) throw new RequestError(400, 'invalid_email', 'That does not look like an email address.');
  return {
    email,
    personName,
    companyName,
    turnstileToken: typeof b.turnstileToken === 'string' && b.turnstileToken.length > 0 && b.turnstileToken.length <= 4096 ? b.turnstileToken : null,
    honeypot: typeof b.website === 'string' ? b.website : '',
  };
}

const WRAP = 'font-family:Arial,Helvetica,sans-serif;color:#17202a;';

/**
 * The email that carries a sign-up link. It says what the link does and for
 * which company, because the person who typed the address may not be the
 * person who owns it.
 */
export function signUpEmail(from: string, to: string, signUp: { companyName: string; personName: string; link: string }): EmailMessage {
  const html = `
    <div style="${WRAP}max-width:520px;">
      <h2 style="margin:0 0 12px;font-size:20px;">Confirm your email address</h2>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
        Hello ${esc(signUp.personName)}. Tap the button to open ${esc(signUp.companyName)}’s workspace on SetOut.
        Nothing is set up until you do.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${esc(signUp.link)}" style="display:inline-block;background:#17202a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:6px;">Confirm and set up</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b6672;line-height:1.5;">
        The link works once, for ${SIGNUP_LINK_HOURS} hours, on any device.
        If you did not ask for it, you can ignore this email: no account is made without the link.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#5b6672;word-break:break-all;">Or open this address: ${esc(signUp.link)}</p>
    </div>`;
  return {
    from,
    to: [to],
    subject: 'Confirm your email address to set up SetOut',
    html,
    attachments: [],
  };
}

/** The email that tells a company's owners a payment did not go through. */
export function paymentFailedEmail(from: string, to: string[], failed: { companyName: string; link: string }): EmailMessage {
  const html = `
    <div style="${WRAP}max-width:520px;">
      <h2 style="margin:0 0 12px;font-size:20px;">A payment did not go through</h2>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
        The card for ${esc(failed.companyName)}’s SetOut subscription was not charged. It will be tried again over the next few days.
        Nothing has been switched off. If the card has changed, update it on the billing page.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${esc(failed.link)}" style="display:inline-block;background:#17202a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:6px;">Open billing</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#5b6672;word-break:break-all;">Or open this address: ${esc(failed.link)}</p>
    </div>`;
  return {
    from,
    to,
    subject: `A payment for ${failed.companyName.replace(/[\r\n]+/g, ' ')} did not go through`,
    html,
    attachments: [],
  };
}

/**
 * Whether this person is one of SetOut's own staff. The list is a setting on
 * the server, read on every request. It is not in the database, so nothing a
 * company can do, and no fault in a company's routes, can add to it.
 */
export function isPlatformAdmin(env: Pick<Env, 'PLATFORM_ADMINS'>, email: string): boolean {
  const admins = (env.PLATFORM_ADMINS ?? '')
    .split(/[\s,;]+/)
    .map((address) => normaliseEmail(address))
    .filter((address): address is string => address !== null);
  return admins.includes(email.toLowerCase());
}
