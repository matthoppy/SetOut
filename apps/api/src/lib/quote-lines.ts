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
import { channelKey, clampsKey, DELIVERY_KEY, ENDUROSHIELD_KEY, FITTING_KEY, glassKey, handleKey, hingeKey, HOLE_KEY, NOTCH_KEY, POLISH_KEY, slidingKitKey } from './price-keys';
import { PRICING_DEFAULTS, resolveLine, type CatalogItem, type PricingSettings } from './pricing';

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

/** A supplier catalogue and the company's markup, when a new quote is costed from them. */
export interface LineCosting {
  catalog: Map<string, CatalogItem>;
  settings: PricingSettings;
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

/** The lines a new quote starts with, priced from a supplier's cost or what the company last sent. */
export function draftLines(
  showers: PricedShower[],
  labels: OptionLabels,
  prices: Map<string, number>,
  costing?: LineCosting
): QuoteLine[] {
  const lines: QuoteLine[] = [];
  const settings = costing?.settings ?? PRICING_DEFAULTS;
  const catalog = costing?.catalog ?? new Map<string, CatalogItem>();
  const line = (key: string | null, description: string, quantity: number, unit: QuoteUnit) => {
    if (quantity <= 0) return;
    if (key && costing) {
      const priced = resolveLine(key, quantity, unit, catalog, prices, settings);
      const row: QuoteLine = { key, description, quantity: priced.quantity, unit, unitPricePence: priced.unitPricePence };
      if (priced.supplierId) row.supplierId = priced.supplierId;
      if (priced.priceListId) row.priceListId = priced.priceListId;
      if (priced.costPence !== undefined) row.costPence = priced.costPence;
      lines.push(row);
      return;
    }
    lines.push({ key, description, quantity, unit, unitPricePence: (key && prices.get(key)) || 0 });
  };
  const canPrice = (key: string) => prices.has(key) || catalog.has(key);

  for (const { prefix, design, spec } of showers) {
    const finish = named(labels.finishes, design.finishId);
    const coated = design.glassCoating === 'easy-clean';
    const glass = glassKey(spec.glassThicknessMm, design.glassType);
    // Priced by the rectangle each pane is cut from, as a toughener prices it.
    const panes = panesOf(design, spec, DEFAULT_RULESET.fixed, labels.hinges);
    let glassArea = 0;
    let edgeMetres = 0;
    for (const pane of panes) {
      const area = squareMetres(pane.widthMm, pane.heightMm);
      glassArea += area;
      edgeMetres += metres(2 * (pane.widthMm + pane.heightMm));
      line(
        glass,
        `${prefix}${pane.label}: ${spec.glassThicknessMm}mm toughened ${GLASS_NAMES[design.glassType] ?? design.glassType} glass, ${pane.widthMm} × ${pane.heightMm}mm${pane.shaped ? ', cut to shape' : ''}`,
        area,
        'm2'
      );
    }
    if (coated) {
      line(ENDUROSHIELD_KEY, `${prefix}Enduroshield (easy-clean) coating`, Math.round(glassArea * 100) / 100, 'm2');
    }
    line(POLISH_KEY, `${prefix}Polished edges`, Math.round(edgeMetres * 100) / 100, 'm');
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
  // Fitting goes on when the company has priced it before, or a supplier has;
  // supply-only companies never have. Delivery is the same, when it has a price.
  if (canPrice(FITTING_KEY)) line(FITTING_KEY, 'Survey and fitting', 1, 'job');
  if (canPrice(DELIVERY_KEY)) line(DELIVERY_KEY, 'Delivery', 1, 'job');
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
    const supplierId = optionalId(l.supplierId, n, 'supplier');
    const priceListId = optionalId(l.priceListId, n, 'price list');
    if (supplierId) line.supplierId = supplierId;
    if (priceListId) line.priceListId = priceListId;
    if (l.costPence !== undefined && l.costPence !== null) {
      const cost = l.costPence;
      if (typeof cost !== 'number' || !Number.isInteger(cost) || cost < 0 || cost > MAX_UNIT_PRICE_PENCE) {
        throw new RequestError(400, 'invalid_lines', `Line ${n} needs a cost in whole pence.`);
      }
      line.costPence = cost;
    }
    return line;
  });
}

const optionalId = (value: unknown, n: number, what: string): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string' || !/^[a-z]{2,8}_[0-9A-HJKMNP-TV-Z]{26}$/i.test(value)) {
    throw new RequestError(400, 'invalid_lines', `Line ${n} has a ${what} that is not one.`);
  }
  return value;
};

export const lineTotal = (line: QuoteLine) => Math.round(line.quantity * line.unitPricePence);

/** What a quote comes to, in pence. VAT is rounded once, on the subtotal. */
export function totals(lines: QuoteLine[], vatRateBp: number) {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const vat = Math.round((subtotal * vatRateBp) / 10_000);
  return { subtotal, vat, total: subtotal + vat };
}
