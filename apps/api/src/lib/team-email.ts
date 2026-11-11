/**
 * The email that tells someone they have been put on a company's team.
 *
 * It carries no sign-in link: a link works for minutes, and this may not be
 * opened for days. It says who added them and as what, and opens the sign-in
 * page with their address filled in, where one tap emails them a link.
 * A reply goes to the owner who added them.
 */

import { esc, type EmailMessage } from './email';

const WRAP = 'font-family:Arial,Helvetica,sans-serif;color:#17202a;';

export interface AddedToTeam {
  company: string;
  /** The owner who added them, as they are known: a name, or else an address. */
  by: string;
  byEmail: string;
  role: 'owner' | 'staff';
  /** The workspace's sign-in page, with their address filled in. */
  link: string;
}

export function addedToTeamEmail(from: string, to: string, added: AddedToTeam): EmailMessage {
  const as = added.role === 'owner' ? 'as an owner' : 'as a member of staff';
  const html = `
    <div style="${WRAP}max-width:520px;">
      <h2 style="margin:0 0 12px;font-size:20px;">You are on ${esc(added.company)}’s team</h2>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">
        ${esc(added.by)} has added you to ${esc(added.company)} on SetOut, ${as}.
        SetOut is where ${esc(added.company)}’s shower designs arrive and are worked on.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${esc(added.link)}" style="display:inline-block;background:#17202a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:6px;">Open the workspace</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b6672;line-height:1.5;">
        There is no password. On the sign-in page, ask for a link and it is emailed to this address.
        If you were not expecting this, reply to let ${esc(added.by)} know.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#5b6672;word-break:break-all;">Or open this address: ${esc(added.link)}</p>
    </div>`;
  return {
    from,
    to: [to],
    subject: `You have been added to ${added.company.replace(/[\r\n]+/g, ' ')} on SetOut`,
    html,
    reply_to: added.byEmail,
    attachments: [],
  };
}
