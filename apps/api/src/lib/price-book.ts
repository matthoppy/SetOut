/**
 * The price book: every price a company's new quotes can start from, worked
 * out from what its designers offer, beside the price it has for each.
 *
 * A new quote looks up each line's price by a key (price-keys.ts), and the
 * book lists the same keys, grouped as an owner thinks of them: glass by the
 * square metre, notches and holes, each hinge and handle in each finish,
 * channel and clamps, sliding kits, and fitting and delivery. A price the
 * company has for something it no longer offers, a finish since removed say,
 * is listed at the end, so no price is ever out of sight.
 *
 * Prices are whole pence before VAT, as on a quote. An owner changes them
 * here, and sending a quote still keeps the prices on it, for next time.
 */

import {
  DEFAULT_RULESET,
  doorHingeOf,
  GLASS_COATINGS,
  GLASS_TYPES,
  IN_LINE_HINGES,
  SERENITY_KITS,
  WALL_HINGES,
  type HingeMount,
  type InLineHinge,
  type WallHinge,
} from '@setout/engine';
import type { QuoteUnit } from '../db/tables';
import { GLASS_THICKNESSES } from './designer-config';
import { RequestError } from './enquiry';
import { channelKey, clampsKey, DELIVERY_KEY, FITTING_KEY, glassKey, handleKey, hingeKey, HOLE_KEY, NOTCH_KEY, slidingKitKey } from './price-keys';
import { GLASS_NAMES, HUNG, MAX_UNIT_PRICE_PENCE } from './quote-lines';
import type { DesignerView } from './settings';

export interface PriceBookRow {
  /** What it is, as the owner reads it: "10mm clear", "Geneva, to the wall, offset back plate". */
  label: string;
  /** CRL's number for it, where it is one of CRL's parts. */
  code?: string;
  unit: QuoteUnit;
  /** The row's one price, or one for each of its group's columns, in their order. */
  keys: string[];
}

export type PriceGroupId = 'glass' | 'cutouts' | 'hinges' | 'handles' | 'fixing' | 'sliding' | 'job' | 'other';

export interface PriceBookGroup {
  id: PriceGroupId;
  title: string;
  /**
   * Where each row has a price for each of several things, what they are, in
   * order: the finishes the hardware comes in, or the glass thicknesses.
   */
  columns?: { id: string; label: string }[];
  /** Whether one price may stand for every column, as one hinge's may for every finish. */
  sameAcross?: boolean;
  rows: PriceBookRow[];
}

export interface PriceBook {
  groups: PriceBookGroup[];
  /** The company's prices by key: pence before VAT, and when each last changed. */
  prices: Record<string, { pence: number; updatedAt: string }>;
}

/** A price as the company has it. */
export interface StoredPrice {
  key: string;
  unit: QuoteUnit;
  pence: number;
  updatedAt: string;
}

/** The first of each, by its id, in the order they come. */
function firstOf<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const first: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    first.push(item);
  }
  return first;
}

/**
 * The hinges a door of each of CRL's ranges can hang on, in the styles the
 * company offers: to the wall, in line, and round a corner. A range takes the
 * glass it is made for, so a company in 12mm alone sees Geneva alone. A style
 * a range does not make is left out: no door is hung on it.
 */
function hingeRows(designers: readonly DesignerView[], thicknesses: readonly number[], finishes: readonly { id: string }[]): PriceBookRow[] {
  const wallStyles = WALL_HINGES.filter((s) => designers.some((d) => d.hinges.wall.offered.includes(s)));
  const inLineStyles = IN_LINE_HINGES.filter((s) => designers.some((d) => d.hinges.inLine.offered.includes(s)));
  const ranges = DEFAULT_RULESET.fixed.hinges.kits.filter((kit) => kit.glassMm.some((t) => thicknesses.includes(t)));
  const rows: PriceBookRow[] = [];
  const listed = new Set<string>();
  const add = (range: string, mount: HingeMount, styles: { wall: WallHinge; inLine: InLineHinge }) => {
    const { series, style } = doorHingeOf(range, mount, styles);
    if (!series || listed.has(series)) return;
    listed.add(series);
    rows.push({
      label: [range, HUNG[mount], style?.words].filter(Boolean).join(', '),
      code: series,
      unit: 'each',
      keys: finishes.map((f) => hingeKey(series, f.id)),
    });
  };
  for (const { name } of ranges) {
    for (const wall of wallStyles) add(name, 'wall-to-glass', { wall, inLine: 'standard' });
    for (const inLine of inLineStyles) add(name, 'glass-to-glass-180', { wall: 'offset', inLine });
    add(name, 'glass-to-glass-90', { wall: 'offset', inLine: 'standard' });
  }
  return rows;
}

const words = (id: string) => id.replace(/[-_]+/g, ' ').trim() || id;
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const uncapitalised = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** What a price the book does not list is for, from its key alone. */
function describeKey(key: string, finishes: readonly { id: string; label: string }[], handles: readonly { id: string; label: string }[]): string {
  const [kind, first = '', second = '', third = ''] = key.split(':');
  const finish = (id: string) => finishes.find((f) => f.id === id)?.label ?? words(id);
  switch (kind) {
    case 'glass':
      return `${first}mm ${GLASS_NAMES[second] ?? words(second)}${third === 'easy-clean' ? ', easy-clean coated' : ''}`;
    case 'hinge':
      return `Hinge ${/\d/.test(first) ? first.toUpperCase() : capitalised(words(first))}, ${finish(second)}`;
    case 'handle':
      return `${handles.find((h) => h.id === first)?.label ?? words(first)}, ${finish(second)}`;
    case 'channel':
      return `U-channel, ${finish(first)}`;
    case 'clamps':
      return `Glass clamps, ${finish(first)}`;
    case 'sliding-kit':
      return `Serenity kit ${first.toUpperCase()}, ${finish(second)}`;
  }
  return words(key.replace(/:/g, ' '));
}

/** The company's price book, from its designers' settings and the prices it has. */
export function priceBook(designers: readonly DesignerView[], stored: readonly StoredPrice[]): PriceBook {
  const finishes = firstOf(designers.flatMap((d) => d.finishes)).map(({ id, label }) => ({ id, label }));
  const handles = firstOf(designers.flatMap((d) => d.handles));
  const thicknesses = GLASS_THICKNESSES.filter((t) => designers.some((d) => d.glass.offered.includes(t)));
  const types = GLASS_TYPES.filter((t) => designers.some((d) => d.glassTypes.offered.includes(t)));
  const coatings = GLASS_COATINGS.filter((c) => designers.some((d) => d.coatings.offered.includes(c)));
  const byFinish = (make: (finishId: string) => string) => finishes.map((f) => make(f.id));
  const glassName = (type: string, coating: string) => `${GLASS_NAMES[type] ?? type}${coating === 'easy-clean' ? ', easy-clean coated' : ''}`;

  // Glass in one thickness is a list; in several, a table with a column for each, as a toughener's price list is.
  const glass: PriceBookRow[] = types.flatMap((type) =>
    coatings.map((coating) =>
      thicknesses.length === 1
        ? { label: `${thicknesses[0]}mm ${glassName(type, coating)}`, unit: 'm2' as const, keys: [glassKey(thicknesses[0], type, coating)] }
        : { label: capitalised(glassName(type, coating)), unit: 'm2' as const, keys: thicknesses.map((t) => glassKey(t, type, coating)) }
    )
  );
  const finishColumns = { columns: finishes, sameAcross: true };
  const fixing: PriceBookRow[] = [
    ...(designers.some((d) => d.fixing.offered.includes('channel')) ? [{ label: 'U-channel', unit: 'm' as const, keys: byFinish(channelKey) }] : []),
    ...(designers.some((d) => d.fixing.offered.includes('clamps')) ? [{ label: 'Glass clamps, a shower’s set', unit: 'set' as const, keys: byFinish(clampsKey) }] : []),
  ];
  const sliding: PriceBookRow[] = designers.some((d) => d.sliding)
    ? [
        { label: 'Serenity sliding door kit', code: SERENITY_KITS.kit, unit: 'each', keys: byFinish((f) => slidingKitKey(SERENITY_KITS.kit, f)) },
        { label: 'Serenity 90° return kit', code: SERENITY_KITS.returnKit, unit: 'each', keys: byFinish((f) => slidingKitKey(SERENITY_KITS.returnKit, f)) },
      ]
    : [];

  const groups: PriceBookGroup[] = [
    {
      id: 'glass',
      title: 'Glass',
      ...(thicknesses.length > 1 ? { columns: thicknesses.map((t) => ({ id: String(t), label: `${t}mm` })) } : {}),
      rows: glass,
    },
    {
      id: 'cutouts',
      title: 'Notches and holes',
      rows: [
        { label: 'A notch cut in the glass', unit: 'each', keys: [NOTCH_KEY] },
        { label: 'A hole drilled in the glass', unit: 'each', keys: [HOLE_KEY] },
      ],
    },
    { id: 'hinges', title: 'Hinges', ...finishColumns, rows: hingeRows(designers, thicknesses, finishes) },
    {
      id: 'handles',
      title: 'Handles',
      ...finishColumns,
      rows: handles.map((h) => ({ label: h.label, ...(h.code ? { code: h.code } : {}), unit: 'each' as const, keys: byFinish((f) => handleKey(h.id, f)) })),
    },
    { id: 'fixing', title: fixing.length === 1 ? fixing[0].label : 'Channel and clamps', ...finishColumns, rows: fixing },
    { id: 'sliding', title: 'Sliding doors', ...finishColumns, rows: sliding },
    {
      id: 'job',
      title: 'Fitting and delivery',
      rows: [
        { label: 'Survey and fitting', unit: 'job', keys: [FITTING_KEY] },
        { label: 'Delivery', unit: 'job', keys: [DELIVERY_KEY] },
      ],
    },
  ];

  const listed = new Set(groups.flatMap((g) => g.rows.flatMap((r) => r.keys)));
  const other = stored
    .filter((p) => !listed.has(p.key))
    .map((p) => ({ label: describeKey(p.key, finishes, handles), unit: p.unit, keys: [p.key] }))
    .sort((a, b) => a.label.localeCompare(b.label));
  groups.push({ id: 'other', title: 'Other prices', rows: other });

  return {
    groups: groups
      .map((g) => ({ ...g, rows: g.rows.filter((r) => r.keys.length > 0) }))
      .filter((g) => g.rows.length > 0),
    prices: Object.fromEntries(stored.map((p) => [p.key, { pence: p.pence, updatedAt: p.updatedAt }])),
  };
}

/**
 * Every price the book lists, by key: what it is, and how it is priced. A
 * price in a column is named with it: "10mm clear", "Pull handle, Matte black".
 */
export function listedPrices(book: PriceBook): Map<string, { label: string; unit: QuoteUnit }> {
  const listed = new Map<string, { label: string; unit: QuoteUnit }>();
  for (const group of book.groups) {
    for (const row of group.rows) {
      row.keys.forEach((key, i) => {
        const column = group.columns?.[i]?.label;
        const label = !column ? row.label : group.id === 'glass' ? `${column} ${uncapitalised(row.label)}` : `${row.label}, ${column}`;
        listed.set(key, { label, unit: row.unit });
      });
    }
  }
  return listed;
}

/** One price an owner changed, as the audit log keeps it: what it is, and what it was and became. */
export interface PriceChange {
  key: string;
  label: string;
  unit: QuoteUnit;
  /** In pence before VAT. Null is no price. */
  from: number | null;
  to: number | null;
}

/** More than the largest price book holds. */
export const MAX_PRICE_CHANGES = 2000;

const isPence = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= MAX_UNIT_PRICE_PENCE;

/**
 * The prices an owner changed, each with the price they saw and the one they
 * chose, checked against the book. Nothing is taken that the book does not
 * list. A price that did not change is dropped.
 */
export function readPriceChanges(input: unknown, book: PriceBook): PriceChange[] {
  const bad = (message: string) => new RequestError(400, 'invalid_prices', message);
  if (!Array.isArray(input)) throw bad('Send the prices that changed.');
  if (input.length > MAX_PRICE_CHANGES) throw bad('That is more prices than the price book holds.');
  const listed = listedPrices(book);
  const seen = new Set<string>();
  const changes: PriceChange[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('Each change is a price.');
    const { key, from, to } = raw as Record<string, unknown>;
    const item = typeof key === 'string' ? listed.get(key) : undefined;
    if (typeof key !== 'string' || !item) throw bad('A price was sent for something the price book does not list.');
    if (seen.has(key)) throw bad(`${item.label}: its price was sent twice.`);
    seen.add(key);
    if (from !== null && !isPence(from, 0)) throw bad(`${item.label}: the price it had is not one.`);
    if (to !== null && !isPence(to, 1)) throw bad(`${item.label}: a price is in pounds and pence, from 1p to £1,000,000.`);
    if (from === to) continue;
    changes.push({ key, label: item.label, unit: item.unit, from, to });
  }
  return changes;
}
