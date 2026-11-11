/**
 * A design from elsewhere, made whole for the screens: one saved in this
 * browser last week, or one a customer sent that staff are now changing.
 * Anything the design predates is filled in, so an older design still opens.
 */

import { createInitialState, hydrateOpening, runWidthsMm, type ConfiguratorState } from '@setout/engine';
import type { DesignerConfig } from './config';

export function hydrateState(saved: ConfiguratorState, config: Pick<DesignerConfig, 'glassThicknessMm'>): ConfiguratorState {
  const fresh = createInitialState(config.glassThicknessMm);
  const state: ConfiguratorState = { ...fresh, ...saved };
  state.opening = hydrateOpening(saved.opening, runWidthsMm(state.panels, state.junctions));
  return state;
}
