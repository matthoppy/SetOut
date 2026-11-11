/**
 * The email that carries a sign-in link.
 *
 * Short, because it is opened on a phone to be tapped: what it is, the
 * button, how long it works, and what to do if it was not asked for.
 */

import { LINK_MINUTES } from '../db/auth';
import { esc, type EmailMessage } from './email';

const WRAP = 'font-family:Arial,Helvetica,sans-serif;color:#17202a;';

export function signInEmail(from: string, to: string, link: string): EmailMessage {
  const html = `
    <div style="${WRAP}max-width:520px;">
      <h2 style="margin:0 0 12px;font-size:20px;">Sign in to SetOut</h2>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">Tap the button to sign in to your workspace.</p>
      <p style="margin:0 0 24px;">
        <a href="${esc(link)}" style="display:inline-block;background:#17202a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:6px;">Sign in</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b6672;line-height:1.5;">
        The link works once, for ${LINK_MINUTES} minutes, on any device.
        If you did not ask for it, you can ignore this email: nobody can sign in without the link.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#5b6672;word-break:break-all;">Or open this address: ${esc(link)}</p>
    </div>`;
  return {
    from,
    to: [to],
    subject: 'Your link to sign in to SetOut',
    html,
    attachments: [],
  };
}
