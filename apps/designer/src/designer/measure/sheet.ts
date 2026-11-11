import type { CSSProperties } from 'react';

/**
 * Where the measuring drawings wait to be turned into a picture: off screen,
 * at the width they are drawn for, in the light colours whatever the page's
 * theme, because the picture goes onto white.
 */
export const MEASURED_SHEET = {
  position: 'fixed',
  left: -10000,
  top: 0,
  width: 400,
  '--background': '0 0% 100%',
  '--foreground': '0 0% 20%',
  '--muted-foreground': '0 0% 40%',
  '--measure-accent': '210 50% 23%',
} as CSSProperties;
