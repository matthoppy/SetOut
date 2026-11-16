/**
 * The page a customer confirms their order on.
 *
 * Everything shown comes from the job: the customer's first name and the
 * delivery postcode (never their email or phone), and the shower as the
 * server's own engine worked it out at the revision it stands at. Nothing
 * about the glass is written into the page by hand.
 *
 * The customer sees the sizes they measured, never the cut sizes or the
 * deductions: those stay on the job, for staff. The weight is shown, rounded,
 * because someone has to help lift the glass off the van.
 *
 * The page is plain HTML from the Worker. It works with no script at all: the
 * form posts back to the same address, a mistake comes back with the answers
 * kept and the first problem under the button, and a confirmed order is sent
 * on to the thank-you.
 *
 * Wording and look are Custom Showers' (supply-only, contact by email only,
 * never a phone number). TODO: if a second company sends confirmation links,
 * move the brand below into the company's settings.
 */

import { deliveryWindow, prettyDate, readDeliveryDate, type DeliveryWindow } from './delivery-date';
import { DEFAULT_TERMS, TERMS_CHECKBOX, type TermsOfSale } from './terms-of-sale';
import { METHOD_LABELS, type ConfiguratorSpec, type ConfiguratorState } from '@setout/engine';
import { CUSTOM_SHOWERS_LOGO_PNG } from './confirmation-logo';
import { esc } from './email';

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------

export const CONFIRMATION_BRAND = {
  name: 'Custom Showers',
  legalName: 'Custom Showers Ltd',
  tagline: 'Bespoke frameless shower glass, supplied made to measure across the UK',
  website: 'https://customshowers.uk',
  websiteLabel: 'customshowers.uk',
  email: 'sales@customshowers.uk',
  logo: CUSTOM_SHOWERS_LOGO_PNG,
} as const;

// ---------------------------------------------------------------------------
// What the customer is shown
// ---------------------------------------------------------------------------

export interface OrderDrawing {
  panelWidthMm: number;
  heightMm: number;
  /** The walk-through gap beside the glass, and the whole opening, where measured. */
  gapMm: number | null;
  openingMm: number | null;
  floorChannel: boolean;
  wallChannel: boolean;
}

export interface OrderSummary {
  reference: string;
  firstName: string;
  postcode: string;
  /** The rows of "Your glass", label then value. */
  rows: [string, string][];
  weightKg: number;
  /** "10mm low-iron glass", for the drawing's key. */
  glassWords: string;
  /** "Matte black U-channel (floor and wall)", for the drawing's key, or null without channel. */
  channelWords: string | null;
  /** Only for one fixed panel at a wall, the layout the drawings know how to draw. Measured sizes only. */
  drawing: OrderDrawing | null;
  /** One panel or several, for "Your panel weighs" or "Your glass weighs". */
  panelCount: number;
}

export interface SummaryInput {
  reference: string;
  customerName: string | null;
  postcode: string | null;
  design: ConfiguratorState;
  spec: ConfiguratorSpec;
  /** What the company calls each finish and handle, from its designer's settings. */
  finishes?: { id: string; label: string }[];
  handles?: { id: string; label: string }[];
}

const GLASS_TYPE_WORDS: Record<string, string> = {
  clear: 'clear',
  'low-iron': 'low-iron (extra clear)',
  satin: 'satin (frosted)',
  bronze: 'bronze tint',
  grey: 'grey tint',
};

const labelOf = (options: { id: string; label: string }[] | undefined, id: string) =>
  options?.find((o) => o.id === id)?.label ?? id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** The first word of a name, as the page greets them. Never the whole name. */
export function firstNameOf(name: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first.slice(0, 40);
}

/** Where the channel runs, in the words the page uses (Matt, 16 November 2026). */
export function fixingWords(spec: ConfiguratorSpec): string {
  if (spec.mounting !== 'channel') return 'Glass clamps';
  const cuts = spec.channelCuts;
  // A spec from before engine 0.3.0 gave the channel as one length along the floor.
  const floor = cuts ? cuts.some((c) => c.runs === 'floor') : true;
  const wall = cuts ? cuts.some((c) => c.runs === 'wall') : false;
  if (floor && wall) return 'U-channel on the floor and up the wall';
  if (wall) return 'U-channel up the wall';
  return 'U-channel on the floor';
}

const mm = (n: number) => `${Math.round(n)}`;
/** A weight to the nearest half kilo: about, never exact. */
const approxKg = (kg: number) => Math.max(0.5, Math.round(kg * 2) / 2);

export function summarise(input: SummaryInput): OrderSummary {
  const { design, spec } = input;
  const panels = spec.panels;
  const doors = panels.filter((p) => p.kind === 'door').length;
  const fixed = panels.length - doors;
  const opening = design.opening?.walkInOpeningMm ?? null;
  const isWalkIn = doors === 0 && opening !== null && opening > spec.totalRunWidthMm;
  const gap = isWalkIn ? opening - spec.totalRunWidthMm : null;
  const finish = labelOf(input.finishes, design.finishId);
  const fixing = fixingWords(spec);

  let panelWords: string;
  if (panels.length === 1 && fixed === 1) panelWords = isWalkIn ? '1 fixed walk-in panel (no door)' : '1 fixed panel (no door)';
  else panelWords = [`${panels.length} panels`, fixed ? `${fixed} fixed` : '', doors ? `${doors} door${doors > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');

  const rows: [string, string][] = [
    ['Order', input.reference],
    ['Delivery postcode', input.postcode ?? ''],
    ['Panels', panelWords],
  ];
  // Only what the customer measured. The cut size and the deductions behind it
  // are the workshop's, and never leave the job (Matt, 16 November 2026).
  if (panels.length === 1) {
    rows.push(['Measured size', `${mm(panels[0].tightWidthMm)} × ${mm(panels[0].tightHeightMm)}mm`]);
  } else {
    for (const p of panels) rows.push([`${p.label} measured`, `${mm(p.tightWidthMm)} × ${mm(p.tightHeightMm)}mm`]);
  }
  if (gap !== null && opening !== null) rows.push(['Walk-in gap', `${mm(gap)}mm (${mm(opening)}mm overall opening)`]);
  rows.push(
    ['Glass', `${design.glassThicknessMm}mm toughened, ${GLASS_TYPE_WORDS[design.glassType] ?? design.glassType}`],
    ['Coating', design.glassCoating === 'easy-clean' ? 'Easy-clean' : 'None'],
    ['Fixing', fixing]
  );
  rows.push([spec.mounting === 'channel' ? 'Channel finish' : 'Hardware finish', finish]);
  // A shower with no door has no handle, and the page does not mention one
  // (Matt, 16 November 2026).
  if (doors > 0) rows.push(['Handle', labelOf(input.handles, design.handleId)]);
  rows.push(['Out-of-square check', design.opening?.method ? METHOD_LABELS[design.opening.method] : 'Not checked, glass cut square']);
  // Worked out by the server from the cut glass, and shown only as a rounded
  // weight, so whoever helps unload knows what to expect.
  rows.push(['Approx. weight', `${approxKg(spec.totalGlassWeightKg)}kg`]);

  const channelCuts = spec.channelCuts ?? [];
  const floorChannel = spec.mounting === 'channel' && (spec.channelCuts ? channelCuts.some((c) => c.runs === 'floor') : true);
  const wallChannel = spec.mounting === 'channel' && channelCuts.some((c) => c.runs === 'wall');
  const where = floorChannel && wallChannel ? 'floor and wall' : wallChannel ? 'up the wall' : 'on the floor';
  // The drawings show one fixed pane against one wall: a walk-in screen, or a
  // single fixed panel. TODO: draw other layouts (doors, returns, corners).
  const drawing: OrderDrawing | null =
    panels.length === 1 && fixed === 1 && (design.leftWall || design.rightWall)
      ? { panelWidthMm: panels[0].tightWidthMm, heightMm: panels[0].tightHeightMm, gapMm: gap, openingMm: isWalkIn ? opening : null, floorChannel, wallChannel }
      : null;

  return {
    reference: input.reference,
    firstName: firstNameOf(input.customerName),
    postcode: input.postcode ?? '',
    rows,
    weightKg: approxKg(spec.totalGlassWeightKg),
    glassWords: `${design.glassThicknessMm}mm ${design.glassType === 'clear' ? 'clear' : design.glassType} glass`,
    channelWords: spec.mounting === 'channel' ? `${finish} U-channel (${where})` : null,
    drawing,
    panelCount: panels.length,
  };
}

// ---------------------------------------------------------------------------
// The customer's answers
// ---------------------------------------------------------------------------

/** Where the glass is delivered, as the customer confirmed it in section 3. */
export interface DeliveryAddress {
  line1: string;
  /** Optional: empty when not given. */
  line2: string;
  town: string;
  /** Upper-cased, with one space before the last three characters: "AL3 5QN". */
  postcode: string;
}

/** The silicone colours sold by the tube (Matt, 16 November 2026). */
export const SILICONE_COLOURS = ['clear', 'translucent', 'white'] as const;
export type SiliconeColour = (typeof SILICONE_COLOURS)[number];
export type SiliconeTubes = Record<SiliconeColour, number>;

const COLOUR_WORDS: Record<SiliconeColour, string> = { clear: 'Clear', translucent: 'Translucent', white: 'White' };

/**
 * The optional extras' prices, in pence (Matt, 16 November 2026). Charged on
 * top of the quote at Checkout, one line per colour ordered, and never taken
 * from the browser: the page only says how many.
 */
export const EXTRA_PRICES = { siliconeTubePence: 850, toolPence: 495 } as const;

export interface ConfirmationAnswers {
  order_ref: string;
  details_confirmed: true;
  measurements_accepted: true;
  /** The third box: the terms of sale in section 6, at this version, accepted at this time (the server's). */
  terms_accepted: true;
  terms_version: string;
  terms_accepted_at: string;
  delivery_address: DeliveryAddress;
  /** YYYY-MM-DD, a weekday in the delivery window. We confirm the real date once the glass is ready. */
  preferred_delivery_date: string;
  can_unload: 'yes' | 'no';
  unload_note: string;
  /** How many tubes of each colour, 0 to LIMITS.tubes each. */
  silicone_tubes: SiliconeTubes;
  silicone_tool: 'yes' | 'no';
  signed_name: string;
  comments: string;
  submitted_at: string;
}

export const LIMITS = { unloadNote: 1000, signedName: 120, comments: 2000, addressLine: 120, town: 60, tubes: 10 } as const;

/** One extra the customer chose, as a line to charge. */
export interface ExtraLine {
  key: string;
  description: string;
  quantity: number;
  unitPence: number;
}

/**
 * The extras in a confirmation's answers, one line per silicone colour with
 * at least one tube, then the tool. Answers saved before tubes were counted
 * (a yes or no and one colour) are read as one tube of that colour.
 */
export function extrasOf(answers: Record<string, unknown> | null | undefined): ExtraLine[] {
  if (!answers) return [];
  const lines: ExtraLine[] = [];
  const tubes = tubesOf(answers);
  for (const colour of SILICONE_COLOURS) {
    if (tubes[colour] > 0) {
      lines.push({ key: `silicone:${colour}`, description: `Silicone sealant, ${colour}`, quantity: tubes[colour], unitPence: EXTRA_PRICES.siliconeTubePence });
    }
  }
  if (answers.silicone_tool === 'yes') lines.push({ key: 'silicone-tool', description: 'Silicone finishing tool', quantity: 1, unitPence: EXTRA_PRICES.toolPence });
  return lines;
}

/** The tube counts in saved answers, of either shape. */
export function tubesOf(answers: Record<string, unknown>): SiliconeTubes {
  const tubes: SiliconeTubes = { clear: 0, translucent: 0, white: 0 };
  const saved = answers.silicone_tubes as Record<string, unknown> | undefined;
  if (saved && typeof saved === 'object') {
    for (const colour of SILICONE_COLOURS) {
      const n = Number(saved[colour]);
      tubes[colour] = Number.isInteger(n) && n > 0 && n <= LIMITS.tubes ? n : 0;
    }
  } else if (answers.silicone === 'yes' && SILICONE_COLOURS.includes(answers.silicone_colour as SiliconeColour)) {
    tubes[answers.silicone_colour as SiliconeColour] = 1;
  }
  return tubes;
}

export const extrasPence = (lines: ExtraLine[]) => lines.reduce((sum, l) => sum + l.quantity * l.unitPence, 0);

/** "2 clear, 1 white", or "None". */
export function tubesWords(tubes: SiliconeTubes): string {
  const parts = SILICONE_COLOURS.filter((c) => tubes[c] > 0).map((c) => `${tubes[c]} ${c}`);
  return parts.length ? parts.join(', ') : 'None';
}

/** The address on lines, as it is printed. */
export const addressLines = (a: DeliveryAddress) => [a.line1, a.line2, a.town, a.postcode].filter((l) => l.length > 0);

/** A UK postcode, loosely: outward code, then digit and two letters. */
const POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/;

export function normalisePostcode(raw: string): string | null {
  const m = POSTCODE.exec(raw.trim().toUpperCase().replace(/\s+/g, ' '));
  return m ? `${m[1]} ${m[2]}` : null;
}

/** The form as posted: every value is text or missing. */
export type Posted = Record<string, string | undefined>;

const oneOf = <T extends string>(value: string | undefined, allowed: readonly T[]): T | null =>
  allowed.includes(value as T) ? (value as T) : null;
const text = (value: string | undefined) => (value ?? '').replace(/\r\n?/g, '\n').trim();
const ticked = (value: string | undefined) => value === 'yes' || value === 'on';

/**
 * Check the answers in the order the page asks them, and say the first thing
 * missing in the page's own words.
 */
export function readAnswers(
  reference: string,
  form: Posted,
  terms: { version: string },
  now = new Date(),
  window: DeliveryWindow = deliveryWindow(now)
): { answers: ConfirmationAnswers } | { error: string } {
  const line1 = text(form.addr_line1).replace(/\s+/g, ' ');
  const line2 = text(form.addr_line2).replace(/\s+/g, ' ');
  const town = text(form.addr_town).replace(/\s+/g, ' ');
  const rawPostcode = text(form.addr_postcode);
  if (line1.length < 3 || town.length < 2 || !rawPostcode) return { error: 'Please enter the full delivery address (section 3).' };
  if (line1.length > LIMITS.addressLine || line2.length > LIMITS.addressLine || town.length > LIMITS.town) {
    return { error: `Please keep each line of the delivery address to ${LIMITS.addressLine} characters (section 3).` };
  }
  const postcode = normalisePostcode(rawPostcode);
  if (!postcode) return { error: 'Please check the postcode of the delivery address (section 3).' };
  const date = readDeliveryDate(form.preferred_delivery_date, window);
  if ('error' in date) return date;
  const canUnload = oneOf(form.can_unload, ['yes', 'no'] as const);
  if (!canUnload) return { error: 'Please tell us if someone can help take the glass off the van (section 3).' };
  const tubes: SiliconeTubes = { clear: 0, translucent: 0, white: 0 };
  for (const colour of SILICONE_COLOURS) {
    const raw = text(form[`silicone_${colour}`]);
    const n = raw === '' ? 0 : /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > LIMITS.tubes) {
      return { error: `Please choose between 0 and ${LIMITS.tubes} tubes of each silicone colour (section 4).` };
    }
    tubes[colour] = n;
  }
  const tool = ticked(form.silicone_tool) ? 'yes' : 'no';
  if (!ticked(form.details_confirmed) || !ticked(form.measurements_accepted) || !ticked(form.terms_accepted)) {
    return { error: 'Please tick all three confirmation boxes.' };
  }
  const name = text(form.signed_name).replace(/\s+/g, ' ');
  if (name.length < 2) return { error: 'Please type your full name.' };
  if (name.length > LIMITS.signedName) return { error: `Please keep your name to ${LIMITS.signedName} characters.` };
  const note = text(form.unload_note);
  if (note.length > LIMITS.unloadNote) return { error: `Please keep the delivery note to ${LIMITS.unloadNote} characters (section 3).` };
  const comments = text(form.comments);
  if (comments.length > LIMITS.comments) return { error: `Please keep your comments to ${LIMITS.comments} characters.` };
  return {
    answers: {
      order_ref: reference,
      details_confirmed: true,
      measurements_accepted: true,
      terms_accepted: true,
      terms_version: terms.version,
      terms_accepted_at: now.toISOString(),
      delivery_address: { line1, line2, town, postcode },
      preferred_delivery_date: date.date,
      can_unload: canUnload,
      unload_note: note,
      silicone_tubes: tubes,
      silicone_tool: tool,
      signed_name: name,
      comments,
      submitted_at: now.toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Drawings, from the job's numbers
// ---------------------------------------------------------------------------

const HATCH = (id: string) =>
  `<defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#b6c2d1" stroke-width="2"/></pattern></defs>`;

/** Front view: the wall, the channel along the floor and up the wall, the glass, and the gap. */
export function frontView(d: OrderDrawing): string {
  const W = d.panelWidthMm, H = d.heightMm, G = d.gapMm ?? 0;
  const s = 306 / Math.max(H, 1);
  const x0 = 70, y0 = 30, pw = W * s, ph = H * s, gw = G * s, fy = y0 + ph, ch = 8;
  const vw = x0 + pw + gw + 50, vh = fy + (d.openingMm ? 70 : 42), dx = x0 + pw + gw + 20;
  const top = y0 + ph * 0.011;
  const channels = [
    d.wallChannel ? 'up the wall' : '',
    d.floorChannel ? 'along the floor' : '',
  ].filter(Boolean).join(' and ');
  const label = `Front view: ${mm(W)} by ${mm(H)}mm fixed glass panel${channels ? ` with black U-channel ${channels}` : ''}${G ? ` and ${mm(G)}mm walk-in gap` : ''}.`;
  const r = (n: number) => Math.round(n * 10) / 10;
  return `<svg viewBox="0 0 ${r(vw)} ${r(vh)}" role="img" aria-label="${esc(label)}">
${HATCH('h')}
<rect x="${x0 - 22}" y="${y0 - 14}" width="22" height="${r(ph + 14)}" fill="url(#h)"/><line x1="${x0}" y1="${y0 - 14}" x2="${x0}" y2="${r(fy)}" stroke="#94a3b8" stroke-width="1.5"/>
<text x="${x0 - 11}" y="${r(y0 + ph / 2)}" font-size="9" fill="#64748b" text-anchor="middle" transform="rotate(-90 ${x0 - 11} ${r(y0 + ph / 2)})" font-weight="700" letter-spacing="1.5">WALL</text>
<line x1="${x0 - 22}" y1="${r(fy)}" x2="${r(x0 + pw + gw + 30)}" y2="${r(fy)}" stroke="#94a3b8" stroke-width="1.5"/>
<rect x="${x0 + (d.wallChannel ? ch - 3 : 0)}" y="${r(top)}" width="${r(pw - (d.wallChannel ? ch - 2 : 0))}" height="${r(ph - (top - y0) - (d.floorChannel ? ch - 3 : 0))}" fill="#dcebf3" stroke="#76B0CB" stroke-width="1.5" data-part="glass"/>
<line x1="${r(x0 + pw * 0.35)}" y1="${y0 + 20}" x2="${r(x0 + pw * 0.75)}" y2="${y0 + 60}" stroke="#fff" stroke-width="3" opacity=".8"/>
<line x1="${r(x0 + pw * 0.35)}" y1="${y0 + 34}" x2="${r(x0 + pw * 0.6)}" y2="${y0 + 58}" stroke="#fff" stroke-width="2" opacity=".6"/>
${d.wallChannel ? `<rect x="${x0}" y="${r(top)}" width="${ch}" height="${r(ph - (top - y0))}" fill="#111" rx="1" data-part="wall-channel"/>` : ''}
${d.floorChannel ? `<rect x="${x0}" y="${r(fy - ch)}" width="${r(pw)}" height="${ch}" fill="#111" rx="1" data-part="floor-channel"/>` : ''}
<text x="${r(x0 + pw / 2 + 3)}" y="${r(y0 + ph / 2)}" font-size="10" fill="#1D3B58" text-anchor="middle" font-weight="700">FIXED</text>
${G ? `<text x="${r(x0 + pw + gw / 2)}" y="${r(y0 + ph / 2 - 6)}" font-size="10" fill="#64748b" text-anchor="middle" font-weight="700">WALK-IN</text>
<text x="${r(x0 + pw + gw / 2)}" y="${r(y0 + ph / 2 + 8)}" font-size="10" fill="#64748b" text-anchor="middle" font-weight="700">OPENING</text>
<line x1="${r(x0 + pw + gw)}" y1="${y0 + 10}" x2="${r(x0 + pw + gw)}" y2="${r(fy)}" stroke="#94a3b8" stroke-dasharray="4 3"/>` : ''}
<g stroke="#334155" stroke-width="1" fill="#334155" font-size="10" font-weight="700">
<line x1="${r(dx)}" y1="${y0}" x2="${r(dx)}" y2="${r(fy)}"/><path d="M${r(dx - 4)} ${y0}h8M${r(dx - 4)} ${r(fy)}h8"/>
<text x="${r(dx + 5)}" y="${r(y0 + ph / 2)}" stroke="none" text-anchor="middle" transform="rotate(90 ${r(dx + 5)} ${r(y0 + ph / 2)})">${mm(H)}</text>
<line x1="${x0}" y1="${r(fy + 16)}" x2="${r(x0 + pw)}" y2="${r(fy + 16)}"/><path d="M${x0} ${r(fy + 12)}v8M${r(x0 + pw)} ${r(fy + 12)}v8"/>
<text x="${r(x0 + pw / 2)}" y="${r(fy + 30)}" stroke="none" text-anchor="middle">${mm(W)}</text>
${G ? `<line x1="${r(x0 + pw)}" y1="${r(fy + 16)}" x2="${r(x0 + pw + gw)}" y2="${r(fy + 16)}"/><path d="M${r(x0 + pw + gw)} ${r(fy + 12)}v8"/>
<text x="${r(x0 + pw + gw / 2)}" y="${r(fy + 30)}" stroke="none" text-anchor="middle">${mm(G)}</text>` : ''}
${d.openingMm ? `<line x1="${x0}" y1="${r(fy + 44)}" x2="${r(x0 + pw + gw)}" y2="${r(fy + 44)}"/><path d="M${x0} ${r(fy + 40)}v8M${r(x0 + pw + gw)} ${r(fy + 40)}v8"/>
<text x="${r(x0 + (pw + gw) / 2)}" y="${r(fy + 60)}" stroke="none" text-anchor="middle">${mm(d.openingMm)} overall</text>` : ''}
</g></svg>`;
}

/** Plan view, from above: the wall, the channel at the wall end and under the glass, the panel and the gap. */
export function planView(d: OrderDrawing): string {
  const W = d.panelWidthMm, G = d.gapMm ?? 0;
  const s = 180 / Math.max(W + G, 1);
  const x0 = 34, y = 60, pw = W * s, gw = G * s, vw = x0 + pw + gw + 16, vh = d.openingMm ? 140 : 112;
  const r = (n: number) => Math.round(n * 10) / 10;
  const label = `Plan view: ${mm(W)}mm fixed panel from the wall${d.floorChannel ? ' in black floor channel' : ''}${d.wallChannel ? ', with black U-channel at the wall' : ''}${G ? `, ${mm(G)}mm walk-in gap` : ''}.`;
  return `<svg viewBox="0 0 ${r(vw)} ${vh}" role="img" aria-label="${esc(label)}">
${HATCH('h2')}
<rect x="${x0 - 16}" y="10" width="16" height="${vh - 20}" fill="url(#h2)"/><line x1="${x0}" y1="10" x2="${x0}" y2="${vh - 10}" stroke="#94a3b8" stroke-width="1.5"/>
<text x="${x0 - 8}" y="${vh / 2}" font-size="9" fill="#64748b" text-anchor="middle" transform="rotate(-90 ${x0 - 8} ${vh / 2})" font-weight="700" letter-spacing="1.5">WALL</text>
<text x="${r(x0 + (pw + gw) / 2)}" y="22" font-size="9" fill="#94a3b8" text-anchor="middle" font-weight="700" letter-spacing="1">SHOWER AREA</text>
${d.floorChannel ? `<rect x="${x0 + 3}" y="${y - 5}" width="${r(pw - 3)}" height="10" fill="#111" rx="1" data-part="floor-channel"/>` : ''}
<rect x="${x0 + 4}" y="${y - 2.5}" width="${r(pw - 4)}" height="5" fill="#dcebf3" stroke="#76B0CB" stroke-width="1.2" rx="1" data-part="glass"/>
${d.wallChannel ? `<path d="M${x0} ${y - 7}h12v3h-9v8h9v3h-12z" fill="#111" data-part="wall-channel"/>` : ''}
${G ? `<line x1="${r(x0 + pw + gw)}" y1="${y - 26}" x2="${r(x0 + pw + gw)}" y2="${y + 12}" stroke="#94a3b8" stroke-dasharray="4 3"/>` : ''}
<g stroke="#334155" fill="#334155" font-size="10" font-weight="700">
<line x1="${x0}" y1="${y + 26}" x2="${r(x0 + pw)}" y2="${y + 26}"/><path d="M${x0} ${y + 22}v8M${r(x0 + pw)} ${y + 22}v8"/>
<text x="${r(x0 + pw / 2)}" y="${y + 40}" stroke="none" text-anchor="middle">${mm(W)}</text>
${G ? `<line x1="${r(x0 + pw)}" y1="${y + 26}" x2="${r(x0 + pw + gw)}" y2="${y + 26}"/><path d="M${r(x0 + pw + gw)} ${y + 22}v8"/>
<text x="${r(x0 + pw + gw / 2)}" y="${y + 40}" stroke="none" text-anchor="middle">${mm(G)} walk-in</text>` : ''}
${d.openingMm ? `<line x1="${x0}" y1="${y + 52}" x2="${r(x0 + pw + gw)}" y2="${y + 52}"/><path d="M${x0} ${y + 48}v8M${r(x0 + pw + gw)} ${y + 48}v8"/>
<text x="${r(x0 + (pw + gw) / 2)}" y="${y + 66}" stroke="none" text-anchor="middle">${mm(d.openingMm)} overall</text>` : ''}
</g>
<text x="${r(x0 + pw / 2)}" y="${y - 10}" font-size="9" fill="#1D3B58" text-anchor="middle" font-weight="700">FIXED PANEL</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const CSS = `:root{--navy:#1D3B58;--navy-d:#172E45;--ink:#1D3B58;--sec:#76B0CB;--acc:#A4B2C1;--grey:#5f6b78;--line:#dde4ea;--bg:#F1F5F8;--foot:#2B2B2B;--ok:#15803d;--err:#b91c1c}
*{box-sizing:border-box}
body{margin:0;font-family:"Open Sans",system-ui,-apple-system,Segoe UI,Arial,sans-serif;color:#333;background:var(--bg);line-height:1.5;-webkit-font-smoothing:antialiased;min-height:100vh;display:flex;flex-direction:column}
.page{flex:1}
header{background:#fff;border-bottom:1px solid var(--line)}
.wrap{max-width:720px;margin:0 auto;padding:0 16px}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:68px;gap:12px}
header img{height:40px;width:auto;display:block}
header a.mail{font-size:13px;color:var(--navy);text-decoration:none;font-weight:600}
.hero{background:var(--navy);color:#fff;padding:28px 0 32px;border-bottom:4px solid var(--sec)}
.hero .ref{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.08em;background:rgba(255,255,255,.14);padding:4px 10px;border-radius:999px;text-transform:uppercase}
.hero h1{font-size:26px;line-height:1.2;margin:12px 0 6px;font-weight:800}
.hero p{margin:0;opacity:.85;font-size:15px}
main{padding:20px 0 48px}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,26,61,.04)}
.card h2{font-size:17px;margin:0 0 4px;color:var(--ink);font-weight:800;display:flex;align-items:center;gap:10px}
.card h2 .n{flex:none;width:26px;height:26px;border-radius:50%;background:var(--navy);color:#fff;font-size:13px;display:grid;place-items:center}
.card .sub{margin:0 0 14px;color:var(--grey);font-size:14px}
dl.spec{display:grid;grid-template-columns:1fr;margin:0;border-top:1px solid var(--line)}
dl.spec>div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--line);font-size:15px}
dl.spec dt{color:var(--grey)}
dl.spec dd{margin:0;font-weight:600;color:var(--ink);text-align:right}
.drawings{display:grid;gap:12px;align-items:start}
.drawing{border:1px solid var(--line);border-radius:10px;padding:10px;background:#fbfcfe}
.drawing .lbl{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--grey);margin:0 0 6px}
.drawing svg{width:100%;height:auto;display:block}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:13px;color:var(--grey);margin-top:10px}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:14px;height:14px;border-radius:3px;display:inline-block}
.legend i.glass{background:#dcebf3;border:1.5px solid #76B0CB}
.legend i.channel{background:#111}
.q{margin:0 0 16px;border:0;padding:0;min-width:0}
.q:last-child{margin-bottom:0}
.q.gap{margin-top:14px}
.q>label.t,.q>.t,.q>legend.t{display:block;font-weight:700;color:var(--ink);margin-bottom:8px;font-size:15px;padding:0}
.opt{font-weight:400;color:var(--grey)}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.seg input{position:absolute;opacity:0;pointer-events:none}
.seg label{display:flex;align-items:center;justify-content:center;min-height:48px;border:1.5px solid #cbd5e1;border-radius:10px;font-weight:600;cursor:pointer;background:#fff;text-align:center;padding:6px;font-size:15px;transition:.15s}
.seg input:checked+label{border-color:var(--navy);background:var(--navy);color:#fff}
.seg input:focus-visible+label{outline:3px solid #93c5fd;outline-offset:2px}
.swatch{width:14px;height:14px;border-radius:50%;border:1px solid #94a3b8;margin-right:8px;flex:none}
.swatch.clear{background:linear-gradient(135deg,#fff,#e2e8f0)}.swatch.translucent{background:linear-gradient(135deg,#f8fafc,#cbd5e1);opacity:.7}.swatch.white{background:#fff}
.note{background:#f0f7fd;border:1px solid #cfe6f7;color:#12406b;border-radius:10px;padding:12px 14px;font-size:14px;margin:14px 0 0}
.terms{margin:0;padding-left:18px;color:var(--ink);font-size:14px;line-height:1.5}
.terms li{margin:0 0 8px}
.addr .lbl{display:block;font-size:13px;font-weight:600;color:var(--grey);margin:8px 0 4px}
.silrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #e2e8f0}
.silrow .silname{flex:1;font-weight:600}
.qb{width:40px;height:40px;border:1.5px solid #cbd5e1;border-radius:10px;background:#fff;font:inherit;font-size:20px;font-weight:700;color:var(--navy);cursor:pointer}
.qn{width:56px;height:40px;text-align:center;font:inherit;font-size:16px;border:1.5px solid #cbd5e1;border-radius:10px}
.check.priced{align-items:center}.check.priced .ex{flex:1;display:flex;flex-direction:column}.check.priced .amt{font-weight:700}
input[type=date]{width:100%;font:inherit;font-size:16px;padding:12px;border:1.5px solid #cbd5e1;border-radius:10px;background:#fff;color:#111}
textarea,input[type=text]{width:100%;font:inherit;font-size:16px;padding:12px;border:1.5px solid #cbd5e1;border-radius:10px;background:#fff;color:#111}
textarea{min-height:84px;resize:vertical}
textarea:focus,input[type=text]:focus{outline:none;border-color:var(--navy);box-shadow:0 0 0 3px rgba(29,59,88,.15)}
.price{font-size:13px;color:var(--grey);margin-top:6px}
.check{display:flex;gap:12px;align-items:flex-start;padding:14px;border:1.5px solid #cbd5e1;border-radius:10px;margin-bottom:10px;cursor:pointer;background:#fff;font-size:15px}
.check input{width:22px;height:22px;flex:none;margin:1px 0 0;accent-color:var(--navy)}
.check:has(input:checked){border-color:var(--navy);background:#f5f8fc}
button.submit{width:100%;min-height:54px;border:0;border-radius:12px;background:var(--navy);color:#fff;font:inherit;font-size:17px;font-weight:800;cursor:pointer;margin-top:6px}
button.submit:hover{background:var(--navy-d)}
button.submit:disabled{opacity:.6;cursor:wait}
.pay{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px;border:1.5px dashed var(--acc);border-radius:10px;background:var(--bg)}
.pay .m{font-size:14px;color:var(--grey)}
.pay .m strong{display:block;color:var(--ink);font-size:15px}
button.paybtn{min-height:46px;padding:0 20px;border:0;border-radius:10px;background:var(--acc);color:#fff;font:inherit;font-weight:700;cursor:not-allowed;display:inline-flex;align-items:center;gap:8px}
.badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:#fff;border:1px solid var(--acc);color:var(--grey);padding:2px 8px;border-radius:999px;margin-left:8px;vertical-align:middle}
button.paybtn.on,a.paybtn.on{background:var(--navy);cursor:pointer;text-decoration:none}
button.paybtn.on:hover,a.paybtn.on:hover{background:var(--navy-d)}
button.paybtn.on:disabled{opacity:.7;cursor:wait}
#payform{margin:0}
.err{color:var(--err);font-size:14px;margin:10px 0 0;font-weight:600}
.done{text-align:center;padding:36px 20px}
.done .tick{width:64px;height:64px;border-radius:50%;background:#dcfce7;color:var(--ok);display:grid;place-items:center;margin:0 auto 14px;font-size:34px;font-weight:800}
.done h2{justify-content:center;font-size:22px}
.done .sub{margin:8px auto 0;max-width:420px}
footer{background:var(--foot);color:#cfd6dd;text-align:center;font-size:13px;padding:24px 16px 28px}
footer a{color:#fff}
footer p{margin:4px 0}
@media(min-width:640px){.hero h1{font-size:30px}.card{padding:24px}.drawings{grid-template-columns:1fr 1fr}}`;

function shell(title: string, body: string, nonce: string, script = ''): string {
  const b = CONFIRMATION_BRAND;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} | ${esc(b.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&amp;display=swap" rel="stylesheet">
<style nonce="${nonce}">${CSS}</style>
</head>
<body>
<header><div class="wrap"><a href="${b.website}"><img src="${b.logo}" alt="${esc(b.name)}" height="40"></a><a class="mail" href="mailto:${b.email}">${b.email}</a></div></header>
<div class="page">${body}</div>
<footer><p>${esc(b.legalName)} · ${esc(b.tagline)}</p><p><a href="${b.website}">${b.websiteLabel}</a> · <a href="mailto:${b.email}">${b.email}</a></p></footer>
${script ? `<script nonce="${nonce}">${script}</script>` : ''}
</body>
</html>`;
}

const hero = (s: OrderSummary, line: string, title = 'Please confirm your shower order') => `<section class="hero"><div class="wrap">
<span class="ref">${esc(s.reference)}</span>
<h1>${esc(title)}</h1>
<p>${esc(line)}</p>
</div></section>`;

const radio = (name: string, id: string, value: string, label: string, chosen: string | undefined, extra = '') =>
  `<input type="radio" name="${name}" id="${id}" value="${value}"${chosen === value ? ' checked' : ''}><label for="${id}">${extra}${esc(label)}</label>`;

/** One silicone colour's counter. A number box that works on its own; the buttons need the page's script. */
const tubeRow = (colour: SiliconeColour, value: string | undefined) => {
  const n = /^\d{1,2}$/.test((value ?? '').trim()) ? (value ?? '').trim() : '0';
  const name = COLOUR_WORDS[colour];
  return `<div class="silrow"><span class="swatch ${colour}"></span><label class="silname" for="silicone_${colour}">${name}</label><button type="button" class="qb" data-k="${colour}" data-d="-1" aria-label="Remove a ${colour} tube">−</button><input class="qn" type="number" inputmode="numeric" id="silicone_${colour}" name="silicone_${colour}" min="0" max="${LIMITS.tubes}" step="1" value="${esc(n)}"><button type="button" class="qb" data-k="${colour}" data-d="1" aria-label="Add a ${colour} tube">+</button></div>`;
};

/** "Extras: £17.00", from what the form holds, as the page first shows it. The page's script keeps it up to date. */
function extrasWords(v: Posted): string {
  const tubes = SILICONE_COLOURS.reduce((sum, c) => {
    const n = Number((v[`silicone_${c}`] ?? '0').trim() || '0');
    return sum + (Number.isInteger(n) && n > 0 && n <= LIMITS.tubes ? n : 0);
  }, 0);
  return `Extras: ${pounds(tubes * EXTRA_PRICES.siliconeTubePence + (ticked(v.silicone_tool) ? EXTRA_PRICES.toolPence : 0))}`;
}

/**
 * The note under the drawing, word for word from Matt's reference page
 * (16 November 2026). It names no size or deduction from the job.
 *
 * Held back for now: besides the ±3mm tolerance, the wording says "3mm
 * setting packers", a figure behind the height allowance. Matt is to say
 * whether that may be shown before SHOW_SIZING_NOTE is turned on.
 */
export const SIZING_NOTE = {
  title: 'How we size your glass.',
  text: "Your panel is made slightly smaller than the sizes you measured, so it fits properly. We allow for 3mm setting packers in the floor channel, and leave a little room in the wall channel in case the wall isn't perfectly straight or upright. The channels hide these gaps, so the finished panel fills your measured space. Toughened glass is made to a manufacturing tolerance of about ±3mm, which this allowance also covers.",
} as const;
export const SHOW_SIZING_NOTE = false;

export interface FormState {
  values: Posted;
  error: string | null;
}

/** The form, with whatever the customer had answered and the first problem, if any. */
export function formPage(
  s: OrderSummary,
  action: string,
  state: FormState,
  nonce: string,
  pay: PayView = { kind: 'not_open' },
  terms: Pick<TermsOfSale, 'items'> = { items: [...DEFAULT_TERMS] },
  window: DeliveryWindow = deliveryWindow(),
  sizingNote: boolean = SHOW_SIZING_NOTE
): string {
  const v = state.values;
  const hello = s.firstName
    ? `Hi ${s.firstName}, check the details below, answer a couple of quick questions and press confirm. It takes about two minutes.`
    : 'Check the details below, answer a couple of quick questions and press confirm. It takes about two minutes.';
  const weighs = `${s.panelCount === 1 ? 'Your panel weighs' : 'Your glass weighs'} about ${s.weightKg}kg. It's delivered by one driver, to the ground floor only, so someone at the property needs to help lift it off the van.`;
  const drawings = s.drawing
    ? `<div class="card">
<h2><span class="n">2</span>Drawing</h2>
<p class="sub">How the panel sits in your shower. Measurements in millimetres.</p>
<div class="drawings">
<div class="drawing"><p class="lbl">Front view</p>${frontView(s.drawing)}</div>
<div class="drawing"><p class="lbl">Plan view (from above)</p>${planView(s.drawing)}</div>
</div>
<div class="legend"><span><i class="glass"></i>${esc(s.glassWords)}</span>${s.channelWords ? `<span><i class="channel"></i>${esc(s.channelWords)}</span>` : ''}</div>
${sizingNote ? `<p class="note" id="sizing"><strong>${esc(SIZING_NOTE.title)}</strong> ${esc(SIZING_NOTE.text)}</p>` : ''}
</div>`
    : `<div class="card">
<h2><span class="n">2</span>Drawing</h2>
<p class="sub">Your drawing will be sent with your final quote.</p>
</div>`;
  const body = `${hero(s, hello)}
<main><div class="wrap">
<form id="form" method="post" action="${esc(action)}" novalidate>

<div class="card">
<h2><span class="n">1</span>Your glass</h2>
<p class="sub">Made to measure from the sizes you gave us.</p>
<dl class="spec">${s.rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val)}</dd></div>`).join('')}</dl>
</div>

${drawings}

<div class="card">
<h2><span class="n">3</span>Delivery</h2>
<p class="sub">${esc(weighs)}</p>
<fieldset class="q addr">
<legend class="t">Delivery / site address</legend>
<label class="lbl" for="addr_line1">Address line 1</label>
<input type="text" id="addr_line1" name="addr_line1" autocomplete="address-line1" maxlength="${LIMITS.addressLine}" placeholder="House number and street" value="${esc(v.addr_line1 ?? '')}">
<label class="lbl" for="addr_line2">Address line 2 <span class="opt">(optional)</span></label>
<input type="text" id="addr_line2" name="addr_line2" autocomplete="address-line2" maxlength="${LIMITS.addressLine}" value="${esc(v.addr_line2 ?? '')}">
<label class="lbl" for="addr_town">Town or city</label>
<input type="text" id="addr_town" name="addr_town" autocomplete="address-level2" maxlength="${LIMITS.town}" value="${esc(v.addr_town ?? '')}">
<label class="lbl" for="addr_postcode">Postcode</label>
<input type="text" id="addr_postcode" name="addr_postcode" autocomplete="postal-code" maxlength="10" value="${esc(v.addr_postcode ?? s.postcode)}">
</fieldset>
<div class="q">
<label class="t" for="preferred_delivery_date">Preferred delivery date</label>
<p class="price hint" id="date_hint">Your glass is made to order, so the earliest date is ${esc(prettyDate(window.min))}. Pick a weekday and we'll do our best to match it, and we'll confirm the date once the glass is ready.</p>
<input type="date" id="preferred_delivery_date" name="preferred_delivery_date" min="${window.min}" max="${window.max}" value="${esc(v.preferred_delivery_date ?? '')}" aria-describedby="date_hint">
</div>
<fieldset class="q">
<legend class="t">Will someone be able to help take the glass off the van?</legend>
<div class="seg">${radio('can_unload', 'u_yes', 'yes', 'Yes', v.can_unload)}${radio('can_unload', 'u_no', 'no', 'No', v.can_unload)}</div>
</fieldset>
<div class="q">
<label class="t" for="unload_note">Anything we should know about delivery? <span class="opt">(optional)</span></label>
<textarea id="unload_note" name="unload_note" maxlength="${LIMITS.unloadNote}" placeholder="e.g. parking, access, steps, best days or times">${esc(v.unload_note ?? '')}</textarea>
</div>
</div>

<div class="card">
<h2><span class="n">4</span>Optional extras</h2>
<p class="sub">Add these to your order if you need them. They're added to your total when you pay.</p>
<fieldset class="q">
<legend class="t">Silicone sealant <span class="opt">${esc(pounds(EXTRA_PRICES.siliconeTubePence))} per tube</span></legend>
<p class="price hint">One tube of clear or translucent is enough to seal the glass into the channel. Add a white tube if you'd also like to seal where the channel meets the tiles.</p>
${SILICONE_COLOURS.map((c) => tubeRow(c, v[`silicone_${c}`])).join('')}
</fieldset>
<label class="check priced"><input type="checkbox" name="silicone_tool" value="yes"${ticked(v.silicone_tool) ? ' checked' : ''}><span class="ex"><strong>Silicone finishing tool</strong><span class="price">For a neat, smooth silicone bead.</span></span><span class="amt">${esc(pounds(EXTRA_PRICES.toolPence))}</span></label>
<p class="price" id="extras_total" aria-live="polite">${esc(extrasWords(v))}</p>
</div>

${paymentCard(pay)}

<div class="card" id="terms">
<h2><span class="n">6</span>Terms of sale</h2>
<p class="sub">Please read these before you confirm.</p>
<ul class="terms">${terms.items.map((t) => `<li>${t.title ? `<strong>${esc(t.title)}</strong> ` : ''}${esc(t.text)}</li>`).join('')}</ul>
</div>

<div class="card">
<h2><span class="n">7</span>Confirm</h2>
<p class="sub">Please read and tick all three boxes.</p>
<label class="check"><input type="checkbox" name="details_confirmed" value="yes"${v.details_confirmed ? ' checked' : ''}><span>I've checked the sizes, glass, fixing and drawing above and they're correct.</span></label>
<label class="check"><input type="checkbox" name="measurements_accepted" value="yes"${v.measurements_accepted ? ' checked' : ''}><span>I measured this myself. I understand the glass is toughened and made to these measurements, so it can't be altered afterwards, and if my measurements turn out to be wrong a replacement panel is a new order at my cost.</span></label>
<label class="check"><input type="checkbox" name="terms_accepted" value="yes"${v.terms_accepted ? ' checked' : ''}><span>${esc(TERMS_CHECKBOX)}</span></label>
<div class="q gap">
<label class="t" for="signed_name">Your full name</label>
<input type="text" id="signed_name" name="signed_name" autocomplete="name" maxlength="${LIMITS.signedName}" value="${esc(v.signed_name ?? '')}">
</div>
<div class="q">
<label class="t" for="comments">Comments or questions <span class="opt">(optional)</span></label>
<textarea id="comments" name="comments" maxlength="${LIMITS.comments}">${esc(v.comments ?? '')}</textarea>
</div>
<button class="submit" type="submit" id="btn">Confirm my order</button>
${state.error ? `<p class="err" id="err" role="alert">${esc(state.error)}</p>` : ''}
</div>
</form>
</div></main>`;
  // Only to stop a second press while the first is on its way. The page works without it.
  const script = `document.getElementById('form').addEventListener('submit',function(){var b=document.getElementById('btn');setTimeout(function(){b.disabled=true;b.textContent='Sending\\u2026'},0)});
(function(){var f=document.getElementById('form'),out=document.getElementById('extras_total'),T=${EXTRA_PRICES.siliconeTubePence},K=${EXTRA_PRICES.toolPence},M=${LIMITS.tubes};
function n(c){var x=parseInt(f.elements['silicone_'+c].value,10);return isNaN(x)?0:Math.max(0,Math.min(M,x))}
function sum(){var p=(n('clear')+n('translucent')+n('white'))*T+(f.elements.silicone_tool.checked?K:0);out.textContent='Extras: \\u00a3'+(p/100).toFixed(2)}
f.addEventListener('click',function(e){var b=e.target.closest('.qb');if(!b)return;var c=b.getAttribute('data-k');f.elements['silicone_'+c].value=Math.max(0,Math.min(M,n(c)+Number(b.getAttribute('data-d'))));sum()});
f.addEventListener('input',sum);f.addEventListener('change',sum)})();`;
  return shell(`Confirm your order ${s.reference}`, body, nonce, script);
}

/** What the customer sees once they have confirmed, and every time they open the link after: the thank-you, and paying. */
export function thankYouPage(s: OrderSummary, nonce: string, pay: PayView = { kind: 'not_open' }): string {
  const paid = pay.kind === 'paid';
  const body = `${hero(s, s.firstName ? `Thanks ${s.firstName}, ${paid ? "you're all done." : pay.kind === 'ready' ? 'one last step: payment.' : "there's nothing more to do on this page."}` : paid ? "You're all done." : "There's nothing more to do on this page.", 'Your shower order')}
<main><div class="wrap">
<div class="card done" id="done">
<div class="tick">✓</div>
<h2>Thank you, your details are confirmed</h2>
<p class="sub">We've received your answers for <strong>${esc(s.reference)}</strong>. ${paid ? "We'll email your delivery date to the address you gave us." : "We'll email your final quote and delivery date to the address you gave us."}</p>
</div>
${paymentCard(pay)}
</div></main>`;
  // Only to stop a second press while the first is on its way. The page works without it.
  const script =
    pay.kind === 'ready'
      ? `document.getElementById('payform').addEventListener('submit',function(){var b=document.getElementById('paybtn');setTimeout(function(){b.disabled=true;b.lastChild.textContent='Opening secure payment\\u2026'},0)});`
      : '';
  return shell(`Order ${s.reference} confirmed`, body, nonce, script);
}

// ---------------------------------------------------------------------------
// Paying
// ---------------------------------------------------------------------------

/**
 * Where paying stands, as the customer's page shows it. Worked out by the
 * route from the job's quote, its payments and the deploy's settings.
 */
export type PayView =
  /** Payments are not open for this company yet, or what to charge is still being decided. */
  | { kind: 'not_open' }
  /** No agreed price on the job yet. Nothing is made up. */
  | { kind: 'no_price' }
  /** The order is not confirmed yet: confirm first, then pay. */
  | { kind: 'confirm_first'; amount: PayAmount | null }
  | { kind: 'ready'; action: string; amount: PayAmount; error: string | null }
  /** Back from Stripe, and Stripe's message has not arrived yet. */
  | { kind: 'processing' }
  | { kind: 'invoice'; invoiceUrl: string; failed: boolean }
  | { kind: 'paid'; paidPence: number }
  | { kind: 'failed'; action: string; amount: PayAmount }
  | { kind: 'refunded' };

export interface PayAmount {
  /** The whole order, in pence, paid up front. */
  pence: number;
  /** 'none': this is exactly what is paid, no VAT is charged. Otherwise Stripe Tax's VAT is in it, or added at checkout. */
  vat: 'none' | 'included' | 'added';
}

export const pounds = (pence: number) => `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function amountWords(a: PayAmount, confirmed: boolean): { headline: string; detail: string } {
  const vat = a.vat === 'none' ? 'The full amount for your order' : a.vat === 'included' ? 'Including VAT' : 'Plus VAT, added at checkout';
  // Before confirming, the form is on the page: the address is its section 3,
  // and extras chosen in section 4 are added when paying.
  return confirmed
    ? { headline: `Total: ${pounds(a.pence)}`, detail: `${vat}, with any extras you chose. Delivered kerbside to the address you confirmed.` }
    : { headline: `Total: ${pounds(a.pence)}`, detail: `${vat}, plus any extras you choose in section 4. Delivered kerbside to the address in section 3.` };
}

const LOCK = '<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M3 7V5a4 4 0 0 1 8 0v2h1a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h1zm2 0h4V5a2 2 0 0 0-4 0v2z" fill="currentColor"/></svg>';
const disabledButton = `<button type="button" class="paybtn" disabled aria-disabled="true">${LOCK}Pay securely</button>`;

/** The payment card, in whichever state paying is in. */
export function paymentCard(pay: PayView): string {
  const card = (badge: string, sub: string, inner: string) => `<div class="card" id="payment">
<h2><span class="n">5</span>Payment${badge ? `<span class="badge">${esc(badge)}</span>` : ''}</h2>
<p class="sub">${sub}</p>
${inner}
</div>`;
  const box = (strong: string, line: string, button: string) => `<div class="pay"><div class="m"><strong>${esc(strong)}</strong>${esc(line)}</div>${button}</div>`;
  const payForm = (action: string, label: string) =>
    `<form id="payform" method="post" action="${esc(action)}"><button type="submit" class="paybtn on" id="paybtn">${LOCK}<span>${esc(label)}</span></button></form>`;
  switch (pay.kind) {
    case 'not_open':
      return card('Coming soon', "Once we've sent your final quote, you'll be able to pay for your order here.", box('Total: shown on your quote', "Online payment isn't open yet. We'll email you when it is.", disabledButton));
    case 'no_price':
      return card('', "Your final price isn't ready yet.", box('Total: not set yet', "We'll email your quote, then you can pay here. Nothing is charged until then.", disabledButton));
    case 'confirm_first': {
      const words = pay.amount ? amountWords(pay.amount, false) : { headline: 'Total: shown on your quote', detail: '' };
      return card('', 'Confirm your order below first, then you can pay securely here.', box(words.headline, words.detail || 'Payment opens once you confirm.', disabledButton));
    }
    case 'ready':
    case 'failed': {
      const words = amountWords(pay.amount, true);
      const error = pay.kind === 'ready' ? pay.error : 'Your last payment didn\'t go through. You can try again.';
      return card(
        '',
        'Pay by card or another method on Stripe\'s secure page. We never see your card details.',
        `${box(words.headline, words.detail, payForm(pay.action, 'Pay securely'))}${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}`
      );
    }
    case 'processing':
      return card('', "Thanks, we're confirming your payment with our payment provider.", box('Payment received, confirming', 'This usually takes a few seconds. Refresh the page to check.', ''));
    case 'invoice':
      return card(
        pay.failed ? 'Payment failed' : '',
        pay.failed ? "Your last payment didn't go through. You can try again on the invoice page." : 'Your invoice is ready to pay.',
        box('Invoice', 'View and pay it on our secure invoice page.', `<a class="paybtn on" href="${esc(pay.invoiceUrl)}" rel="noreferrer">${LOCK}<span>View invoice</span></a>`)
      );
    case 'paid':
      return card('Paid', `Thank you, we've received your payment of ${esc(pounds(pay.paidPence))}.`, box('Paid in full', "There's nothing more to pay for this order.", ''));
    case 'refunded':
      return card('', 'This order has been refunded.', box('Refunded', `Questions? Email ${CONFIRMATION_BRAND.email}.`, ''));
  }
}

/** A link that opens nothing. */
export function notFoundPage(nonce: string): string {
  const body = `<main><div class="wrap">
<div class="card done">
<h2>This link could not be found</h2>
<p class="sub">Check the link in your email, or email <a href="mailto:${CONFIRMATION_BRAND.email}">${CONFIRMATION_BRAND.email}</a> and we'll send you a new one.</p>
</div>
</div></main>`;
  return shell('Link not found', body, nonce);
}

/** What the page may load: its own inline style and script, Google Fonts, and its inline logo. */
export const confirmationCsp = (nonce: string) =>
  [
    "default-src 'none'",
    `style-src 'nonce-${nonce}' https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    `script-src 'nonce-${nonce}'`,
    'img-src data:',
    // The pay button posts here and is sent on to Stripe's own page.
    "form-action 'self' https://checkout.stripe.com",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');

// ---------------------------------------------------------------------------
// The workshop's email
// ---------------------------------------------------------------------------

const yesNo = (v: 'yes' | 'no') => (v === 'yes' ? 'Yes' : 'No');

/** Tell the workshop a customer has confirmed, with every answer. */
export function confirmedEmail(from: string, to: string[], input: { reference: string; answers: ConfirmationAnswers; jobLink: string }) {
  const a = input.answers;
  const rows: [string, string][] = [
    ['Order', input.reference],
    ['Signed', a.signed_name],
    ['Terms of sale', `Accepted, version ${a.terms_version}, at ${a.terms_accepted_at}`],
    ['Delivery address', addressLines(a.delivery_address).join('\n')],
    ['Preferred delivery date', `${prettyDate(a.preferred_delivery_date)} (${a.preferred_delivery_date}), to be confirmed once the glass is ready`],
    ['Help unloading the van', yesNo(a.can_unload)],
    ['Delivery note', a.unload_note || '—'],
    ['Silicone tubes', tubesWords(a.silicone_tubes)],
    ['Silicone tool', yesNo(a.silicone_tool)],
    ['Comments', a.comments || '—'],
    ['Confirmed at', a.submitted_at],
  ];
  const TD = 'style="padding:8px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;"';
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
<h2 style="margin:0 0 12px;">${esc(input.reference)} confirmed by the customer</h2>
<p>They ticked all three boxes: the sizes, glass, fixing and drawing are correct, they measured it themselves, and they agree to the terms of sale.</p>
<table style="border-collapse:collapse;width:100%;">${rows.map(([k, v]) => `<tr><td ${TD} width="180"><strong>${esc(k)}</strong></td><td ${TD}>${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table>
<p><a href="${esc(input.jobLink)}">Open the job</a></p>
</div>`;
  return { from, to, subject: `${input.reference}: order confirmed by the customer`, html, attachments: [] };
}
