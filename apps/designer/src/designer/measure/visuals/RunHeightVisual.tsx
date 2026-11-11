/**
 * The glass height on a shower of any shape: a piece of tape on the wall with
 * the top of the glass marked on it, and the tape measure hooked on the floor
 * or the bath rim, read up at the mark.
 */

import type { RunView } from '@setout/engine';
import { Caption, EndMark, FLOOR, Frame, PlanInset, RunGlassLine, RunRoom, TapeMeasure, WallMark, runEnds } from './Scene';

export function RunHeightVisual({ view, views, glassTop, value }: { view: RunView; views: RunView[]; glassTop: number; value: number | null }) {
  const { left, right } = runEnds(view);
  // The mark goes on a wall, so the tape stands beside whichever side has one.
  const side = view.left === 'wall' || view.right !== 'wall' ? 'left' : 'right';
  const x = side === 'left' ? left + 18 : right - 18;
  const what = view.surface === 'bath' ? 'screen' : 'glass';
  return (
    <Frame label={`A marker line on tape stuck to the wall at the height of the ${what}, and a tape measure reading up to it`}>
      <RunRoom view={view} ceiling={false} />
      <EndMark view={view} side="left" />
      <EndMark view={view} side="right" />
      <RunGlassLine view={view} top={glassTop} />
      {view.left === 'wall' && <WallMark side="left" y={glassTop} />}
      {view.right === 'wall' && <WallMark side="right" y={glassTop} />}
      <line x1={left + 12} y1={glassTop} x2={right - 12} y2={glassTop} stroke="hsl(var(--measure-accent))" strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
      <TapeMeasure x1={x} y1={glassTop} x2={x} y2={FLOOR} value={value === null ? '?' : `${value}mm`} labelSide={side === 'left' ? 'after' : 'before'} />
      <g className="mw-appear">
        <Caption x={(left + right) / 2 + 20} y={glassTop - 8} anchor="middle">
          top of the {what}
        </Caption>
      </g>
      <PlanInset view={view} views={views} />
    </Frame>
  );
}
