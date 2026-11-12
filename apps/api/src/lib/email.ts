/**
 * The emails sent when a design arrives.
 *
 * Two of them. The company gets everything: who sent it, what they chose, the
 * panel schedule with cut sizes, what the customer measured, anything to check
 * before cutting, and the drawings and photos attached. The customer gets a
 * copy of what they sent.
 *
 * Until the workspace exists, the company's email is the job. So it is built
 * from the server's own answer, never from anything the browser calculated.
 *
 * Everything that reaches an email body came from outside, and all of it is
 * escaped.
 */

import {
  describeOpening,
  describeWidths,
  doorHingeOf,
  hingeMountOf,
  hingeStylesOf,
  METHOD_LABELS,
  openingContext,
  STANDARD_HINGES,
  type ConfiguratorSpec,
  type ConfiguratorState,
  type HingeStyles,
} from '@setout/engine';
import type { BotCheck, EnquiryCustomer, EnquiryFile } from './enquiry';

export interface EmailMessage {
  from: string;
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
  attachments: { filename: string; content: string }[];
}

/** What the designer's settings call each option the customer picked, and its standard hinges. */
export interface OptionLabels {
  finishes?: { id: string; label: string }[];
  handles?: { id: string; label: string }[];
  hinges?: HingeStyles;
}

export interface EnquiryEmailInput {
  companyName: string;
  reference: string;
  customer: EnquiryCustomer;
  design: ConfiguratorState;
  spec: ConfiguratorSpec;
  labels: OptionLabels;
  disclaimer: string;
  files: EnquiryFile[];
  botCheck: BotCheck;
  /** Milliseconds from opening the designer to sending, when it was unusually quick. */
  sentQuicklyMs: number | null;
}

/** Resend will not take more than this in one message, and a refused email helps nobody. */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TD = 'style="padding:8px 10px;border-bottom:1px solid #e2e8f0;"';
const TH =
  'style="padding:8px 10px;border-bottom:2px solid #cbd5e1;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#475569;"';
const WRAP = 'font-family:Arial,sans-serif;margin:0 auto;color:#0f172a;';

const labelOf = (options: { id: string; label: string }[] | undefined, id: string) =>
  options?.find((o) => o.id === id)?.label ?? id;

/**
 * What the customer chose and measured, in words, with units. This lands in a
 * workshop inbox, and a bare "1500" is one careless glance from a mis-cut
 * panel.
 */
export function summarise(design: ConfiguratorState, spec: ConfiguratorSpec, labels: OptionLabels): [string, string][] {
  const ctx = openingContext(design);
  const glassType = design.glassType.charAt(0).toUpperCase() + design.glassType.slice(1).replace('-', ' ');
  return [
    ['Overall run', `${spec.totalRunWidthMm}mm`],
    ['Height', `${spec.heightMm}mm${spec.isFloorToCeiling ? ' (floor to ceiling)' : ''}`],
    ['Panels', String(spec.panels.length)],
    ['Corners', String(spec.cornerCount)],
    ['Fixing', design.mounting === 'channel' ? 'U-channel' : 'Glass clamps'],
    ['Finish', labelOf(labels.finishes, design.finishId)],
    ['Handle', spec.sliding ? 'Through-glass pull, in the Serenity sliding kit' : labelOf(labels.handles, design.handleId)],
    ['Glass', `${design.glassThicknessMm}mm toughened`],
    ['Glass type', glassType],
    ['Coating', design.glassCoating === 'easy-clean' ? 'Easy-clean' : 'None'],
    ['Checked with', design.opening.method ? METHOD_LABELS[design.opening.method] : 'Not stated'],
    ['Walls and floor', describeOpening(design.opening, ctx)],
    ['Opening measured', describeWidths(design.opening, ctx)],
  ];
}

const rows = (pairs: [string, string][]) =>
  pairs
    .map(([label, value]) => `<tr><td ${TD} width="160"><strong>${esc(label)}</strong></td><td ${TD}>${esc(value)}</td></tr>`)
    .join('');

function panelSchedule(spec: ConfiguratorSpec, design: ConfiguratorState, labels: OptionLabels): string {
  const styles = hingeStylesOf(design, labels.hinges ?? STANDARD_HINGES);
  const body = spec.panels
    .map((p, i) => {
      const detail: string[] = [];
      if (p.door) {
        const count = p.door.hingeCount ? `${esc(p.door.hingeCount)} × ` : '';
        const { style } = doorHingeOf(p.door.hingeBrand, hingeMountOf(design, spec, i) ?? 'wall-to-glass', styles);
        detail.push(
          `${count}${esc(p.door.hingeBrand)} hinges${style ? `, ${esc(style.words)}` : ''}, ${esc(p.door.hingeSide)} hand`,
          `opens ${p.door.swing === 'both' ? 'both ways' : 'outwards only'}`,
          esc(p.door.sealType)
        );
        if (p.door.hingeHeightsMm.length) {
          detail.push(`hinge centres ${p.door.hingeHeightsMm.map(esc).join(' / ')}mm from the bottom`);
        }
      }
      // A sliding shower's pane: what it is, and each hole as CRL places it.
      if (p.sliding) {
        if (p.sliding.role === 'door' && spec.sliding) detail.push(`slides on CRL Serenity, closes to the ${esc(spec.sliding.doorCloses)}`);
        for (const h of p.sliding.holes) {
          detail.push(`Ø${esc(h.diameterMm)} ${esc(h.part.replace('-', ' '))} hole ${esc(h.insetMm)}mm in from the ${esc(h.side)} edge, ${esc(h.downMm)}mm down`);
        }
      }
      for (const n of p.notches) detail.push(`notch ${esc(n.corner)} ${esc(n.widthMm)}×${esc(n.heightMm)}mm`);
      // Cutouts carry their own height, so they are listed one to a line: the
      // workshop reads these one at a time.
      const cutouts = p.cutouts
        .map((c) => `<div>${esc(c.description)}: ${esc(c.heightMm)}mm, ${esc(c.edge)}</div>`)
        .join('');
      return `
        <tr>
          <td ${TD}><strong>${esc(p.label)}</strong>${
            detail.length ? `<div style="color:#64748b;font-size:12px;margin-top:4px;">${detail.join(' · ')}</div>` : ''
          }${cutouts ? `<div style="color:#64748b;font-size:12px;margin-top:4px;">${cutouts}</div>` : ''}</td>
          <td ${TD} align="right">${esc(p.tightWidthMm)} × ${esc(p.tightHeightMm)}</td>
          <td ${TD} align="right"><strong>${esc(p.cutWidthMm)} × ${esc(p.cutHeightMm)}</strong></td>
          <td ${TD} align="right">${esc(p.weightKg)}kg</td>
        </tr>`;
    })
    .join('');
  return `
    <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:14px;">
      <thead>
        <tr>
          <th ${TH}>Panel</th>
          <th ${TH} align="right">Measured (mm)</th>
          <th ${TH} align="right">Cut size (mm)</th>
          <th ${TH} align="right">Weight</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

const notice = (colour: 'red' | 'amber', html: string) => {
  const [bg, border, ink] = colour === 'red' ? ['#fef2f2', '#fca5a5', '#991b1b'] : ['#fffbeb', '#fcd34d', '#92400e'];
  return `<div style="margin:0 0 20px;padding:12px 14px;background:${bg};border:1px solid ${border};border-radius:6px;color:${ink};font-size:13px;">${html}</div>`;
};

const list = (items: string[]) =>
  `<ul style="margin:8px 0 0;padding-left:18px;">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

/**
 * The attachments that fit, drawings first. If anything has to be left out
 * for size it should be a photo, never a drawing.
 */
export function attachmentsFor(files: EnquiryFile[], only?: EnquiryFile['kind']): EmailMessage['attachments'] {
  const ordered = [...files].sort((a, b) => Number(b.kind === 'drawing') - Number(a.kind === 'drawing'));
  const out: EmailMessage['attachments'] = [];
  let total = 0;
  for (const file of ordered) {
    if (only && file.kind !== only) continue;
    if (total + file.bytes.length > MAX_ATTACHMENT_BYTES) continue;
    total += file.bytes.length;
    out.push({ filename: file.filename, content: file.base64 });
  }
  return out;
}

/** The email to the company: the whole job. */
export function companyEmail(input: EnquiryEmailInput, from: string, to: string[]): EmailMessage {
  const { customer, spec, reference } = input;
  const attachments = attachmentsFor(input.files);
  const drawings = input.files.filter((f) => f.kind === 'drawing' && attachments.some((a) => a.filename === f.filename));
  const photos = input.files.filter((f) => f.kind === 'photo' && attachments.some((a) => a.filename === f.filename));
  const leftOut = input.files.length - attachments.length;
  const suspicious = input.sentQuicklyMs !== null;

  const html = `
    <div style="${WRAP}max-width:680px;">
      <h2 style="margin:0 0 4px;">New shower design ${esc(reference)}</h2>
      <p style="margin:0 0 20px;color:#64748b;">Sent from your SetOut designer.</p>

      ${
        spec.blockingIssues.length
          ? notice(
              'red',
              `<strong>Cannot be made as drawn.</strong> The customer was told this and sent it anyway, so they are expecting an alternative:${list(spec.blockingIssues)}`
            )
          : ''
      }
      ${
        suspicious
          ? notice(
              'red',
              `<strong>Possibly automated.</strong> The whole design was completed in ${esc(Math.round((input.sentQuicklyMs ?? 0) / 1000))} seconds, faster than a person usually manages. Worth a glance before you reply.`
            )
          : ''
      }
      ${
        input.botCheck === 'not_run'
          ? notice(
              'amber',
              '<strong>Security check did not run.</strong> The check failed to load for this visitor, usually because of an ad blocker. Most likely a real customer, but it was not verified.'
            )
          : ''
      }

      <h3 style="margin:24px 0 8px;">Customer</h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td ${TD} width="160"><strong>Name</strong></td><td ${TD}>${esc(customer.name)}</td></tr>
        <tr><td ${TD}><strong>Email</strong></td><td ${TD}><a href="mailto:${esc(customer.email)}">${esc(customer.email)}</a></td></tr>
        <tr><td ${TD}><strong>Phone</strong></td><td ${TD}>${esc(customer.phone)}</td></tr>
        <tr><td ${TD}><strong>Postcode</strong></td><td ${TD}>${esc(customer.postcode)}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px;">Configuration</h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        ${rows(summarise(input.design, spec, input.labels))}
        ${rows([
          ['Channel required', `${spec.totalChannelLengthMm}mm`],
          ['Total weight', `${spec.totalGlassWeightKg}kg`],
        ])}
      </table>

      <h3 style="margin:24px 0 8px;">Panel schedule</h3>
      ${panelSchedule(spec, input.design, input.labels)}

      ${
        spec.rakeNotes.length
          ? `<h3 style="margin:24px 0 8px;">Out of square</h3><ul style="font-size:14px;color:#334155;">${spec.rakeNotes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`
          : ''
      }
      ${
        spec.warnings.length
          ? `<div style="margin:24px 0;padding:14px 16px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;color:#92400e;font-size:14px;"><strong>Check before cutting</strong>${list(spec.warnings)}</div>`
          : ''
      }
      ${
        customer.notes
          ? `<h3 style="margin:24px 0 8px;">Customer notes</h3><p style="font-size:14px;white-space:pre-wrap;">${esc(customer.notes)}</p>`
          : ''
      }

      <p style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
        The customer confirmed: ${esc(input.disclaimer)}
      </p>
      ${
        attachments.length
          ? `<p style="color:#64748b;font-size:12px;">Drawings: ${drawings.map((f) => esc(f.filename)).join(', ') || 'none'}.${
              photos.length ? ` Customer photos: ${photos.map((f) => esc(f.filename)).join(', ')}.` : ''
            }${leftOut > 0 ? ` ${leftOut} more could not be attached for size and are kept with the job.` : ''}</p>`
          : '<p style="color:#b45309;font-size:12px;">No drawings were attached. Work from the panel schedule above.</p>'
      }
    </div>`;

  return {
    from,
    to,
    reply_to: customer.email,
    subject: `${suspicious ? '[Check] ' : ''}${reference}: shower design from ${customer.name}${
      customer.postcode ? ` (${customer.postcode})` : ''
    }`,
    html,
    attachments,
  };
}

/** The copy to the customer: what they sent, and who has it. */
export function customerEmail(input: EnquiryEmailInput, from: string, replyTo: string | undefined): EmailMessage {
  const first = input.customer.name.split(' ')[0];
  const html = `
    <div style="${WRAP}max-width:600px;">
      <h2>Thanks, ${esc(first)}</h2>
      <p style="font-size:14px;">
        ${esc(input.companyName)} has your design and will be in touch to confirm the sizes.
        Your reference is <strong>${esc(input.reference)}</strong>. Here is what you sent:
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        ${rows(summarise(input.design, input.spec, input.labels))}
      </table>
      ${panelSchedule(input.spec, input.design, input.labels)}
      <p style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
        You confirmed: ${esc(input.disclaimer)}
      </p>
      <p style="font-size:14px;">Questions? Just reply to this email.</p>
    </div>`;
  return {
    from,
    to: [input.customer.email],
    ...(replyTo ? { reply_to: replyTo } : {}),
    subject: `Your shower design ${input.reference}: ${input.companyName}`,
    html,
    // Drawings only. Sending the customer's own photos of their bathroom back
    // to them adds megabytes and tells them nothing.
    attachments: attachmentsFor(input.files, 'drawing'),
  };
}

export class MailError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'MailError';
  }
}

/** Send one message through Resend. Throws a MailError if it is not accepted. */
export async function sendEmail(apiKey: string, message: EmailMessage, send: typeof fetch = fetch): Promise<void> {
  const response = await send('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    // 401 means the key is wrong; 403 usually means the sending domain is not
    // verified. Both are set-up faults worth naming in the job's timeline.
    const detail = (await response.text().catch(() => '')).slice(0, 200);
    throw new MailError(`The mail service answered ${response.status}. ${detail}`.trim(), response.status);
  }
}
