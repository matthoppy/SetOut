/**
 * A quote's lines: drafted from the showers it prices, read from what staff
 * send, and added up.
 *
 * A draft starts from what the engine worked out for each shower: every pane
 * of glass by its cut size, the hinges and handle on each door, and how the
 * glass is fixed. Each line carries a key saying what it is the price of, so
 * the price a company last sent for it is offered again. Totals are always
 * worked out here, never taken from a browser.
 */

import { DEFAULT_RULESET, panesOf, type ConfiguratorSpec, type ConfiguratorState } from '@setout/engine';
import { QUOTE_UNITS, type QuoteLine, type QuoteUnit } from '../db/tables';
import { RequestError } from './enquiry';

export const MAX_LINES = 100;
const MAX_UNIT_PRICE_PENCE = 100_000_000;
const MAX_QUANTITY = 100_000;
const KEY = /^[a-z0-9][a-z0-9:._-]{0,99}$/;

export interface PricedShower {
  /** "Shower 2: " on a job with several showers, or nothing. */
  prefix: string;
  design: ConfiguratorState;
  spec: ConfiguratorSpec;
}

export interface OptionLabels {
  finishes: { id: string; label: string }[];
  handles: { id: string; label: string }[];
}

const GLASS_NAMES: Record<string, string> = {
  clear: 'clear',
  'low-iron': 'low-iron',
  satin: 'satin',
  bronze: 'bronze tinted',
  grey: 'grey tinted',
};

/** Square metres to two places, from a width and height in millimetres. */
export const squareMetres = (widthMm: number, heightMm: number) => Math.round((widthMm * heightMm) / 10_000) / 100;
const metres = (mm: number) => Math.round(mm / 10) / 100;
const named = (list: { id: string; label: string }[], id: string) => list.find((o) => o.id === id)?.label ?? id.replace(/[-_]+/g, ' ');

/** The lines a new quote starts with, priced from what the company last sent. */
export function draftLines(showers: PricedShower[], labels: OptionLabels, prices: Map<string, number>): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const line = (key: string | null, description: string, quantity: number, unit: QuoteUnit) => {
    if (quantity <= 0) return;
    lines.push({ key, description, quantity, unit, unitPricePence: (key && prices.get(key)) || 0 });
  };

  for (const { prefix, design, spec } of showers) {
    const finish = named(labels.finishes, design.finishId);
    const coating = design.glassCoating === 'easy-clean' ? ', easy-clean coated' : '';
    const glassKey = `glass:${spec.glassThicknessMm}:${design.glassType}${design.glassCoating === 'easy-clean' ? ':easy-clean' : ''}`;
    // Priced by the rectangle each pane is cut from, as a toughener prices it.
    for (const pane of panesOf(design, spec, DEFAULT_RULESET.fixed)) {
      line(
        glassKey,
        `${prefix}${pane.label}: ${spec.glassThicknessMm}mm toughened ${GLASS_NAMES[design.glassType] ?? design.glassType} glass${coating}, ${pane.widthMm} × ${pane.heightMm}mm${pane.shaped ? ', cut to shape' : ''}`,
        squareMetres(pane.widthMm, pane.heightMm),
        'm2'
      );
    }
    for (const panel of spec.panels) {
      if (!panel.door) continue;
      const brand = panel.door.hingeBrand;
      line(`hinge:${brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${design.finishId}`, `${prefix}${panel.label} hinges: ${brand}, ${finish}`, panel.door.hingeCount, 'each');
      line(`handle:${design.handleId}:${design.finishId}`, `${prefix}${panel.label} handle: ${named(labels.handles, design.handleId)}, ${finish}`, 1, 'each');
    }
    if (spec.mounting === 'channel') {
      line(`channel:${design.finishId}`, `${prefix}U-channel, ${finish}`, metres(spec.totalChannelLengthMm), 'm');
    } else {
      line(`clamps:${design.finishId}`, `${prefix}Glass clamps, ${finish}`, 1, 'set');
    }
  }
  // Fitting goes on when the company has priced it before; supply-only
  // companies never have.
  if (prices.has('fitting')) line('fitting', 'Survey and fitting', 1, 'job');
  return lines;
}

/** Lines as staff sent them, checked one by one. */
export function readLines(input: unknown): QuoteLine[] {
  if (!Array.isArray(input) || input.length > MAX_LINES) {
    throw new RequestError(400, 'invalid_lines', `A quote can have up to ${MAX_LINES} lines.`);
  }
  return input.map((raw: unknown, i) => {
    const n = i + 1;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RequestError(400, 'invalid_lines', `Line ${n} is not a line.`);
    const l = raw as Record<string, unknown>;
    const key = l.key === null || l.key === undefined || l.key === '' ? null : l.key;
    if (key !== null && (typeof key !== 'string' || !KEY.test(key))) throw new RequestError(400, 'invalid_lines', `Line ${n} has a key that is not one.`);
    const description = typeof l.description === 'string' ? l.description.replace(/\s+/g, ' ').trim() : '';
    if (!description || description.length > 200) {
      throw new RequestError(400, 'invalid_lines', `Line ${n} needs a description of up to 200 characters.`);
    }
    const quantity = typeof l.quantity === 'number' && Number.isFinite(l.quantity) ? Math.round(l.quantity * 100) / 100 : NaN;
    if (!(quantity > 0 && quantity <= MAX_QUANTITY)) throw new RequestError(400, 'invalid_lines', `Line ${n} needs a quantity above nought.`);
    if (!(QUOTE_UNITS as readonly unknown[]).includes(l.unit)) throw new RequestError(400, 'invalid_lines', `Line ${n} has a unit that is not one.`);
    const price = l.unitPricePence;
    if (typeof price !== 'number' || !Number.isInteger(price) || price < 0 || price > MAX_UNIT_PRICE_PENCE) {
      throw new RequestError(400, 'invalid_lines', `Line ${n} needs a price in whole pence.`);
    }
    return { key, description, quantity, unit: l.unit as QuoteUnit, unitPricePence: price };
  });
}

export const lineTotal = (line: QuoteLine) => Math.round(line.quantity * line.unitPricePence);

/** What a quote comes to, in pence. VAT is rounded once, on the subtotal. */
export function totals(lines: QuoteLine[], vatRateBp: number) {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const vat = Math.round((subtotal * vatRateBp) / 10_000);
  return { subtotal, vat, total: subtotal + vat };
}
