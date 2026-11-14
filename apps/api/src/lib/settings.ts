/**
 * A company's settings, as its owners change them in the workspace: its name,
 * the colours and logo its customers see, how a new quote starts, and, for
 * each designer, the finishes, handles, glass and hinges it offers and who
 * hears about each design.
 *
 * Everything sent is checked here before anything is saved, and a request
 * with one thing wrong changes nothing. What changed is worked out here too,
 * for the audit log.
 *
 * Left out on purpose: the making rules, which change cut sizes.
 */

import { CRL_CODE } from '@setout/engine';
import { normaliseEmail } from '../db/auth';
import type { DesignerSettings } from '../db/platform';
import {
  ADJUSTABLE,
  BELLAGIO_FITS,
  DEFAULT_MAKING_RULES,
  GLASS_COATINGS,
  GLASS_TYPES,
  IN_LINE_HINGES,
  MOUNTINGS,
  resolveRuleset,
  RULE_TEXT,
  ruleValue,
  VIENNA_CUTOUTS,
  WALL_HINGES,
  type AdjustableRule,
  type BellagioFit,
  type Offer,
  type RulesetOverrides,
  type ViennaCutout,
} from '@setout/engine';
import {
  BRANDING_DEFAULTS,
  GLASS_THICKNESSES,
  choicesOf,
  glassOf,
  hingesOf,
  isThickness,
  offeredOptions,
  slidingOf,
  type Choices,
  type Glass,
  type Hinges,
} from './designer-config';
import { RequestError } from './enquiry';

export interface Finish {
  id: string;
  label: string;
  swatch: string;
  /** CRL's code for the finish, such as MBL, where the company has set one. */
  code?: string;
}

export interface Handle {
  id: string;
  label: string;
  description: string;
  /** CRL's number for the handle without its finish, such as BM8X8, where the company has set one. */
  code?: string;
}

export interface Branding {
  primary: string;
  primaryForeground: string;
  logoUrl: string | null;
}

export interface QuoteSettings {
  /** VAT in hundredths of a percent: 2000 is 20%. */
  vatRateBp: number;
  /** How long a quote stands once it is sent. */
  validDays: number;
}

export const LIMITS = {
  /** Finishes, and handles, that one designer may offer. */
  options: 30,
  /** Characters in the name of a finish or handle. */
  label: 60,
  description: 200,
  /** Addresses emailed when a design arrives. */
  notifyEmails: 5,
  /** Websites that may show one designer. */
  websites: 10,
  companyName: 100,
  logoUrl: 500,
} as const;

/** How a new quote starts until the company says otherwise. */
export const QUOTE_DEFAULTS: QuoteSettings = { vatRateBp: 2000, validDays: 30 };

/** The longest id made for a new option, which still leaves room in a price key such as handle:<id>:<id>. */
const MAX_ID = 40;
const COLOUR = /^#[0-9a-f]{6}$/;

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Words on one line: invisible formatting goes, and any run of spaces, breaks or control characters becomes one space. */
const oneLine = (value: string) =>
  value
    .replace(/\p{Cf}/gu, '')
    .replace(/[\s\p{Cc}]+/gu, ' ')
    .trim();

const parsed = (text: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const list = (text: string): unknown[] => {
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// As they stand
// ---------------------------------------------------------------------------

/** The company's colours and logo as its pages use them, from what is stored. */
export function brandingOf(branding: Record<string, unknown>): Branding {
  const hex = (value: unknown, fallback: string) => {
    if (typeof value !== 'string') return fallback;
    const text = value.trim().toLowerCase();
    if (COLOUR.test(text)) return text;
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
    return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : fallback;
  };
  return {
    primary: hex(branding.primary, BRANDING_DEFAULTS.primary),
    primaryForeground: hex(branding.primaryForeground, BRANDING_DEFAULTS.primaryForeground),
    logoUrl: typeof branding.logoUrl === 'string' && branding.logoUrl ? branding.logoUrl : null,
  };
}

/** How a new quote starts, from the company's settings. */
export function quoteSettingsOf(settings: Record<string, unknown>): QuoteSettings {
  return {
    vatRateBp: isWhole(settings.vatRateBp, 0, 10_000) ? settings.vatRateBp : QUOTE_DEFAULTS.vatRateBp,
    validDays: isWhole(settings.quoteValidDays, 1, 365) ? settings.quoteValidDays : QUOTE_DEFAULTS.validDays,
  };
}

export interface CompanyView {
  name: string;
  branding: Branding;
  quotes: QuoteSettings;
}

export function companyView(stored: { name: string; branding: string; settings: string }): CompanyView {
  return { name: stored.name, branding: brandingOf(parsed(stored.branding)), quotes: quoteSettingsOf(parsed(stored.settings)) };
}

export interface DesignerView {
  id: string;
  name: string;
  active: boolean;
  finishes: Finish[];
  handles: Handle[];
  glass: Glass;
  hinges: Hinges;
  /** The fixing methods customers may choose, and the one a new design starts with. */
  fixing: Choices['fixing'];
  /** The glass types customers may choose, and the one a new design starts with. */
  glassTypes: Choices['glassTypes'];
  /** The coatings customers may choose, and the one a new design starts with. */
  coatings: Choices['coatings'];
  /** Whether customers are offered the sliding door layouts. Off until an owner turns it on. */
  sliding: boolean;
  notifyEmails: string[];
  /** The designer's public key, which goes in the embed code. */
  siteKey: string;
  /** The websites that may show the designer, as origins: https://example.co.uk. */
  websites: string[];
}

export function designerView(stored: {
  id: string;
  name: string;
  status: string;
  site_key: string;
  allowed_origins: string;
  config: string;
  notify_emails: string;
}): DesignerView {
  const config = parsed(stored.config) as DesignerSettings;
  const { finishes, handles } = offeredOptions(config);
  return {
    id: stored.id,
    name: stored.name,
    active: stored.status === 'active',
    finishes,
    handles,
    glass: glassOf(config),
    hinges: hingesOf(config),
    ...choicesOf(config),
    sliding: slidingOf(config),
    notifyEmails: list(stored.notify_emails).filter((e): e is string => typeof e === 'string'),
    siteKey: stored.site_key,
    websites: list(stored.allowed_origins).filter((o): o is string => typeof o === 'string'),
  };
}

/**
 * A short fingerprint of a setting as it stands. A change says which one it
 * was made from, so one made from an older copy is refused rather than saved
 * over someone else's.
 */
export async function versionOf(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value) ?? 'null'));
  return [...new Uint8Array(digest).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function companyVersions(company: CompanyView) {
  const [name, branding, quotes] = await Promise.all([versionOf(company.name), versionOf(company.branding), versionOf(company.quotes)]);
  return { name, branding, quotes };
}

export async function designerVersions(designer: DesignerView) {
  const [finishes, handles, glass, hinges, fixing, glassTypes, coatings, sliding, notifyEmails, websites] = await Promise.all([
    versionOf(designer.finishes),
    versionOf(designer.handles),
    versionOf(designer.glass),
    versionOf(designer.hinges),
    versionOf(designer.fixing),
    versionOf(designer.glassTypes),
    versionOf(designer.coatings),
    versionOf(designer.sliding),
    versionOf(designer.notifyEmails),
    versionOf(designer.websites),
  ]);
  return { finishes, handles, glass, hinges, fixing, glassTypes, coatings, sliding, notifyEmails, websites };
}

// ---------------------------------------------------------------------------
// Checking what an owner sends
// ---------------------------------------------------------------------------

export function readCompanyName(input: unknown): string {
  const name = typeof input === 'string' ? oneLine(input) : '';
  if (!name || name.length > LIMITS.companyName) {
    throw new RequestError(400, 'invalid_name', `A company needs a name of up to ${LIMITS.companyName} characters.`);
  }
  return name;
}

function readColour(value: unknown, fallback: string, what: string, example: string): string {
  if (value === undefined) return fallback;
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!COLOUR.test(text)) throw new RequestError(400, 'invalid_branding', `${what} must be written like ${example}.`);
  return text;
}

function urlOf(text: string): URL | null {
  try {
    return new URL(text);
  } catch {
    return null;
  }
}

function readLogoUrl(value: unknown): string | null {
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  const url = typeof value === 'string' ? urlOf(value.trim()) : null;
  if (!url || url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) {
    throw new RequestError(400, 'invalid_branding', 'The logo must be a link to a picture on the web, starting https://.');
  }
  if (url.href.length > LIMITS.logoUrl) {
    throw new RequestError(400, 'invalid_branding', `Keep the link to the logo to ${LIMITS.logoUrl} characters.`);
  }
  return url.href;
}

/** Colours and a logo as an owner sent them. Anything left out stays as it is. */
export function readBranding(input: unknown, current: Branding): Branding {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, 'invalid_branding', 'Send the colours or the logo to change.');
  }
  const b = input as Record<string, unknown>;
  return {
    primary: readColour(b.primary, current.primary, 'The colour of buttons', '#1e293b'),
    primaryForeground: readColour(b.primaryForeground, current.primaryForeground, 'The colour of the words on buttons', '#ffffff'),
    logoUrl: b.logoUrl === undefined ? current.logoUrl : readLogoUrl(b.logoUrl),
  };
}

/** How a new quote starts, as an owner sent it. Anything left out stays as it is. */
export function readQuoteSettings(input: unknown, current: QuoteSettings): QuoteSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, 'invalid_request', 'Send the VAT or how long a quote stands.');
  }
  const q = input as Record<string, unknown>;
  if (q.vatRateBp !== undefined && !isWhole(q.vatRateBp, 0, 10_000)) {
    throw new RequestError(400, 'invalid_vat', 'VAT must be between 0% and 100%, to two decimal places at most.');
  }
  if (q.validDays !== undefined && !isWhole(q.validDays, 1, 365)) {
    throw new RequestError(400, 'invalid_validity', 'A quote stands for between 1 and 365 days.');
  }
  return {
    vatRateBp: (q.vatRateBp as number | undefined) ?? current.vatRateBp,
    validDays: (q.validDays as number | undefined) ?? current.validDays,
  };
}

/** The addresses a designer emails, as an owner sent them: tidied, each once, one to five of them. */
export function readNotifyEmails(input: unknown): string[] {
  if (!Array.isArray(input)) throw new RequestError(400, 'invalid_emails', 'The addresses must be a list.');
  if (input.length > LIMITS.notifyEmails) {
    throw new RequestError(400, 'invalid_emails', `Up to ${LIMITS.notifyEmails} addresses can be emailed.`);
  }
  const emails: string[] = [];
  for (const raw of input) {
    const email = normaliseEmail(raw);
    if (!email) {
      throw new RequestError(
        400,
        'invalid_emails',
        typeof raw === 'string' && raw.trim() ? `“${oneLine(raw).slice(0, 80)}” does not look like an email address.` : 'Each address must be an email address.'
      );
    }
    if (!emails.includes(email)) emails.push(email);
  }
  if (emails.length === 0) {
    throw new RequestError(400, 'invalid_emails', 'Add at least one address, so each new design reaches someone.');
  }
  return emails;
}

/** A website's address as a browser names it: https, a host, and a port only if it has one. */
const WEBSITE = /^https:\/\/[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/;

/**
 * The websites that may show a designer, as an owner sent them. Each is
 * tidied to its origin, so https://www.example.co.uk/showers/ is kept as
 * https://www.example.co.uk. Only https, only a real host name, each once.
 * An empty list is allowed: the designer then shows nowhere.
 */
export function readWebsites(input: unknown): string[] {
  if (!Array.isArray(input)) throw new RequestError(400, 'invalid_websites', 'The websites must be a list.');
  if (input.length > LIMITS.websites) {
    throw new RequestError(400, 'invalid_websites', `A designer can be shown on up to ${LIMITS.websites} websites.`);
  }
  const websites: string[] = [];
  for (const raw of input) {
    const typed = typeof raw === 'string' ? oneLine(raw).slice(0, 300) : '';
    if (!typed) throw new RequestError(400, 'invalid_websites', 'Each website must be an address, such as https://www.example.co.uk.');
    const url = urlOf(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`);
    const origin = url ? `${url.protocol}//${url.host}`.toLowerCase() : '';
    if (!url || url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.') || !WEBSITE.test(origin)) {
      throw new RequestError(
        400,
        'invalid_websites',
        `“${typed.slice(0, 80)}” is not a website the designer can be shown on. It must start https:// and be the site’s own address, such as https://www.example.co.uk.`
      );
    }
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) {
      throw new RequestError(400, 'invalid_websites', 'A website is named by its address, such as https://www.example.co.uk, not by numbers.');
    }
    if (!websites.includes(origin)) websites.push(origin);
  }
  return websites;
}

/** The glass a designer offers, as an owner sent it: thicknesses SetOut makes, and one of them to start new designs at. */
export function readGlass(input: unknown): Glass {
  const made = GLASS_THICKNESSES.map((t) => `${t}mm`).join(', ');
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, 'invalid_glass', 'Send the thicknesses to offer, and the one a new design starts at.');
  }
  const g = input as Record<string, unknown>;
  if (!Array.isArray(g.offered) || !g.offered.every(isThickness)) {
    throw new RequestError(400, 'invalid_glass', `SetOut makes showers in ${made} glass. Offer those only.`);
  }
  const offered = GLASS_THICKNESSES.filter((t) => (g.offered as unknown[]).includes(t));
  if (offered.length === 0) throw new RequestError(400, 'invalid_glass', 'Offer at least one thickness of glass.');
  if (!isThickness(g.standard) || !offered.includes(g.standard)) {
    throw new RequestError(400, 'invalid_glass', 'A new design must start at a thickness you offer.');
  }
  return { offered, standard: g.standard };
}

/**
 * One kind of choice, as an owner sent it: ones SetOut knows, at least one,
 * and the one a new design starts with among them. Kept in SetOut's order.
 */
function readOffer<T extends string>(all: readonly T[], input: unknown, words: { many: string; code: string }): Offer<T> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, words.code, `Send the ${words.many} to offer, and the one a new design starts with.`);
  }
  const c = input as Record<string, unknown>;
  if (!Array.isArray(c.offered) || !c.offered.every((id) => all.includes(id as T))) {
    throw new RequestError(400, words.code, `That is not one of the ${words.many} SetOut knows.`);
  }
  const offered = all.filter((id) => (c.offered as unknown[]).includes(id));
  if (offered.length === 0) throw new RequestError(400, words.code, `Offer at least one of the ${words.many}.`);
  if (!offered.includes(c.standard as T)) throw new RequestError(400, words.code, `A new design must start with one of the ${words.many} you offer.`);
  return { offered, standard: c.standard as T };
}

/** The fixing methods a designer offers, as an owner sent them. */
export const readFixing = (input: unknown) => readOffer(MOUNTINGS, input, { many: 'fixing methods', code: 'invalid_fixing' });
/** The glass types a designer offers, as an owner sent them. */
export const readGlassTypes = (input: unknown) => readOffer(GLASS_TYPES, input, { many: 'glass types', code: 'invalid_glass_types' });
/** The coatings a designer offers, as an owner sent them. */
export const readCoatings = (input: unknown) => readOffer(GLASS_COATINGS, input, { many: 'coatings', code: 'invalid_coatings' });

/** Whether a designer offers sliding doors, as an owner sent it: on or off, nothing else. */
export function readSliding(input: unknown): boolean {
  if (typeof input !== 'boolean') throw new RequestError(400, 'invalid_sliding', 'Sliding doors are on or off.');
  return input;
}

/** One way of hanging's hinges, as an owner sent them: styles SetOut knows, at least one, and the standard among them. */
function readHingeChoice<T extends string>(all: readonly T[], input: unknown, what: string): { offered: T[]; standard: T } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, 'invalid_hinges', `Send the ${what} to offer, and the standard one.`);
  }
  const c = input as Record<string, unknown>;
  if (!Array.isArray(c.offered) || !c.offered.every((h) => all.includes(h as T))) {
    throw new RequestError(400, 'invalid_hinges', `That is not one of CRL's ${what} SetOut knows.`);
  }
  const offered = all.filter((h) => (c.offered as unknown[]).includes(h));
  if (offered.length === 0) throw new RequestError(400, 'invalid_hinges', `Offer at least one of the ${what}.`);
  if (!offered.includes(c.standard as T)) throw new RequestError(400, 'invalid_hinges', `The standard one of the ${what} must be one you offer.`);
  return { offered, standard: c.standard as T };
}

/** The hinges a designer offers, as an owner sent them. Vienna's cut-out stays as it is if left out. */
export function readHinges(input: unknown, current: Hinges): Hinges {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, 'invalid_hinges', 'Send the hinges to offer for a door hung from a wall and one hung in line.');
  }
  const h = input as Record<string, unknown>;
  if (h.viennaCutout !== undefined && !VIENNA_CUTOUTS.includes(h.viennaCutout as ViennaCutout)) {
    throw new RequestError(400, 'invalid_hinges', 'A Vienna hinge is cut with mouse ears or rectangular.');
  }
  if (h.bellagioFit !== undefined && !BELLAGIO_FITS.includes(h.bellagioFit as BellagioFit)) {
    throw new RequestError(400, 'invalid_hinges', 'A Bellagio hinge is fitted with seals or without.');
  }
  return {
    wall: readHingeChoice(WALL_HINGES, h.wall, 'wall hinges'),
    inLine: readHingeChoice(IN_LINE_HINGES, h.inLine, 'in-line hinges'),
    viennaCutout: (h.viennaCutout as ViennaCutout | undefined) ?? current.viennaCutout,
    bellagioFit: (h.bellagioFit as BellagioFit | undefined) ?? current.bellagioFit,
  };
}

type Kind = 'finish' | 'handle';
const WORDS: Record<Kind, { one: string; One: string; many: string; code: string }> = {
  finish: { one: 'finish', One: 'Finish', many: 'finishes', code: 'invalid_finishes' },
  handle: { one: 'handle', One: 'Handle', many: 'handles', code: 'invalid_handles' },
};

/**
 * An id for a new option, made from its name: "Gunmetal grey" gives
 * gunmetal-grey. Lower-case letters, digits and hyphens only, so it fits in
 * a price key, and never one already taken.
 */
export function optionId(label: string, taken: ReadonlySet<string>, kind: Kind): string {
  const base =
    label
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+/, '')
      .slice(0, MAX_ID - 3)
      .replace(/-+$/, '') || kind;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

interface Read {
  id: string | null;
  label: string;
  item: Record<string, unknown>;
}

/**
 * A list of finishes or handles, checked as a whole. An option the designer
 * already offers is named by its id, which it keeps whatever it is now called.
 * An option without an id is new. No other id can be named.
 */
function readList(kind: Kind, input: unknown, offered: readonly { id: string }[]): Read[] {
  const { one, One, many, code } = WORDS[kind];
  if (!Array.isArray(input)) throw new RequestError(400, code, `The ${many} must be a list.`);
  if (input.length === 0) throw new RequestError(400, code, `Offer at least one ${one}, so your customers have one to choose.`);
  if (input.length > LIMITS.options) throw new RequestError(400, code, `A designer can offer up to ${LIMITS.options} ${many}.`);
  const known = new Set(offered.map((o) => o.id));
  const ids = new Set<string>();
  const names = new Set<string>();
  return input.map((raw: unknown, i) => {
    const n = i + 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RequestError(400, code, `${One} ${n} is not a ${one}.`);
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === 'string' ? oneLine(item.label) : '';
    if (!label || label.length > LIMITS.label) {
      throw new RequestError(400, code, `Give ${one} ${n} a name of up to ${LIMITS.label} characters.`);
    }
    const folded = label.toLocaleLowerCase('en-GB');
    if (names.has(folded)) throw new RequestError(400, code, `Two ${many} are called “${label}”. Give each its own name.`);
    names.add(folded);
    if (item.id === undefined || item.id === null) return { id: null, label, item };
    if (typeof item.id !== 'string' || !known.has(item.id)) {
      throw new RequestError(400, code, `${One} ${n} is not one this designer offers. Open the settings again to see the latest.`);
    }
    if (ids.has(item.id)) throw new RequestError(400, code, `“${label}” is in the list twice.`);
    ids.add(item.id);
    return { id: item.id, label, item };
  });
}

/** New options get their ids last, so none can take an id an existing one keeps. */
function withIds<T extends { id: string | null }>(kind: Kind, options: (T & { label: string })[]): (T & { id: string; label: string })[] {
  const taken = new Set(options.flatMap((o) => (o.id ? [o.id] : [])));
  return options.map((o) => {
    if (o.id) return o as T & { id: string; label: string };
    const id = optionId(o.label, taken, kind);
    taken.add(id);
    return { ...o, id };
  });
}

/** A CRL code as an owner typed it: capitals and digits, spaces taken out, or none at all. */
function readCode(kind: Kind, item: Record<string, unknown>, label: string): string | undefined {
  if (item.code === undefined || item.code === null) return undefined;
  const example = kind === 'finish' ? 'MBL' : 'BM8X8';
  if (typeof item.code !== 'string') throw new RequestError(400, WORDS[kind].code, `The CRL code of “${label}” must be written like ${example}.`);
  const code = item.code.replace(/\s+/g, '').toUpperCase();
  if (!code) return undefined;
  if (!CRL_CODE.test(code)) {
    throw new RequestError(400, WORDS[kind].code, `The CRL code of “${label}” can only be letters and numbers, up to 12 of them, such as ${example}.`);
  }
  return code;
}

const withCode = (code: string | undefined) => (code ? { code } : {});

export function readFinishes(input: unknown, offered: readonly Finish[]): Finish[] {
  const read = readList('finish', input, offered).map(({ id, label, item }) => {
    const swatch = typeof item.swatch === 'string' ? item.swatch.trim().toLowerCase() : '';
    if (!COLOUR.test(swatch)) throw new RequestError(400, 'invalid_finishes', `The colour of “${label}” must be written like #d4d8db.`);
    return { id, label, swatch, code: readCode('finish', item, label) };
  });
  return withIds('finish', read).map(({ id, label, swatch, code }) => ({ id, label, swatch, ...withCode(code) }));
}

export function readHandles(input: unknown, offered: readonly Handle[]): Handle[] {
  const read = readList('handle', input, offered).map(({ id, label, item }) => {
    if (item.description !== undefined && item.description !== null && typeof item.description !== 'string') {
      throw new RequestError(400, 'invalid_handles', `The description of “${label}” must be words.`);
    }
    const description = typeof item.description === 'string' ? oneLine(item.description) : '';
    if (description.length > LIMITS.description) {
      throw new RequestError(400, 'invalid_handles', `Keep the description of “${label}” to ${LIMITS.description} characters.`);
    }
    return { id, label, description, code: readCode('handle', item, label) };
  });
  return withIds('handle', read).map(({ id, label, description, code }) => ({ id, label, description, ...withCode(code) }));
}

// ---------------------------------------------------------------------------
// What changed, for the audit log
// ---------------------------------------------------------------------------

/** One thing an owner changed. Kept in the audit log, so it never holds a secret. */
export type SettingsChange =
  | { field: 'name'; from: string; to: string }
  | { field: 'primary' | 'primaryForeground'; from: string; to: string }
  | { field: 'logoUrl'; from: string | null; to: string | null }
  | { field: 'vatRateBp' | 'quoteValidDays'; from: number; to: number }
  | {
      field: Kind;
      change: 'added' | 'removed' | 'renamed' | 'recoloured' | 'described' | 'coded';
      id: string;
      label: string;
      from?: string;
      to?: string;
    }
  | { field: Kind; change: 'reordered' }
  | { field: 'websites'; added: string[]; removed: string[] }
  | { field: 'glassOffered'; from: number[]; to: number[] }
  | { field: 'glassStandard'; from: number; to: number }
  | { field: 'wallHingesOffered' | 'inLineHingesOffered'; from: string[]; to: string[] }
  | { field: 'wallHingeStandard' | 'inLineHingeStandard'; from: string; to: string }
  | { field: 'viennaCutout' | 'bellagioFit'; from: string; to: string }
  | { field: 'slidingDoors'; from: boolean; to: boolean }
  | { field: 'fixingOffered' | 'glassTypesOffered' | 'coatingsOffered'; from: string[]; to: string[] }
  | { field: 'fixingStandard' | 'glassTypeStandard' | 'coatingStandard'; from: string; to: string }
  | { field: 'notifyEmails'; added: string[]; removed: string[] }
  | { field: 'rule'; rule: string; from: number; to: number };

type Option = { id: string; label: string; swatch?: string; description?: string; code?: string };

export function optionChanges(kind: Kind, before: readonly Option[], after: readonly Option[]): SettingsChange[] {
  const changes: SettingsChange[] = [];
  const was = new Map(before.map((o) => [o.id, o]));
  const now = new Map(after.map((o) => [o.id, o]));
  for (const option of after) {
    const old = was.get(option.id);
    if (!old) {
      changes.push({ field: kind, change: 'added', id: option.id, label: option.label });
      continue;
    }
    if (old.label !== option.label) changes.push({ field: kind, change: 'renamed', id: option.id, label: option.label, from: old.label, to: option.label });
    if (kind === 'finish' && old.swatch !== option.swatch) {
      changes.push({ field: kind, change: 'recoloured', id: option.id, label: option.label, from: old.swatch, to: option.swatch });
    }
    if (kind === 'handle' && (old.description ?? '') !== (option.description ?? '')) {
      changes.push({ field: kind, change: 'described', id: option.id, label: option.label, from: old.description, to: option.description });
    }
    if ((old.code ?? '') !== (option.code ?? '')) {
      changes.push({ field: kind, change: 'coded', id: option.id, label: option.label, from: old.code, to: option.code });
    }
  }
  for (const option of before) {
    if (!now.has(option.id)) changes.push({ field: kind, change: 'removed', id: option.id, label: option.label });
  }
  const order = (options: readonly Option[], kept: Map<string, Option>) => options.filter((o) => kept.has(o.id)).map((o) => o.id).join('\n');
  if (order(before, now) !== order(after, was)) changes.push({ field: kind, change: 'reordered' });
  return changes;
}

export function glassChanges(before: Glass, after: Glass): SettingsChange[] {
  const changes: SettingsChange[] = [];
  if (before.offered.join() !== after.offered.join()) changes.push({ field: 'glassOffered', from: before.offered, to: after.offered });
  if (before.standard !== after.standard) changes.push({ field: 'glassStandard', from: before.standard, to: after.standard });
  return changes;
}

export function hingeChanges(before: Hinges, after: Hinges): SettingsChange[] {
  const changes: SettingsChange[] = [];
  for (const way of ['wall', 'inLine'] as const) {
    const [b, a] = [before[way], after[way]];
    if (b.offered.join() !== a.offered.join()) changes.push({ field: `${way}HingesOffered`, from: b.offered, to: a.offered });
    if (b.standard !== a.standard) changes.push({ field: `${way}HingeStandard`, from: b.standard, to: a.standard });
  }
  if (before.viennaCutout !== after.viennaCutout) changes.push({ field: 'viennaCutout', from: before.viennaCutout, to: after.viennaCutout });
  if (before.bellagioFit !== after.bellagioFit) changes.push({ field: 'bellagioFit', from: before.bellagioFit, to: after.bellagioFit });
  return changes;
}

/** The fields a change to the fixing methods, glass types or coatings is recorded under. */
const CHOICE_FIELDS = {
  fixing: { offered: 'fixingOffered', standard: 'fixingStandard' },
  glassTypes: { offered: 'glassTypesOffered', standard: 'glassTypeStandard' },
  coatings: { offered: 'coatingsOffered', standard: 'coatingStandard' },
} as const;

export function choiceChanges(kind: keyof Choices, before: Offer<string>, after: Offer<string>): SettingsChange[] {
  const fields = CHOICE_FIELDS[kind];
  const changes: SettingsChange[] = [];
  if (before.offered.join() !== after.offered.join()) changes.push({ field: fields.offered, from: before.offered, to: after.offered });
  if (before.standard !== after.standard) changes.push({ field: fields.standard, from: before.standard, to: after.standard });
  return changes;
}

export function slidingChanges(before: boolean, after: boolean): SettingsChange[] {
  return before === after ? [] : [{ field: 'slidingDoors', from: before, to: after }];
}

export function emailChanges(before: readonly string[], after: readonly string[]): SettingsChange[] {
  const added = after.filter((e) => !before.includes(e));
  const removed = before.filter((e) => !after.includes(e));
  return added.length || removed.length ? [{ field: 'notifyEmails', added, removed }] : [];
}

export function websiteChanges(before: readonly string[], after: readonly string[]): SettingsChange[] {
  const added = after.filter((w) => !before.includes(w));
  const removed = before.filter((w) => !after.includes(w));
  return added.length || removed.length ? [{ field: 'websites', added, removed }] : [];
}

export function companyChanges(before: CompanyView, after: CompanyView): SettingsChange[] {
  const changes: SettingsChange[] = [];
  if (before.name !== after.name) changes.push({ field: 'name', from: before.name, to: after.name });
  for (const field of ['primary', 'primaryForeground'] as const) {
    if (before.branding[field] !== after.branding[field]) changes.push({ field, from: before.branding[field], to: after.branding[field] });
  }
  if (before.branding.logoUrl !== after.branding.logoUrl) changes.push({ field: 'logoUrl', from: before.branding.logoUrl, to: after.branding.logoUrl });
  if (before.quotes.vatRateBp !== after.quotes.vatRateBp) changes.push({ field: 'vatRateBp', from: before.quotes.vatRateBp, to: after.quotes.vatRateBp });
  if (before.quotes.validDays !== after.quotes.validDays) changes.push({ field: 'quoteValidDays', from: before.quotes.validDays, to: after.quotes.validDays });
  return changes;
}

// ---------------------------------------------------------------------------
// As they are stored
// ---------------------------------------------------------------------------

/**
 * The branding column with only what changed written into it. Anything else
 * it holds is kept, and a colour still at SetOut's default stays unwritten.
 */
export function storedBranding(text: string, before: Branding, after: Branding): string {
  const stored = parsed(text);
  if (before.primary !== after.primary) stored.primary = after.primary;
  if (before.primaryForeground !== after.primaryForeground) stored.primaryForeground = after.primaryForeground;
  if (before.logoUrl !== after.logoUrl) {
    if (after.logoUrl) stored.logoUrl = after.logoUrl;
    else delete stored.logoUrl;
  }
  return JSON.stringify(stored);
}

/** The settings column with how a new quote starts written into it, and anything else it holds kept. */
export function storedSettings(text: string, before: QuoteSettings, after: QuoteSettings): string {
  const stored = parsed(text);
  if (before.vatRateBp !== after.vatRateBp) stored.vatRateBp = after.vatRateBp;
  if (before.validDays !== after.validDays) stored.quoteValidDays = after.validDays;
  return JSON.stringify(stored);
}

/** The designer's config with new lists of finishes or handles, or new glass, and everything else it holds kept. */
export function storedConfig(
  text: string,
  changes: { finishes?: Finish[]; handles?: Handle[]; glass?: Glass; hinges?: Hinges; sliding?: boolean } & Partial<Choices>
): string {
  const stored = parsed(text);
  for (const kind of ['fixing', 'glassTypes', 'coatings'] as const) {
    const offer = changes[kind];
    if (offer) stored[kind] = { offered: offer.offered, standard: offer.standard };
  }
  if (changes.finishes) stored.finishes = changes.finishes;
  if (changes.handles) stored.handles = changes.handles;
  if (changes.glass) {
    stored.glassThicknessesMm = changes.glass.offered;
    stored.glassThicknessMm = changes.glass.standard;
  }
  if (changes.hinges) stored.hinges = changes.hinges;
  if (changes.sliding !== undefined) stored.slidingDoors = changes.sliding;
  return JSON.stringify(stored);
}

// ---------------------------------------------------------------------------
// Measurements: the company's rules
// ---------------------------------------------------------------------------

/** A rule a company changes in its settings: every one SetOut names, which is all but the glass thickness. */
const isNamedRule = (rule: string): rule is keyof typeof RULE_TEXT => Object.hasOwn(RULE_TEXT, rule);

/**
 * The measurements an owner sent: every rule they differ from SetOut's
 * standard in, each a whole number inside its bounds. A rule sent at SetOut's
 * standard is not kept, so a company that has changed nothing has nothing
 * stored, and takes SetOut's standard if it changes.
 */
export function readRuleOverrides(input: unknown): RulesetOverrides {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, 'invalid_rules', 'Send the measurements by name, each with its number.');
  }
  const overrides: RulesetOverrides = {};
  for (const [rule, value] of Object.entries(input)) {
    if (!isNamedRule(rule)) throw new RequestError(400, 'invalid_rules', `"${rule}" is not a measurement a company can change.`);
    const text = RULE_TEXT[rule];
    const bounds = ADJUSTABLE[rule];
    const range = 'min' in bounds ? ` between ${bounds.min} and ${bounds.max}${text.unit}` : '';
    if (typeof value !== 'number' || !Number.isInteger(value) || ('min' in bounds && (value < bounds.min || value > bounds.max))) {
      throw new RequestError(400, 'invalid_rules', `${text.group}, ${text.label.charAt(0).toLowerCase()}${text.label.slice(1)}: a whole number${range}.`);
    }
    if (value !== ruleValue(DEFAULT_MAKING_RULES, rule)) overrides[rule] = value;
  }
  // The engine is the last word on what a company may change.
  resolveRuleset(overrides);
  return overrides;
}

/** Each measurement that moved, with what it was and what it is now. */
export function ruleChanges(before: RulesetOverrides, after: RulesetOverrides): SettingsChange[] {
  const was = resolveRuleset(before).making;
  const now = resolveRuleset(after).making;
  return (Object.keys(ADJUSTABLE) as AdjustableRule[])
    .filter((rule) => ruleValue(was, rule) !== ruleValue(now, rule))
    .map((rule) => ({ field: 'rule', rule, from: ruleValue(was, rule), to: ruleValue(now, rule) }));
}
