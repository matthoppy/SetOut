/**
 * Photos the customer attaches to an enquiry.
 *
 * Two kinds, both landing in the same list:
 *
 *  - one tied to a measurement, taken on the spot to show the tape in place
 *  - loose photos of the room added at the end
 *
 * The first kind is worth more. A number on its own cannot be checked by
 * anyone; a number with a photo of the tape against the wall can be, and the
 * customer is carrying the measurements for this job, so being able to check
 * them matters more here than it would if a fitter had taken them.
 */

/**
 * Which measurement a photo backs up, or 'extra' for a loose one.
 *
 * The width slot carries a run index, because a corner shower is measured one
 * straight run at a time and each has its own width at the floor.
 */
export type PhotoSlot =
  | 'height'
  | `width-floor-${number}`
  | 'walls'
  | 'floor'
  | 'extra';

export interface Photo {
  id: string;
  slot: PhotoSlot;
  /** Object URL for the thumbnail. Revoked when the photo is removed. */
  previewUrl: string;
  filename: string;
  /** Base64 JPEG, no data: prefix. */
  content: string;
}

/** Long edge, in pixels. Enough to read a tape, small enough to email. */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.75;

/** How many loose photos the review step accepts on top of the measurement ones. */
export const MAX_EXTRA_PHOTOS = 4;

/** The run a width slot refers to, 1-based, or null for the others. */
function slotRunNumber(slot: PhotoSlot): number | null {
  const match = /-(\d+)$/.exec(slot);
  return match ? Number(match[1]) + 1 : null;
}

/** Names the workshop can read without opening them. */
export function slotFilename(slot: PhotoSlot): string {
  const run = slotRunNumber(slot);
  const suffix = run === null ? '' : `-run${run}`;
  if (slot.startsWith('width-floor')) return `measured-width-at-floor${suffix}`;
  if (slot === 'height') return 'measured-height';
  if (slot === 'walls') return 'measured-wall-lean';
  if (slot === 'floor') return 'measured-floor-level';
  return 'photo';
}

/** How each is introduced to a reader. */
export function slotLabel(slot: PhotoSlot): string {
  const run = slotRunNumber(slot);
  const suffix = run === null ? '' : ` (run ${run})`;
  if (slot.startsWith('width-floor')) return `Width at the floor${suffix}`;
  if (slot === 'height') return 'Height';
  if (slot === 'walls') return 'Wall lean';
  if (slot === 'floor') return 'Floor level';
  return 'The opening';
}

/**
 * The order attachments are sent in: every measurement photo, in the order
 * the customer was asked for it, then loose shots of the room.
 */
export function slotSortKey(slot: PhotoSlot): number {
  const run = slotRunNumber(slot) ?? 0;
  if (slot === 'height') return 0;
  if (slot.startsWith('width-floor')) return 1 + run;
  if (slot === 'walls') return 1000;
  if (slot === 'floor') return 1001;
  return 2000;
}

/**
 * Downscale and re-encode in the browser.
 *
 * Returns null rather than throwing on an unreadable file — a photo that will
 * not load is a reason to carry on without it, never a reason to lose the
 * enquiry the customer has just spent ten minutes on.
 */
export async function toDownscaledJpeg(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1] ?? null;
  } catch {
    return null;
  }
}

/** Build a Photo from a file, or null if the image could not be read. */
export async function createPhoto(
  file: File,
  slot: PhotoSlot,
  index = 1
): Promise<Photo | null> {
  const content = await toDownscaledJpeg(file);
  if (!content) return null;
  return {
    id: `${slot}-${Date.now()}-${index}`,
    slot,
    previewUrl: URL.createObjectURL(file),
    filename: `${slotFilename(slot)}${slot === 'extra' ? `-${index}` : ''}.jpg`,
    content,
  };
}

/** Free the thumbnail's object URL. Safe to call on an already-revoked one. */
export function releasePhoto(photo: Photo | undefined) {
  if (photo) URL.revokeObjectURL(photo.previewUrl);
}
