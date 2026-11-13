/**
 * What a customer chooses besides the shape, and what each is called.
 *
 * The company decides what its customers can choose. Matt, 13 November 2026:
 * "The company will be able to select what thickness their customers can use
 * same with any hardware". The finishes and handles are the company's own
 * lists. The glass thicknesses, the hinges and the three here are SetOut's,
 * and the company ticks which of them its customers see and the one a new
 * design starts with. Staff can make a shower with any of them.
 */

import type { GlassCoating, GlassType, Mounting } from './types';

/** How the fixed glass is held, in the order a customer is shown them. */
export const MOUNTINGS = ['channel', 'clamps'] as const satisfies readonly Mounting[];

/** The glass SetOut makes showers in, in the order a customer is shown them. */
export const GLASS_TYPES = ['clear', 'low-iron', 'satin', 'bronze', 'grey'] as const satisfies readonly GlassType[];

/** The coatings, in the order a customer is shown them. */
export const GLASS_COATINGS = ['none', 'easy-clean'] as const satisfies readonly GlassCoating[];

/**
 * What a new design starts with until a company chooses: U-channel, clear
 * glass and no coating. Every company offered all of them before it could
 * choose, so one that has not chosen still offers all of them.
 */
export const STANDARD_CHOICES: { mounting: Mounting; glassType: GlassType; glassCoating: GlassCoating } = {
  mounting: 'channel',
  glassType: 'clear',
  glassCoating: 'none',
};

export interface ChoiceText {
  label: string;
  /** A line about it, as the customer reads it under the name. */
  description: string;
  /** What it is called in a sentence: "a new design starts with glass clamps". */
  words: string;
}

export const MOUNTING_TEXT: Record<Mounting, ChoiceText> = {
  channel: {
    label: 'U-channel',
    description: 'Slim profile along the wall and floor. Most popular, and the most forgiving of walls that are out of plumb.',
    words: 'U-channel',
  },
  clamps: {
    label: 'Glass clamps',
    description: 'Minimal hardware for a fully frameless look. Needs a straighter wall and a silicone seal down the edge.',
    words: 'glass clamps',
  },
};

export const GLASS_TYPE_TEXT: Record<GlassType, ChoiceText> = {
  clear: { label: 'Clear', description: 'Standard clear glass', words: 'clear glass' },
  'low-iron': { label: 'Low Iron', description: 'Ultra-clear with minimal green tint', words: 'low iron glass' },
  satin: { label: 'Satin / Frosted', description: 'Translucent privacy glass', words: 'satin glass' },
  bronze: { label: 'Bronze Tinted', description: 'Warm bronze tint', words: 'bronze tinted glass' },
  grey: { label: 'Grey Tinted', description: 'Neutral grey tint', words: 'grey tinted glass' },
};

export const GLASS_COATING_TEXT: Record<GlassCoating, ChoiceText> = {
  none: { label: 'None', description: 'Standard glass', words: 'glass without a coating' },
  'easy-clean': { label: 'Easy-clean coating', description: 'Protective coating that repels water and soap', words: 'the easy-clean coating' },
};

/** Which of one kind a company offers its customers, in SetOut's order, and the one a new design starts with. */
export interface Offer<T extends string> {
  offered: T[];
  standard: T;
}

/**
 * A company's offer of one kind, from what is stored: only what SetOut
 * knows, in SetOut's order, and always with the standard among them. Where
 * nothing is stored, every one is offered and the standard is SetOut's.
 */
export function offerOf<T extends string>(all: readonly T[], stored: unknown, fallback: T): Offer<T> {
  const s = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as { offered?: unknown; standard?: unknown }) : {};
  const standard = all.includes(s.standard as T) ? (s.standard as T) : fallback;
  if (!Array.isArray(s.offered)) return { offered: [...all], standard };
  const chosen = new Set<unknown>([standard, ...s.offered]);
  return { offered: all.filter((t) => chosen.has(t)), standard };
}
