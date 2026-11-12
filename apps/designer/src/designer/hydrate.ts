/**
 * A design from elsewhere, made whole for the screens: one saved in this
 * browser last week, or one a customer sent that staff are now changing.
 * Anything the design predates is filled in, so an older design still opens,
 * glass no longer on offer becomes the thickness a new design starts at, and
 * a hinge no longer on offer gives way to the company's standard.
 */

import { createInitialState, hydrateOpening, runWidthsMm, type ConfiguratorState } from '@setout/engine';
import { hingesOf, thicknessesOf, type DesignerConfig } from './config';

export function hydrateState(
  saved: ConfiguratorState,
  config: Pick<DesignerConfig, 'glassThicknessMm' | 'glassThicknesses' | 'hinges'>
): ConfiguratorState {
  const fresh = createInitialState(config.glassThicknessMm);
  const state: ConfiguratorState = { ...fresh, ...saved };
  if (!thicknessesOf(config).includes(state.glassThicknessMm)) state.glassThicknessMm = config.glassThicknessMm;
  const hinges = hingesOf(config);
  if (state.wallHinge && !hinges.wall.offered.includes(state.wallHinge)) delete state.wallHinge;
  if (state.inLineHinge && !hinges.inLine.offered.includes(state.inLineHinge)) delete state.inLineHinge;
  state.opening = hydrateOpening(saved.opening, runWidthsMm(state.panels, state.junctions));
  return state;
}
