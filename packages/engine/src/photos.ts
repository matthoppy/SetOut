/**
 * CRL's product photos: which one to show for a hinge or a handle.
 *
 * The photos are CRL's own, from Matt's copy of its catalogue, kept for every
 * hinge SetOut names and every pull handle and knob (crl-photos.ts). A photo
 * is looked up by catalogue number, in the shower's finish where CRL lists the
 * part in it and in polished chrome otherwise. CRL photographs most parts
 * once, in whichever finish it chose, and shows that photo for every finish:
 * so a photo shows the part's shape, and nothing here says which finish it is
 * pictured in.
 *
 * Where there is no photo the answer is null, and nothing is shown.
 */

import { CRL_FINISHES } from './crl';
import { CRL_PHOTOS } from './crl-photos';
import type { HingeStyle } from './hinges';

export interface CrlPhoto {
  /** The photo's file, without its folder or ending. */
  file: string;
  /** The catalogue number it was found under, such as GEN044CH. */
  code: string;
}

let photos: Map<string, string> | null = null;

function byCode(): Map<string, string> {
  if (photos) return photos;
  photos = new Map();
  for (const line of CRL_PHOTOS.split('\n')) {
    const [file, ...codes] = line.split(' ').filter(Boolean);
    if (file) for (const code of codes) photos.set(code, file);
  }
  return photos;
}

/** The photo CRL shows for a full catalogue number, such as GEN044CH. */
export function crlPhotoOf(code: string): CrlPhoto | null {
  const file = byCode().get(code);
  return file ? { file, code } : null;
}

/**
 * The photo of a part made in finishes, from its number before the finish:
 * in the finish given where CRL lists it, otherwise in polished chrome,
 * otherwise in the first of CRL's finishes it is listed in at all (a few
 * hinges come only in matte black or brushed nickel).
 */
export function crlPhotoInFinish(series: string, finishCode: string | null): CrlPhoto | null {
  for (const finish of [finishCode, 'CH', ...CRL_FINISHES.map((f) => f.code)]) {
    const photo = finish ? crlPhotoOf(series + finish) : null;
    if (photo) return photo;
  }
  return null;
}

export interface HingePhoto extends CrlPhoto {
  /** The range pictured: the door's own where it makes the style, otherwise the one that does. */
  range: 'Geneva' | 'Vienna';
}

/**
 * The photo for a style of hinge: the one from the range the door hangs on
 * where that range makes the style, otherwise from the range that does.
 * Give no range where no door is in mind, as in a company's settings.
 */
export function hingePhotoOf(style: HingeStyle, range: string | null, finishCode: string | null): HingePhoto | null {
  const ranges = (['Geneva', 'Vienna'] as const).filter((r) => style[r]);
  for (const r of [...ranges.filter((r) => r === range), ...ranges.filter((r) => r !== range)]) {
    const photo = crlPhotoInFinish(style[r]!, finishCode);
    if (photo) return { ...photo, range: r };
  }
  return null;
}

/**
 * The photo for a handle, from the CRL number its company has set: without
 * its finish, such as BM8X8, or whole where CRL makes it in one finish only.
 * A handle with no number has no photo.
 */
export function handlePhotoOf(handleCode: string | null | undefined, finishCode: string | null): CrlPhoto | null {
  if (!handleCode) return null;
  return crlPhotoOf(handleCode) ?? crlPhotoInFinish(handleCode, finishCode);
}
