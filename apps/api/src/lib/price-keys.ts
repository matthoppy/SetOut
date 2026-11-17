/**
 * What each line of a quote is the price of, as a key: the key a new quote
 * looks its price up by, and the key the price book lists the price under.
 * Both are made here, so they always agree.
 *
 * A key names the thing and, for hardware, its finish: glass:10:clear,
 * hinge:gen044:chrome, handle:pull:matte-black.
 */

/** A notch cut in the glass. A mouse-ear hinge notch is a notch and two holes. */
export const NOTCH_KEY = 'cutout:notch';
/** A hole drilled in the glass. */
export const HOLE_KEY = 'cutout:hole';
/** Survey and fitting, once a job. A supply-only company never prices it, and its quotes leave it off. */
export const FITTING_KEY = 'fitting';
/** Delivery, once a job, added to a quote by hand. */
export const DELIVERY_KEY = 'delivery';

/** Glass by the square metre, by its thickness, type and coating: glass:10:clear, glass:10:low-iron:easy-clean. */
export const glassKey = (thicknessMm: number, type: string, coating?: string) => `glass:${thicknessMm}:${type}${coating === 'easy-clean' ? ':easy-clean' : ''}`;

/**
 * A hinge in a finish, by CRL's number for it: hinge:gen044:chrome. Where a
 * range makes no hinge in the style chosen, the range's name stands in.
 */
export const hingeKey = (seriesOrRange: string, finishId: string) => `hinge:${seriesOrRange.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${finishId}`;

export const handleKey = (handleId: string, finishId: string) => `handle:${handleId}:${finishId}`;

/** One of CRL's sliding door kits in a finish: sliding-kit:ser78:chrome. */
export const slidingKitKey = (kit: string, finishId: string) => `sliding-kit:${kit.toLowerCase()}:${finishId}`;

/** U-channel by the metre. */
export const channelKey = (finishId: string) => `channel:${finishId}`;

/** A shower's set of glass clamps. */
export const clampsKey = (finishId: string) => `clamps:${finishId}`;
