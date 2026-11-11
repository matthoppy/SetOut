import type { DesignerBrand } from '../designer/config';

/** A CSS colour as the "H S% L%" triplet the theme's variables hold, or null. */
function hslTriplet(colour: string): string | null {
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return `${h} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Put the company's colour on the designer's buttons and accents.
 *
 * Only hex colours are taken. Anything else leaves the default in place, so
 * a mistyped colour in a company's settings cannot break the page.
 */
export function applyBrand(brand: DesignerBrand): void {
  const root = document.documentElement.style;
  const primary = hslTriplet(brand.primary);
  const foreground = hslTriplet(brand.primaryForeground);
  if (primary) {
    root.setProperty('--primary', primary);
    root.setProperty('--ring', primary);
  }
  if (foreground) root.setProperty('--primary-foreground', foreground);
}
