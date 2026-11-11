/**
 * The laser on its tripod with both lines on, in front of the first run it
 * will be used on. Each card after this says where it stands.
 */

import type { RunView } from '@setout/engine';
import { CX, Caption, EndMark, Frame, LEVEL, LaserLines, PlanInset, RunGlassLine, RunRoom, Tripod, runEnds } from './Scene';

export function LaserOnVisual({ view, views, glassTop }: { view: RunView; views: RunView[]; glassTop: number }) {
  const { left, right } = runEnds(view);
  return (
    <Frame label="A laser on a small tripod with a level line and an up-and-down line switched on">
      <RunRoom view={view} ceiling={false} />
      <EndMark view={view} side="left" />
      <EndMark view={view} side="right" />
      <RunGlassLine view={view} top={glassTop} />
      <LaserLines ceiling={false} vertical="draw" level="draw" left={view.left === 'wall' ? left : 0} right={view.right === 'wall' ? right : 320} />
      <Tripod />
      <g className="mw-appear">
        <Caption x={CX + 8} y={16}>
          up-and-down line
        </Caption>
        <Caption x={Math.min(right, 290) - 6} y={LEVEL - 8} anchor="end">
          level line
        </Caption>
      </g>
      <PlanInset view={view} views={views} />
    </Frame>
  );
}
