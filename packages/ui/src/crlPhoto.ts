/**
 * Where CRL's product photos are served from.
 *
 * They are built into the designer's static files once
 * (apps/designer/public/assets/crl, made by scripts/crl-photos.mjs) and come
 * straight from storage under /designer/assets/, which the Worker leaves alone
 * on every address. So the designer, the editor staff change a design in and
 * the workspace all show the same files from the same path.
 */
export const crlPhotoSrc = (file: string): string => `/designer/assets/crl/${file}.webp`;
