import type { CardVisual } from '@setout/engine';
import { CrossReadingVisual } from './CrossReadingVisual';
import { HeightVisual } from './HeightVisual';
import { LaserSetupVisual } from './LaserSetupVisual';
import { MarksVisual } from './MarksVisual';
import { FLOOR } from './Scene';

/** Where the top of the glass sits in the picture, from the real height. */
function glassTopFor(glassMm: number): number {
  return FLOOR - Math.max(110, Math.min(150, glassMm * 0.07));
}

/** The picture for a card, given what has been typed and what is done. */
export function CardPicture({ visual, value, done, glassMm }: { visual: CardVisual; value: number | null; done: number[]; glassMm: number }) {
  switch (visual.kind) {
    case 'marks':
      return <MarksVisual />;
    case 'laser-setup':
      return <LaserSetupVisual toCeiling={visual.toCeiling} />;
    case 'cross-reading':
      return <CrossReadingVisual point={visual.point} glassTop={glassTopFor(glassMm)} toCeiling={visual.toCeiling} value={value} done={done} />;
    case 'height':
      return <HeightVisual glassTop={glassTopFor(value ?? glassMm)} value={value} />;
  }
}
