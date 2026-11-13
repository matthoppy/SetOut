/**
 * A design from elsewhere, made whole for the screens: one saved in this
 * browser last week, or one a customer sent that staff are now changing.
 * Anything the design predates is filled in, so an older design still opens,
 * glass no longer on offer becomes the thickness a new design starts at, and
 * a hinge, fixing, glass type or coating no longer on offer gives way to the
 * company's standard.
 */

import { createInitialState, hydrateOpening, runWidthsMm, type ConfiguratorState } from '@setout/engine';
import { choicesOf, hingesOf, thicknessesOf, type DesignerConfig } from './config';

export function hydrateState(
  saved: ConfiguratorState,
  config: Pick<DesignerConfig, 'glassThicknessMm' | 'glassThicknesses' | 'hinges' | 'fixing' | 'glassTypes' | 'coatings'>
): ConfiguratorState {
  const fresh = createInitialState(config.glassThicknessMm);
  const state: ConfiguratorState = { ...fresh, ...saved };
  if (!thicknessesOf(config).includes(state.glassThicknessMm)) state.glassThicknessMm = config.glassThicknessMm;
  const hinges = hingesOf(config);
  if (state.wallHinge && !hinges.wall.offered.includes(state.wallHinge)) delete state.wallHinge;
  if (state.inLineHinge && !hinges.inLine.offered.includes(state.inLineHinge)) delete state.inLineHinge;
  const { fixing, glassTypes, coatings } = choicesOf(config);
  if (!fixing.offered.includes(state.mounting)) state.mounting = fixing.standard;
  if (!glassTypes.offered.includes(state.glassType)) state.glassType = glassTypes.standard;
  if (!coatings.offered.includes(state.glassCoating)) state.glassCoating = coatings.standard;
  state.opening = hydrateOpening(saved.opening, runWidthsMm(state.panels, state.junctions));
  return state;
}
