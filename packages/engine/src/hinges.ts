/**
 * The hinges a door hangs on, as CRL makes them.
 *
 * How a door hangs is worked out from the design: from a wall, from the glass
 * beside it in line, or from the glass round a corner. Which of CRL's hinges
 * it hangs on is a choice. CRL makes Geneva and Vienna wall hinges with a
 * full, offset, short or H plate, set 5° in, adjustable, or (Vienna only)
 * positive closing, and in-line hinges that are standard, adjustable or
 * (Vienna only) positive closing. Bellagio makes one of each, and every range
 * one hinge for a corner. Within a range they all hold the glass the same
 * way, so the glass is cut the same whichever is fitted.
 *
 * A company chooses which its customers may pick, and its standard; a shower
 * may have its own. Staff may choose any.
 */

import type { HingeMount } from './fittings';
import type { ConfiguratorState, InLineHinge, WallHinge } from './types';

export interface HingeStyle {
  /** As a heading or an option: "Offset back plate". */
  name: string;
  /** Within a sentence: "offset back plate". */
  words: string;
  /** What it is, for whoever chooses it. */
  about: string;
  /** CRL's number before the finish, in each range that makes it. */
  Geneva?: string;
  Vienna?: string;
}

const ADJUSTABLE = 'The door’s closed position can be adjusted, up to 90°, without taking it down.';
const PRESET = 'Set at the factory to close 5° further into the shower.';
const POSITIVE = 'A grooved pivot pin for a firm, precise close. Vienna hinges only.';

export const WALL_HINGE_STYLES: Record<WallHinge, HingeStyle> = {
  offset: { name: 'Offset back plate', words: 'offset back plate', about: 'CRL’s wall hinge with an offset back plate.', Geneva: 'GEN044', Vienna: 'V1E044' },
  full: { name: 'Full back plate', words: 'full back plate', about: 'CRL’s wall hinge with a full back plate.', Geneva: 'GEN037', Vienna: 'V1E037' },
  short: { name: 'Short back plate', words: 'short back plate', about: 'A shorter back plate, for a narrow wall.', Geneva: 'GEN074', Vienna: 'V1E074' },
  'offset-preset': { name: 'Offset back plate, 5° pre-set', words: 'offset back plate, 5° pre-set', about: PRESET, Geneva: 'GEN544', Vienna: 'V1E544' },
  'full-preset': { name: 'Full back plate, 5° pre-set', words: 'full back plate, 5° pre-set', about: PRESET, Geneva: 'GEN537', Vienna: 'V1E537' },
  'offset-adjustable': { name: 'Offset back plate, adjustable', words: 'offset back plate, adjustable', about: ADJUSTABLE, Geneva: 'GEN344', Vienna: 'V1E344' },
  'full-adjustable': { name: 'Full back plate, adjustable', words: 'full back plate, adjustable', about: ADJUSTABLE, Geneva: 'GEN337', Vienna: 'V1E337' },
  'h-plate': { name: 'H wall plate', words: 'H wall plate', about: 'A square plate, for a tighter space and a contemporary look.', Geneva: 'GENH037', Vienna: 'V1EH037' },
  'positive-close': { name: 'Positive close', words: 'positive close', about: POSITIVE, Vienna: 'V1E067' },
};

export const IN_LINE_HINGE_STYLES: Record<InLineHinge, HingeStyle> = {
  standard: { name: 'Standard', words: 'standard', about: 'CRL’s standard hinge between two panes.', Geneva: 'GEN180', Vienna: 'V1E180' },
  adjustable: { name: 'Adjustable', words: 'adjustable', about: ADJUSTABLE, Geneva: 'GEN380', Vienna: 'V1E380' },
  'positive-close': { name: 'Positive close', words: 'positive close', about: POSITIVE, Vienna: 'V1E780' },
};

/** Bellagio's one hinge for each way of hanging, and every range's hinge for a corner. */
const ONLY: Record<string, Partial<Record<HingeMount, string>>> = {
  Bellagio: { 'wall-to-glass': 'BEL344', 'glass-to-glass-180': 'BEL380', 'glass-to-glass-90': 'BEL392' },
  Geneva: { 'glass-to-glass-90': 'GEN092' },
  Vienna: { 'glass-to-glass-90': 'V1E092' },
};

/** The style of hinge for each way a door can hang. */
export interface HingeStyles {
  wall: WallHinge;
  inLine: InLineHinge;
}

/** What a company starts with until it chooses. */
export const STANDARD_HINGES: HingeStyles = { wall: 'offset', inLine: 'standard' };

/** The hinges a shower's doors take: its own choice for each, or the company's standard. */
export function hingeStylesOf(design: Pick<ConfiguratorState, 'wallHinge' | 'inLineHinge'>, standards: HingeStyles = STANDARD_HINGES): HingeStyles {
  return { wall: design.wallHinge ?? standards.wall, inLine: design.inLineHinge ?? standards.inLine };
}

export interface DoorHinge {
  /** CRL's number before the finish, such as GEN044. Null where the range makes no such hinge. */
  series: string | null;
  /** The style, where the range offers more than one: "offset back plate". */
  style: HingeStyle | null;
}

/** The hinge a door of a range takes, hanging the way it does, in the styles chosen. */
export function doorHingeOf(brand: string, mount: HingeMount, styles: HingeStyles): DoorHinge {
  const only = ONLY[brand]?.[mount];
  if (only) return { series: only, style: null };
  if (mount === 'glass-to-glass-90' || (brand !== 'Geneva' && brand !== 'Vienna')) return { series: null, style: null };
  const style = mount === 'wall-to-glass' ? WALL_HINGE_STYLES[styles.wall] : IN_LINE_HINGE_STYLES[styles.inLine];
  return { series: style[brand] ?? null, style };
}

/** How each door in a design hangs, from its panels alone: from a wall, or from the glass beside it. */
export function doorMountsOf(state: Pick<ConfiguratorState, 'panels' | 'junctions'>): HingeMount[] {
  return state.panels.flatMap((panel, i): HingeMount[] => {
    if (!panel.door) return [];
    const n = panel.door.hinge_side === 'left' ? i - 1 : i + 1;
    if (!state.panels[n]) return ['wall-to-glass'];
    return [state.junctions[Math.min(i, n)]?.angle_deg === 90 ? 'glass-to-glass-90' : 'glass-to-glass-180'];
  });
}
