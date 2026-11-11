/**
 * The company's rules, for every screen that works something out.
 *
 * The designer computes with the same rules the server will use, so what the
 * customer sees on the review screen is what the company receives. The server
 * still runs the engine again and keeps its own answer.
 */
import { DEFAULT_RULESET, type EngineContext } from '@setout/engine';
import { createContext, useContext } from 'react';

const Engine = createContext<EngineContext>({ rules: DEFAULT_RULESET, companyName: 'SetOut' });

export const EngineProvider = Engine.Provider;

export function useEngine(): EngineContext {
  return useContext(Engine);
}
