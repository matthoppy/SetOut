/**
 * Rules are an input. The same design, made by two companies with different
 * rules, comes out at different sizes, and nothing a company may not change
 * can be changed.
 */
import { describe, expect, test } from 'vitest';
import {
  ADJUSTABLE,
  buildSpec,
  DEFAULT_MAKING_RULES,
  DEFAULT_RULESET,
  designFromTemplate,
  FIXED_RULES,
  resolveRuleset,
  RulesetError,
  type AdjustableRule,
  type EngineContext,
} from '../src';

const company = (name: string, overrides = {}): EngineContext => ({
  rules: resolveRuleset(overrides),
  companyName: name,
});

const at = (root: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], root);

/** Every number in the making rules, by its dotted name. */
function numberPaths(node: unknown, prefix = ''): string[] {
  if (typeof node === 'number') return [prefix];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, child]) =>
    numberPaths(child, prefix ? `${prefix}.${key}` : key)
  );
}

describe('the default ruleset', () => {
  test('with no overrides is SetOut’s defaults', () => {
    expect(resolveRuleset()).toEqual(DEFAULT_RULESET);
    expect(resolveRuleset({})).toEqual(DEFAULT_RULESET);
  });

  test('is not changed by a company’s overrides', () => {
    const before = structuredClone(DEFAULT_MAKING_RULES);
    const theirs = resolveRuleset({ 'deductions.door.outOnlyMm': 7 });
    expect(theirs.making.deductions.door.outOnlyMm).toBe(7);
    expect(DEFAULT_MAKING_RULES).toEqual(before);
    expect(resolveRuleset().making.deductions.door.outOnlyMm).toBe(5);
  });

  test('every making rule can be adjusted, and every adjustable rule exists', () => {
    expect(numberPaths(DEFAULT_MAKING_RULES).sort()).toEqual(Object.keys(ADJUSTABLE).sort());
  });

  test('every default is inside its own bounds', () => {
    for (const [rule, bounds] of Object.entries(ADJUSTABLE)) {
      const value = at(DEFAULT_MAKING_RULES, rule) as number;
      if ('oneOf' in bounds) expect(bounds.oneOf, rule).toContain(value);
      else {
        expect(value, rule).toBeGreaterThanOrEqual(bounds.min);
        expect(value, rule).toBeLessThanOrEqual(bounds.max);
      }
    }
  });
});

describe('two companies, one design', () => {
  const door = designFromTemplate('alcove-door');
  const corner = designFromTemplate('corner-door-return');

  test('a different door clearance gives a different door', () => {
    const ours = buildSpec(door, company('Custom Showers'));
    const theirs = buildSpec(door, company('Brennan Glass', { 'deductions.door.outOnlyMm': 7 }));
    expect(ours.panels[0].cutWidthMm).toBe(685);
    expect(theirs.panels[0].cutWidthMm).toBe(683);
    expect(theirs.panels[0].cutHeightMm).toBe(ours.panels[0].cutHeightMm);
  });

  test('a different channel allowance changes the height of every panel', () => {
    const theirs = buildSpec(corner, company('Brennan Glass', { 'deductions.channel.verticalMm': 8 }));
    expect(theirs.panels.map((p) => p.cutHeightMm)).toEqual([1984, 1984]);
  });

  test('a 1mm silicone joint takes 11mm off the return, not 12', () => {
    const ours = buildSpec(corner, company('Custom Showers'));
    const theirs = buildSpec(corner, company('Brennan Glass', { 'glass.siliconeJointMm': 1 }));
    expect(ours.panels[0].cutWidthMm).toBe(778);
    expect(theirs.panels[0].cutWidthMm).toBe(779);
  });

  test('glass in a channel sits half way into it, so it loses 10mm at each wall', () => {
    const spec = buildSpec(designFromTemplate('alcove-panel-door'), company('Custom Showers'));
    expect(spec.panels[0].deductions.horizontal.breakdown).toEqual(['Left wall channel: -10mm']);
    expect(spec.panels[0].cutWidthMm).toBe(390);
  });

  test('a door at a wall is not in the channel, so it keeps its own 5mm gap', () => {
    const ours = buildSpec(door, company('Custom Showers'));
    expect(ours.panels[0].deductions.horizontal.breakdown).toEqual([
      'Left wall, door gap: -5mm',
      'Right wall, door gap: -5mm',
    ]);
    const deeper = buildSpec(door, company('Brennan Glass', { 'deductions.channel.horizontalMm': 12 }));
    expect(deeper.panels[0].cutWidthMm).toBe(ours.panels[0].cutWidthMm);
    const wider = buildSpec(door, company('Brennan Glass', { 'deductions.door.wallMm': 7 }));
    expect(wider.panels[0].cutWidthMm).toBe(ours.panels[0].cutWidthMm - 4);
  });

  test('on clamps, glass at a wall loses 3mm for the silicone down the wall', () => {
    const spec = buildSpec({ ...designFromTemplate('alcove-panel-door'), mounting: 'clamps' }, company('Custom Showers'));
    expect(spec.panels[0].deductions.horizontal.breakdown).toEqual(['Left clamps: -3mm']);
    expect(spec.panels[0].cutWidthMm).toBe(397);
  });

  test('a company that makes in 8mm is not warned about 8mm', () => {
    const design = designFromTemplate('alcove-door', 8);
    const ours = buildSpec(design, company('Custom Showers'));
    const theirs = buildSpec(design, company('Brennan Glass', { 'glass.standardThicknessMm': 8 }));
    expect(ours.warnings.some((w) => w.includes('is a special'))).toBe(true);
    expect(theirs.warnings.some((w) => w.includes('is a special'))).toBe(false);
  });

  test('glass a company offers its customers is not a special, whichever a new design starts at', () => {
    const offers = { ...company('Custom Showers'), glassThicknessesMm: [8, 10, 12] };
    for (const thickness of [8, 10, 12] as const) {
      const spec = buildSpec(designFromTemplate('alcove-door', thickness), offers);
      expect(spec.warnings.some((w) => w.includes('is a special'))).toBe(false);
    }
  });

  test('glass a company does not offer is a special, said against what it does offer', () => {
    const spec = buildSpec(designFromTemplate('alcove-door', 12), { ...company('Custom Showers'), glassThicknessesMm: [8, 10] });
    expect(spec.warnings).toContain(
      'Glass: 12mm glass is a special — Custom Showers offers 8mm and 10mm. Seals, gaskets and channel are all thickness-specific, so the whole hardware list changes with it.'
    );
  });

  test('review notes name the company the customer is dealing with', () => {
    const tall = { ...designFromTemplate('alcove-panel-door'), heightMm: 2300 };
    const theirs = buildSpec(tall, company('Brennan Glass'));
    const notes = theirs.warnings.join('\n');
    expect(notes).toContain('Brennan Glass will check');
    expect(notes).not.toContain('Custom Showers');
  });

  test('a company’s own door limit is the one that blocks', () => {
    const design = designFromTemplate('alcove-door');
    design.panels[0].width_mm = 900;
    const ours = buildSpec(design, company('Custom Showers'));
    const theirs = buildSpec(design, company('Brennan Glass', { 'limits.maxDoorWidthMm': 800 }));
    expect(ours.blockingIssues).toEqual([]);
    expect(theirs.blockingIssues.join(' ')).toContain('800mm is the widest');
  });
});

describe('what a company may not do', () => {
  const refused = (overrides: unknown, rule?: string) => {
    let error: unknown;
    try {
      resolveRuleset(overrides);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RulesetError);
    if (rule !== undefined) expect((error as RulesetError).rule).toBe(rule);
  };

  test('change a hinge rating, a fabrication limit or hardware geometry', () => {
    refused({ 'hinges.offsetMm': 200 }, 'hinges.offsetMm');
    refused({ 'fixed.hinges.offsetMm': 200 }, 'fixed.hinges.offsetMm');
    refused({ 'limits.maxDoorHeightMm': 3000 }, 'limits.maxDoorHeightMm');
    refused({ 'limits.minPanelWidthWithCutoutsMm': 50 });
    refused({ glassDensityKgPerM2PerMm: 1 });
    expect(resolveRuleset({ 'limits.maxDoorWidthMm': 900 }).fixed).toBe(FIXED_RULES);
  });

  test('go outside a rule’s bounds', () => {
    refused({ 'deductions.door.outOnlyMm': 0 }, 'deductions.door.outOnlyMm');
    refused({ 'deductions.door.outOnlyMm': 30 });
    refused({ 'limits.maxDoorWidthMm': 1001 });
    refused({ 'glass.standardThicknessMm': 9 });
    refused({ 'heights.singleDoorTopGapMm': -5 });
  });

  test('send something that is not a whole number', () => {
    refused({ 'deductions.clampMm': 3.5 });
    refused({ 'deductions.clampMm': '3' });
    refused({ 'deductions.clampMm': null });
    refused({ 'deductions.clampMm': Number.NaN });
  });

  test('send something that is not a set of rules', () => {
    refused(null);
    refused([]);
    refused('deductions.clampMm=3');
    refused({ __proto__: null, constructor: 1 });
    refused({ toString: 3 });
  });

  test('every bound accepts its own edges', () => {
    for (const [rule, bounds] of Object.entries(ADJUSTABLE) as [AdjustableRule, (typeof ADJUSTABLE)[AdjustableRule]][]) {
      const edges = 'oneOf' in bounds ? bounds.oneOf : [bounds.min, bounds.max];
      for (const value of edges) {
        expect(at(resolveRuleset({ [rule]: value }).making, rule), rule).toBe(value);
      }
    }
  });
});
