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

import {
  DEFAULT_RULESET,
  doorHingeOf,
  hingeMountOf,
  hingeStylesOf,
  panesOf,
  STANDARD_HINGES,
  type ConfiguratorSpec,
  type ConfiguratorState,
  type HingeMount,
  type HingeStyles,
} from '@setout/engine';
import { QUOTE_UNITS, type QuoteLine, type QuoteUnit } from '../db/tables';
import { RequestError } from './enquiry';
import { channelKey, clampsKey, ENDUROSHIELD_KEY, FITTING_KEY, glassKey, handleKey, hingeKey, HOLE_KEY, NOTCH_KEY, POLISH_KEY, slidingKitKey } from './price-keys';
import { resolveLine, type CatalogItem, type PricingSettings } from './pricing';

export const MAX_LINES = 100;
export const MAX_UNIT_PRICE_PENCE = 100_000_000;
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
  /** The company's standard hinges, for a shower that has not chosen its own. */
  hinges?: HingeStyles;
}

export const HUNG: Record<HingeMount, string> = {
  'wall-to-glass': 'to the wall',
  'glass-to-glass-180': 'glass to glass',
  'glass-to-glass-90': 'glass to glass at 90°',
};

export const GLASS_NAMES: Record<string, string> = {
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

export interface LineCosting {
  /** Costs from the company's default glass and hardware suppliers. */
  catalog: Map<string, CatalogItem>;
  settings: PricingSettings;
}

/** The lines a new quote starts with, priced from the default supplier's cost
 *  plus the company's markup, or from the price book when there is no cost. */
export function draftLines(showers: PricedShower[], labels: OptionLabels, prices: Map<string, number>, costing?: LineCosting): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const line = (key: string | null, description: string, quantity: number, unit: QuoteUnit) => {
    if (quantity <= 0) return;
    if (!key || !costing) {
      lines.push({ key, description, quantity, unit, unitPricePence: (key && prices.get(key)) || 0 });
      return;
    }
    const resolved = resolveLine(key, quantity, costing.catalog, prices, costing.settings);
    lines.push({
      key,
      description,
      quantity,
      unit,
      unitPricePence: resolved.unitPricePence,
      ...(resolved.costPence !== undefined ? { costPence: resolved.costPence, supplierId: resolved.supplierId } : {}),
    });
  };

  for (const { prefix, design, spec } of showers) {
    const finish = named(labels.finishes, design.finishId);
    const glass = glassKey(spec.glassThicknessMm, design.glassType);
    // Priced by the rectangle each pane is cut from, as a toughener prices it.
    const panes = panesOf(design, spec, DEFAULT_RULESET.fixed, labels.hinges);
    let polishM = 0;
    let coatingM2 = 0;
    for (const pane of panes) {
      const area = squareMetres(pane.widthMm, pane.heightMm);
      coatingM2 += area;
      polishM += metres(2 * (pane.widthMm + pane.heightMm));
      line(
        glass,
        `${prefix}${pane.label}: ${spec.glassThicknessMm}mm toughened ${GLASS_NAMES[design.glassType] ?? design.glassType} glass, ${pane.widthMm} × ${pane.heightMm}mm${pane.shaped ? ', cut to shape' : ''}`,
        area,
        'm2'
      );
    }
    line(POLISH_KEY, `${prefix}Polished edges`, polishM, 'm');
    if (design.glassCoating === 'easy-clean') {
      line(ENDUROSHIELD_KEY, `${prefix}Enduroshield easy-clean coating`, coatingM2, 'm2');
    }
    // The toughener charges for each notch cut and each hole drilled: a
    // mouse-ear hinge notch is a notch and two holes (Matt, 12 November 2026).
    let notches = 0;
    let holes = 0;
    for (const f of panes.flatMap((p) => p.features)) {
      if (f.kind === 'hole') holes += 1;
      else notches += 1;
      if (f.kind === 'notch' && f.ears) holes += 2;
    }
    line(NOTCH_KEY, `${prefix}Notches cut in the glass`, notches, 'each');
    line(HOLE_KEY, `${prefix}Holes drilled in the glass`, holes, 'each');

    const styles = hingeStylesOf(design, labels.hinges ?? STANDARD_HINGES);
    for (const [i, panel] of spec.panels.entries()) {
      if (!panel.door) continue;
      const brand = panel.door.hingeBrand;
      // Each of CRL's hinges is priced on its own: a Geneva hinge to the wall is not the price of one between the glass.
      const mount = hingeMountOf(design, spec, i) ?? 'wall-to-glass';
      const { series, style } = doorHingeOf(brand, mount, styles);
      const what = [brand, HUNG[mount], style?.words].filter(Boolean).join(', ');
      line(hingeKey(series ?? brand, design.finishId), `${prefix}${panel.label} hinges: ${what}, ${finish}`, panel.door.hingeCount, 'each');
      line(handleKey(design.handleId, design.finishId), `${prefix}${panel.label} handle: ${named(labels.handles, design.handleId)}, ${finish}`, 1, 'each');
    }
    // A sliding door's kit, in place of hinges and a handle. Unpriced until the company prices one.
    if (spec.sliding) {
      line(slidingKitKey(spec.sliding.kit, design.finishId), `${prefix}Serenity sliding door kit (CRL ${spec.sliding.kit}), ${finish}`, 1, 'each');
      if (spec.sliding.returnKit) {
        line(slidingKitKey(spec.sliding.returnKit, design.finishId), `${prefix}Serenity 90° return kit (CRL ${spec.sliding.returnKit}), ${finish}`, 1, 'each');
      }
    }
    if (spec.mounting === 'channel') {
      // A door alone has no channel to price.
      if (spec.totalChannelLengthMm > 0) line(channelKey(design.finishId), `${prefix}U-channel, ${finish}`, metres(spec.totalChannelLengthMm), 'm');
    } else {
      line(clampsKey(design.finishId), `${prefix}Glass clamps, ${finish}`, 1, 'set');
    }
  }
  // Fitting goes on when the company has priced it before; supply-only
  // companies never have.
  if (prices.has(FITTING_KEY)) line(FITTING_KEY, 'Survey and fitting', 1, 'job');
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
    const line: QuoteLine = { key, description, quantity, unit: l.unit as QuoteUnit, unitPricePence: price };
    if (typeof l.costPence === 'number' && Number.isInteger(l.costPence) && l.costPence >= 0 && l.costPence <= MAX_UNIT_PRICE_PENCE) {
      line.costPence = l.costPence;
    }
    if (typeof l.supplierId === 'string' && KEY.test(l.supplierId)) line.supplierId = l.supplierId;
    return line;
  });
}

export const lineTotal = (line: QuoteLine) => Math.round(line.quantity * line.unitPricePence);

/** What a quote comes to, in pence. VAT is rounded once, on the subtotal. */
export function totals(lines: QuoteLine[], vatRateBp: number) {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const vat = Math.round((subtotal * vatRateBp) / 10_000);
  return { subtotal, vat, total: subtotal + vat };
}
