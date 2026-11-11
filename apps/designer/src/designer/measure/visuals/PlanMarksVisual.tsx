/**
 * Marking the glass line on a shower with a corner or an open end: seen from
 * above, a piece of masking tape against each wall, at each corner and where
 * the glass stops, with the glass line drawn across it.
 */

import type { RunView } from '@setout/engine';
import { Caption, Frame, Plan, VB, planRuns } from './Scene';

export function PlanMarksVisual({ views }: { views: RunView[] }) {
  const box = { x: 80, y: 44, w: 160, h: 124 };
  const front = planRuns(views, box).find((r) => r.view.faces === 'front');
  return (
    <Frame label="Your shower from above, with a piece of masking tape at each end of the glass and at each corner, and the glass line drawn on it">
      <Plan views={views} box={box} marks weight={2.4} />
      <g className="mw-appear">
        <Caption x={front ? (front.x1 + front.x2) / 2 : VB.w / 2} y={(front?.y1 ?? box.y + box.h) + 26} anchor="middle">
          the glass line, from above
        </Caption>
      </g>
    </Frame>
  );
}
