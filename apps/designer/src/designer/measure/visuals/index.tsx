import { readField, readingCards, runViews, type ConfiguratorState, type DeckOptions, type MeasureCardDef, type RunView } from '@setout/engine';
import { CrossReadingVisual } from './CrossReadingVisual';
import { HeightVisual } from './HeightVisual';
import { LaserOnVisual } from './LaserOnVisual';
import { LaserSetupVisual } from './LaserSetupVisual';
import { MarksVisual } from './MarksVisual';
import { PlanMarksVisual } from './PlanMarksVisual';
import { RunMarksVisual } from './RunMarksVisual';
import { RunHeightVisual } from './RunHeightVisual';
import { RunVisual, type DoneMark, type RunPicture } from './RunVisual';
import { FLOOR } from './Scene';
import { TrayHeight, TrayLaserOn, TrayReading, trayable } from './TrayVisual';

/** Where the top of the glass sits in the picture, from the real height. */
function glassTopFor(glassMm: number): number {
  return FLOOR - Math.max(110, Math.min(150, glassMm * 0.07));
}

const onRun = (card: MeasureCardDef): card is MeasureCardDef & { visual: RunPicture } => !!card.visual && 'view' in card.visual;

/**
 * The picture for a card, given the design as it stands: the number typed on
 * this card, and the readings already taken that belong on the same picture.
 */
export function CardPicture({ card, cards, state, options }: { card: MeasureCardDef; cards: MeasureCardDef[]; state: ConfiguratorState; options: DeckOptions }) {
  const visual = card.visual;
  if (!visual) return null;
  const value = card.field ? readField(state, card.field) : null;
  const glassTop = glassTopFor(card.field?.kind === 'height' ? (value ?? state.heightMm) : state.heightMm);
  const taken = readingCards(cards).filter((c) => c.id !== card.id && c.field && c.mark !== undefined && readField(state, c.field) !== null);

  // A single door is always between two walls and keeps its own pictures.
  const toCross = cards.some((c) => c.visual?.kind === 'cross-reading');
  // Every other shower is drawn on its tray, seen from the front and above,
  // except a screen on a bath, and a shape built by hand that the tray cannot show.
  const views = runViews(state, options);
  const tray = !toCross && !options.overBath && trayable(views);

  switch (visual.kind) {
    case 'marks':
      return toCross ? <MarksVisual /> : <RunMarksVisual view={runViews(state, options)[0]} glassTop={glassTop} />;
    case 'laser-setup':
      return <LaserSetupVisual toCeiling={visual.toCeiling} />;
    case 'cross-reading':
      return (
        <CrossReadingVisual
          point={visual.point}
          glassTop={glassTop}
          toCeiling={visual.toCeiling}
          value={value}
          done={taken.flatMap((c) => (c.visual?.kind === 'cross-reading' ? [c.visual.point] : []))}
        />
      );
    case 'height': {
      if (toCross) return <HeightVisual glassTop={glassTop} value={value} />;
      if (tray) return <TrayHeight views={views} value={value} what="glass" />;
      return <RunHeightVisual view={wallRun(views)} views={views} glassTop={glassTop} value={value} />;
    }
    case 'plan-marks':
      return <PlanMarksVisual views={runViews(state, options)} />;
    case 'laser-on': {
      if (tray) {
        // Where the first reading needs it: over a corner mark, if the glass turns one.
        const first = cards.find((c) => c.visual?.kind === 'run-width' && c.visual.laser);
        const corner = first?.visual?.kind === 'run-width' && first.visual.laser ? { run: first.visual.view.run, end: first.visual.laser } : null;
        return <TrayLaserOn views={views} corner={corner} />;
      }
      return <LaserOnVisual view={views.find((v) => v.faces === 'front') ?? views[0]} views={views} glassTop={glassTop} />;
    }
    default: {
      if (tray) {
        return <TrayReading visual={visual} views={views} value={value} mark={card.mark} />;
      }
      const done: DoneMark[] = taken.filter(onRun).flatMap((c) => (c.visual.view.run === visual.view.run ? [{ visual: c.visual, n: c.mark! }] : []));
      return <RunVisual visual={visual} views={runViews(state, options)} glassTop={glassTop} value={value} mark={card.mark} done={done} />;
    }
  }
}

/** The run a height is shown against: one that has a wall to carry the mark. */
function wallRun(views: RunView[]): RunView {
  return views.find((v) => v.left === 'wall') ?? views.find((v) => v.right === 'wall') ?? views[0];
}
