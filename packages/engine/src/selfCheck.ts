/**
 * One known design, worked out here and now.
 *
 * A health check calls this to show that the engine inside this very bundle,
 * in this browser tab or on this server, gives the known answer. The designer,
 * the workspace and the API each report it, so all three can be seen to agree.
 */

import { designFromTemplate } from './document';
import { DEFAULT_RULESET } from './ruleset';
import { buildSpec } from './spec';

/** A 400 panel and a 700 door, 2000 high, in channel, in 10mm glass. */
const REFERENCE_LAYOUT = 'alcove-panel-door';
const KNOWN_CUT_SIZES = '390 x 1995, 690 x 1980';

export interface SelfCheck {
  ok: boolean;
  /** What this engine cut the reference design to. */
  cutSizes: string;
  expected: string;
}

export function selfCheck(): SelfCheck {
  let cutSizes: string;
  try {
    const spec = buildSpec(designFromTemplate(REFERENCE_LAYOUT), {
      rules: DEFAULT_RULESET,
      companyName: 'SetOut',
    });
    cutSizes = spec.panels.map((p) => `${p.cutWidthMm} x ${p.cutHeightMm}`).join(', ');
  } catch (error) {
    cutSizes = `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  return { ok: cutSizes === KNOWN_CUT_SIZES, cutSizes, expected: KNOWN_CUT_SIZES };
}
