/**
 * A design from elsewhere, made whole for the screens: one saved in this
 * browser last week, or one a customer sent that staff are now changing.
 * Anything the design predates is filled in, so an older design still opens,
 * and glass no longer on offer becomes the thickness a new design starts at.
 */

import { createInitialState, hydrateOpening, runWidthsMm, type ConfiguratorState } from '@setout/engine';
import { thicknessesOf, type DesignerConfig } from './config';

export function hydrateState(saved: ConfiguratorState, config: Pick<DesignerConfig, 'glassThicknessMm' | 'glassThicknesses'>): ConfiguratorState {
  const fresh = createInitialState(config.glassThicknessMm);
  const state: ConfiguratorState = { ...fresh, ...saved };
  if (!thicknessesOf(config).includes(state.glassThicknessMm)) state.glassThicknessMm = config.glassThicknessMm;
  state.opening = hydrateOpening(saved.opening, runWidthsMm(state.panels, state.junctions));
  return state;
}
