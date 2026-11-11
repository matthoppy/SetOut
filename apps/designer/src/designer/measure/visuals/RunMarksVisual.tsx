/**
 * Marking the glass line on a run with no corner in it: a piece of masking
 * tape on the floor or the bath rim against the wall, another where the glass
 * stops or against the far wall, and the line drawn across each.
 */

import type { RunView } from '@setout/engine';
import { Caption, EndMark, FLOOR, Frame, RunGlassLine, RunRoom, runEnds } from './Scene';

export function RunMarksVisual({ view, glassTop }: { view: RunView; glassTop: number }) {
  const { left, right } = runEnds(view);
  const what = view.surface === 'bath' ? 'screen' : 'glass';
  return (
    <Frame label={`Two short pieces of masking tape where the ${what} will stand, each with a marker line on it`}>
      <RunRoom view={view} ceiling={false} />
      <EndMark view={view} side="left" animate />
      <EndMark view={view} side="right" animate />
      <g className="mw-appear">
        <RunGlassLine view={view} top={glassTop} lit />
        <Caption x={(left + right) / 2} y={FLOOR - 10} anchor="middle">
          the {what} line
        </Caption>
      </g>
    </Frame>
  );
}
