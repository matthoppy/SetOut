/** Which of CRL's hinges each door hangs on: chosen for the shower, or the company's standard. */
import { describe, expect, test } from 'vitest';
import {
  applyTemplate,
  buildSpec,
  createInitialState,
  DEFAULT_RULESET,
  doorHingeOf,
  doorMountsOf,
  hingeMountOf,
  hingeStylesOf,
  STANDARD_HINGES,
  TEMPLATES,
} from '../src';
import { GOLDEN_COMPANY, GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };

describe('how each door hangs', () => {
  test.each([...TEMPLATES.map((t) => [t.id, applyTemplate(createInitialState(10), t)] as const), ...GOLDENS.map((g) => [g.name, g.document.design] as const)])(
    '%s: worked out from the panels alone, as the cut list works it out',
    (_name, state) => {
      const spec = buildSpec(state, context);
      const fromSpec = spec.panels.flatMap((p, i) => (p.door ? [hingeMountOf(state, spec, i)] : []));
      expect(doorMountsOf(state)).toEqual(fromSpec);
    }
  );
});

describe('the hinges a shower takes', () => {
  test('the company standard, unless the shower has its own', () => {
    expect(hingeStylesOf({}, STANDARD_HINGES)).toEqual({ wall: 'offset', inLine: 'standard' });
    expect(hingeStylesOf({}, { wall: 'full', inLine: 'adjustable' })).toEqual({ wall: 'full', inLine: 'adjustable' });
    expect(hingeStylesOf({ wallHinge: 'short' }, { wall: 'full', inLine: 'adjustable' })).toEqual({ wall: 'short', inLine: 'adjustable' });
  });

  test('a style is named where the range has more than one', () => {
    expect(doorHingeOf('Geneva', 'wall-to-glass', { wall: 'full', inLine: 'standard' })).toMatchObject({ series: 'GEN037', style: { words: 'full back plate' } });
    expect(doorHingeOf('Bellagio', 'wall-to-glass', { wall: 'full', inLine: 'standard' })).toEqual({ series: 'BEL344', style: null });
    expect(doorHingeOf('Vienna', 'glass-to-glass-90', STANDARD_HINGES)).toEqual({ series: 'V1E092', style: null });
    expect(doorHingeOf('Geneva', 'glass-to-glass-180', { wall: 'offset', inLine: 'positive-close' })).toMatchObject({ series: null, style: { words: 'positive close' } });
  });
});
