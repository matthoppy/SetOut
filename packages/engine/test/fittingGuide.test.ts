/** The fitting guide for a customer's own fitter: this shower's own parts and sizes, in the order they go in. */
import { describe, expect, test } from 'vitest';
import { buildSpec, DEFAULT_RULESET, fittingGuideOf, fittingsOf, GUIDED_STEPS, type ConfiguratorState } from '../src';
import { GOLDEN_COMPANY, GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };

function guideFor(name: string, change: (state: ConfiguratorState) => void = () => {}) {
  const found = GOLDENS.find((g) => g.name === name);
  if (!found) throw new Error(`missing golden ${name}`);
  const state = structuredClone(found.document.design) as ConfiguratorState;
  change(state);
  const spec = buildSpec(state, context);
  const fittings = fittingsOf(state, spec, DEFAULT_RULESET.fixed);
  const guide = fittingGuideOf(state, spec, fittings);
  return { spec, fittings, steps: guide.steps, byHand: guide.byHand, problems: guide.problems };
}

const titles = (steps: { title: string }[]) => steps.map((s) => s.title);
const text = (steps: { lines: string[] }[]) => steps.flatMap((s) => s.lines).join('\n');

describe('the fitting guide', () => {
  test('a panel and door in channel: channel, then the fixed glass, then the door, its seals and silicone', () => {
    const { spec, fittings, steps } = guideFor('layout-alcove-panel-door');
    expect(titles(steps)).toEqual([
      'Before you start',
      'Mark out',
      'Fix the U-channel',
      'Stand the fixed panel',
      'Hang the door',
      'Fit the seals',
      'Silicone',
      'Final checks',
    ]);
    // Every channel cut, at its own length.
    const channel = steps.find((s) => s.title === 'Fix the U-channel')!;
    for (const cut of spec.channelCuts ?? []) expect(channel.lines[0]).toContain(`${cut.label}: ${cut.lengthMm}mm`);
    // The fixed pane and the door at their cut sizes.
    const fixed = spec.panels.find((p) => p.kind === 'fixed')!;
    const door = spec.panels.find((p) => p.kind === 'door')!;
    expect(text(steps)).toContain(`${fixed.cutWidthMm} × ${fixed.cutHeightMm}mm`);
    expect(text(steps)).toContain(`${door.cutWidthMm} × ${door.cutHeightMm}mm`);
    // Its hinges by count and make, and every seal by length.
    // Its hinges by count, range and style: the company's standard, an offset back plate.
    const hinges = fittings.find((f) => f.kind === 'hinges')!;
    expect(text(steps)).toContain(`${hinges.count} ${hinges.brand} offset back plate hinges`);
    for (const f of fittings) if (f.kind === 'seal' || f.kind === 'bottom-seal' || f.kind === 'threshold') expect(text(steps)).toContain(`${f.lengthMm}mm`);
    // The h seal keeps its lower case: a capital H is another seal.
    expect(text(steps)).toContain('h seal where');
    expect(text(steps)).not.toContain('H seal');
  });

  test('glass in clamps has no channel to cut', () => {
    const { steps } = guideFor('panel-door-clamps');
    expect(titles(steps)).toContain('Fix the clamps');
    expect(titles(steps)).not.toContain('Fix the U-channel');
    expect(text(steps)).toContain('in its clamps');
  });

  test('a walk-in has no door: nothing to hang, no seals, and no door checks', () => {
    const { steps } = guideFor('layout-walk-in');
    expect(titles(steps)).not.toContain('Hang the door');
    expect(titles(steps)).not.toContain('Fit the seals');
    expect(text(steps)).not.toMatch(/door/i);
  });

  test('a door hung from the glass beside it clamps through both panes, and says which way it swings', () => {
    const { steps } = guideFor('panel-door-hinged-off-glass-both-ways');
    const hang = steps.find((s) => s.title === 'Hang the door')!;
    expect(hang.lines.join(' ')).toContain('hung from the glass beside it, in line, on 2');
    expect(hang.lines.join(' ')).toContain('clamp through the holes');
    expect(hang.lines.join(' ')).toContain('opens both ways');
  });

  test('a pre-set hinge closes onto its seal, not square', () => {
    const { steps } = guideFor('layout-alcove-panel-door', (s) => (s.wallHinge = 'offset-preset'));
    const hang = steps.find((s) => s.title === 'Hang the door')!.lines.join(' ');
    expect(hang).toContain('offset back plate, 5° pre-set hinges');
    expect(hang).toContain('5° further into the shower');
    expect(hang).toContain('closes onto its seal');
    expect(hang).not.toContain('closes square');
  });

  test('an adjustable hinge is set once the door is hung', () => {
    const { steps } = guideFor('layout-alcove-panel-door', (s) => (s.wallHinge = 'full-adjustable'));
    const hang = steps.find((s) => s.title === 'Hang the door')!.lines.join(' ');
    expect(hang).toContain('full back plate, adjustable hinges');
    expect(hang).toContain("hinges' own adjustment");
  });

  test('a hinge from a range with one style is named by its range alone', () => {
    const { steps, fittings } = guideFor('door-to-ceiling-40-gap');
    const hinges = fittings.find((f) => f.kind === 'hinges')!;
    expect(hinges.brand).toBe('Bellagio');
    expect(text(steps)).toContain(`${hinges.count} Bellagio hinges`);
  });

  test('hardware a range fits its own way says so, and a hinge the range does not make is a problem', () => {
    // The range follows the door's size and weight: a Vienna door, as its fittings would have it.
    const found = guideFor('layout-alcove-panel-door', (s) => (s.viennaCutout = 'rectangular'));
    const state = structuredClone(GOLDENS.find((g) => g.name === 'layout-alcove-panel-door')!.document.design) as ConfiguratorState;
    state.viennaCutout = 'rectangular';
    const vienna = fittingGuideOf(state, found.spec, found.fittings.map((f) => (f.kind === 'hinges' ? { ...f, brand: 'Vienna' } : f)));
    expect(text(vienna.steps)).toContain('take the two screws out of each hinge');
    expect(vienna.problems).toEqual([]);
    const geneva = guideFor('layout-alcove-panel-door', (s) => (s.wallHinge = 'positive-close'));
    expect(geneva.problems[0]).toContain('Geneva makes no positive close hinge');
  });

  test('a glass transom is fitted as the comments say, and is named as worked out by hand', () => {
    const glass = guideFor('panel-door-to-ceiling-transom-glass');
    expect(titles(glass.steps)).toContain('Fit the glass over the door');
    expect(glass.byHand).toEqual(['the glass over the door']);
    const open = guideFor('panel-door-to-ceiling-transom-open');
    expect(titles(open.steps)).toContain('Fix the top of the glass');
    expect(open.byHand).toHaveLength(1);
    expect(guideFor('layout-alcove-panel-door').byHand).toEqual([]);
  });

  test('every known design gets a guide that starts with the checks and ends with the final checks', () => {
    for (const golden of GOLDENS) {
      const state = structuredClone(golden.document.design) as ConfiguratorState;
      const spec = buildSpec(state, context);
      if (spec.blockingIssues.length > 0) continue;
      const fittings = fittingsOf(state, spec, DEFAULT_RULESET.fixed);
      const { steps } = fittingGuideOf(state, spec, fittings);
      expect(steps[0].title, golden.name).toBe('Before you start');
      // Every part the shower takes has its step: none is left out.
      for (const f of fittings) {
        const step = GUIDED_STEPS[f.kind];
        expect(
          steps.some((s) => s.title === step || s.title.startsWith(`${step} `) || (step === 'Hang the door' && s.title.startsWith('Hang the'))),
          `${golden.name}: ${f.kind}`
        ).toBe(true);
      }
      expect(steps[steps.length - 1].title, golden.name).toBe('Final checks');
      for (const step of steps) expect(step.lines.length, `${golden.name}: ${step.title}`).toBeGreaterThan(0);
      // No size is missing from a sentence.
      expect(text(steps), golden.name).not.toMatch(/undefined|NaN/);
    }
  });
});
