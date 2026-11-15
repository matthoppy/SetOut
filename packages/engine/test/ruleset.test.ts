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
  RULE_GROUPS,
  RULE_TEXT,
  ruleValue,
  RulesetError,
  STANDARD_HINGES,
  type AdjustableRule,
  type EngineContext,
} from '../src';

const company = (name: string, overrides = {}): EngineContext => ({
  rules: resolveRuleset(overrides),
  companyName: name,
});

const at = (root: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], root);

/** Every rule in the making rules, a number or a choice, by its dotted name. */
function rulePaths(node: unknown, prefix = ''): string[] {
  if (typeof node === 'number' || typeof node === 'string') return [prefix];
  if (node === null || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([key, child]) =>
    rulePaths(child, prefix ? `${prefix}.${key}` : key)
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
    expect(rulePaths(DEFAULT_MAKING_RULES).sort()).toEqual(Object.keys(ADJUSTABLE).sort());
  });

  test('every default is inside its own bounds', () => {
    for (const [rule, bounds] of Object.entries(ADJUSTABLE)) {
      const value = at(DEFAULT_MAKING_RULES, rule) as number;
      if ('choice' in bounds) expect(bounds.choice, rule).toContain(value);
      else if ('oneOf' in bounds) expect(bounds.oneOf, rule).toContain(value);
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
    // 700 between two walls: 8 at its hinges, on the wall, and its seal at the latch.
    expect(ours.panels[0].cutWidthMm).toBe(687);
    expect(theirs.panels[0].cutWidthMm).toBe(685);
    expect(theirs.panels[0].cutHeightMm).toBe(ours.panels[0].cutHeightMm);
  });

  test('fixed glass in channel loses 5mm off the bottom and nothing off the top; a door 17mm off the bottom and nothing off the top', () => {
    const ours = buildSpec(corner, company('Custom Showers'));
    expect(ours.panels.map((p) => [p.kind, p.cutHeightMm])).toEqual([
      ['fixed', 1995],
      ['door', 1983],
    ]);
    expect(ours.panels[0].deductions.vertical.breakdown).toEqual(['Bottom channel: -5mm']);
    expect(ours.panels[1].deductions.vertical.breakdown).toEqual(['Door, bottom: -17mm']);
  });

  test('a door with glass over its head, a glass transom, loses 4mm off its top; under an open one, nothing', () => {
    const spec = buildSpec({ ...designFromTemplate('alcove-panel-door'), isFloorToCeiling: true, heightMm: 2400, aboveDoor: 'glass' }, company('Custom Showers'));
    const door = spec.panels[1];
    expect(door.tightHeightMm).toBe(2000);
    expect(door.deductions.vertical.breakdown).toEqual(['Glass over the door: -4mm', 'Door, bottom: -17mm']);
    expect(door.cutHeightMm).toBe(1979);
    const open = buildSpec({ ...designFromTemplate('alcove-panel-door'), isFloorToCeiling: true, heightMm: 2400, aboveDoor: 'open' }, company('Custom Showers'));
    expect(open.panels[1].deductions.vertical.breakdown).toEqual(['Door, bottom: -17mm']);
    expect(open.panels[1].cutHeightMm).toBe(1983);
  });

  test('glass on clamps loses 3mm off the bottom for silicone, nothing off the top, and 3mm of silicone at the ceiling', () => {
    const clamped = { ...designFromTemplate('walk-in'), mounting: 'clamps' as const };
    const short = buildSpec(clamped, company('Custom Showers')).panels[0];
    expect(short.deductions.vertical.breakdown).toEqual(['Bottom, silicone: -3mm']);
    expect(short.cutHeightMm).toBe(1997);
    const tall = buildSpec({ ...clamped, isFloorToCeiling: true, heightMm: 2400 }, company('Custom Showers')).panels[0];
    expect(tall.deductions.vertical.breakdown).toEqual(['Top, to the ceiling: -3mm', 'Bottom, silicone: -3mm']);
    expect(tall.cutHeightMm).toBe(2394);
  });

  test('glass to the ceiling loses 10mm off the top, into its top channel, and 5mm off the bottom', () => {
    const spec = buildSpec({ ...designFromTemplate('walk-in'), isFloorToCeiling: true, heightMm: 2400 }, company('Custom Showers'));
    expect(spec.panels[0].deductions.vertical.breakdown).toEqual(['Top channel, to the ceiling: -10mm', 'Bottom channel: -5mm']);
    expect(spec.panels[0].cutHeightMm).toBe(2385);
    // The wall channel runs between the bottom channel and the top one.
    expect(spec.channelCuts?.find((c) => c.runs === 'wall')?.lengthMm).toBe(2400 - 38);
  });

  test('a different allowance in the bottom channel changes the fixed glass, not the door', () => {
    const theirs = buildSpec(corner, company('Brennan Glass', { 'deductions.channel.bottomMm': 8, 'deductions.channel.topMm': 2 }));
    expect(theirs.panels.map((p) => p.cutHeightMm)).toEqual([1990, 1983]);
  });

  test('a door’s own gap below changes the door, not the fixed glass', () => {
    const theirs = buildSpec(corner, company('Brennan Glass', { 'deductions.door.bottomMm': 12 }));
    expect(theirs.panels.map((p) => p.cutHeightMm)).toEqual([1995, 1988]);
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

  test('a door hung on the wall leaves 8mm at its hinges for the bubble seal, and its latch only its seal', () => {
    const ours = buildSpec(door, company('Custom Showers'));
    expect(ours.panels[0].deductions.horizontal.breakdown).toEqual(['Right, hung on the wall, bubble seal: -8mm']);
    expect(ours.panels[0].door?.swingDeductionMm).toBe(5);
    // A door sits in no channel, so the channel's allowance does not touch it.
    const deeper = buildSpec(door, company('Brennan Glass', { 'deductions.channel.horizontalMm': 12 }));
    expect(deeper.panels[0].cutWidthMm).toBe(ours.panels[0].cutWidthMm);
    const wider = buildSpec(door, company('Brennan Glass', { 'deductions.door.hingeWallMm': 10 }));
    expect(wider.panels[0].cutWidthMm).toBe(ours.panels[0].cutWidthMm - 2);
  });

  test('a Bellagio door fitted without seals leaves CRL’s 3mm at its hinges on the wall', () => {
    // Wider than Vienna takes (864mm), and light enough for Bellagio (50kg).
    const heavy = { ...door, panels: door.panels.map((p) => ({ ...p, width_mm: 900 })) };
    const withSeals = buildSpec(heavy, company('Custom Showers'));
    expect(withSeals.panels[0].door?.hingeBrand).toBe('Bellagio');
    expect(withSeals.panels[0].door?.hingeSealType).toBe('bubble seal');
    const without = buildSpec({ ...heavy, bellagioFit: 'without-seals' as const }, company('Custom Showers'));
    expect(without.panels[0].deductions.horizontal.breakdown).toEqual(['Right, hung on the wall, no seals: -3mm']);
    expect(without.panels[0].cutWidthMm).toBe(withSeals.panels[0].cutWidthMm + 5);
    expect(without.panels[0].door?.hingeSealType).toBeNull();
  });

  test('the company’s own way of fitting Bellagio holds for a shower that has not chosen one', () => {
    const heavy = { ...door, panels: door.panels.map((p) => ({ ...p, width_mm: 900 })) };
    const standard = { ...STANDARD_HINGES, bellagioFit: 'without-seals' as const };
    const theirs = buildSpec(heavy, { ...company('Brennan Glass'), hinges: standard });
    expect(theirs.panels[0].deductions.horizontal.breakdown).toEqual(['Right, hung on the wall, no seals: -3mm']);
    // The shower’s own choice still wins.
    const withSeals = buildSpec({ ...heavy, bellagioFit: 'with-seals' as const }, { ...company('Brennan Glass'), hinges: standard });
    expect(withSeals.panels[0].deductions.horizontal.breakdown).toEqual(['Right, hung on the wall, bubble seal: -8mm']);
    // Fitted without seals or not, a door narrow enough for Geneva keeps the bubble seal.
    const light = buildSpec(door, { ...company('Brennan Glass'), hinges: standard });
    expect(light.panels[0].door?.hingeBrand).toBe('Geneva');
    expect(light.panels[0].door?.hingeSealType).toBe('bubble seal');
  });

  test('two fixed panes siliconed together in line share the 2mm joint, a millimetre each', () => {
    const screen = designFromTemplate('walk-in');
    const pane = screen.panels[0];
    const two = { ...screen, rightWall: true, panels: [{ ...pane, id: 'a', width_mm: 600 }, { ...pane, id: 'b', width_mm: 600 }], junctions: [{ angle_deg: 180 as const }] };
    const ours = buildSpec(two, company('Custom Showers'));
    expect(ours.panels.map((p) => p.cutWidthMm)).toEqual([589, 589]);
    expect(ours.panels[0].deductions.horizontal.breakdown).toEqual(['Left wall channel: -10mm', 'Right, silicone joint in line: -1mm']);
    // An odd joint still adds up: the left pane takes the smaller half.
    const wider = buildSpec(two, company('Brennan Glass', { 'glass.siliconeJointMm': 3 }));
    expect(wider.panels.map((p) => p.cutWidthMm)).toEqual([589, 588]);
    // A door beside a panel leaves its own gap, not a silicone joint.
    expect(buildSpec(designFromTemplate('alcove-panel-door'), company('Custom Showers')).panels[0].deductions.horizontal.breakdown).toEqual(['Left wall channel: -10mm']);
  });

  test('at a corner the front runs through, unless the company or the shower says the return', () => {
    // A 700 door hung on the wall, closing on an 800 return.
    const front = buildSpec(corner, company('Custom Showers'));
    const [ret, door] = front.panels;
    expect([door.cutWidthMm, ret.cutWidthMm]).toEqual([687, 778]);
    expect(door.door?.sealType).toBe('90° stopper seal');
    // The return runs through: the door stops at it, short by its glass and its seal's gap.
    const theirs = buildSpec(corner, company('Brennan Glass', { 'glass.cornerRunsThrough': 'return' }));
    expect(theirs.panels.map((p) => p.cutWidthMm)).toEqual([790, 677]);
    expect(theirs.panels[1].deductions.horizontal.breakdown).toEqual(['Right, hung on the wall, bubble seal: -8mm', 'Left corner (stops at the panel): -10mm']);
    expect(theirs.panels[0].deductions.horizontal.breakdown).toEqual(['Left wall channel: -10mm', 'Right corner (runs through): -0mm']);
    // It closes beside the return, onto CRL's 90° strike seal.
    expect(theirs.panels[1].door?.sealType).toBe('90° strike seal');
    expect(theirs.panels[1].door?.swingDeductionMm).toBe(5);
    // A shower can choose for itself, either way.
    expect(buildSpec({ ...corner, cornerRunsThrough: 'return' as const }, company('Custom Showers')).panels.map((p) => p.cutWidthMm)).toEqual([790, 677]);
    expect(buildSpec({ ...corner, cornerRunsThrough: 'front' as const }, company('Brennan Glass', { 'glass.cornerRunsThrough': 'return' })).panels.map((p) => p.cutWidthMm)).toEqual([778, 687]);
  });

  test('fixed glass that stops behind a return that runs through loses the glass and the joint', () => {
    const fixed = designFromTemplate('walk-in-return');
    const ours = buildSpec(fixed, company('Custom Showers'));
    const theirs = buildSpec(fixed, company('Brennan Glass', { 'glass.cornerRunsThrough': 'return' }));
    const frontOf = (s: typeof ours) => s.panels.find((p) => p.plane === 'front')!;
    const returnOf = (s: typeof ours) => s.panels.find((p) => p.plane !== 'front')!;
    expect(frontOf(theirs).cutWidthMm).toBe(frontOf(ours).cutWidthMm - 12);
    expect(returnOf(theirs).cutWidthMm).toBe(returnOf(ours).cutWidthMm + 12);
  });

  test('a door hung off a return that runs through stops at it, short by its glass and the hinge gap', () => {
    const shower = designFromTemplate('three-sided');
    const theirs = buildSpec(shower, company('Brennan Glass', { 'glass.cornerRunsThrough': 'return' }));
    // 700 less 10 and 3 at its hinges, and 10 and 5 at its latch; each 600 return less 10 at its wall.
    expect(theirs.panels.map((p) => p.cutWidthMm)).toEqual([590, 672, 590]);
    expect(theirs.panels[1].door?.sealType).toBe('90° strike seal');
  });

  test('Matt’s screen: 1200 wide and 2200 high at one wall is glass 1190 x 2195, channel cut 1200 and 2181', () => {
    const screen = designFromTemplate('walk-in');
    const design = { ...screen, heightMm: 2200, panels: [{ ...screen.panels[0], width_mm: 1200 }] };
    const spec = buildSpec(design, company('Custom Showers'));
    expect(spec.panels.map((p) => [p.cutWidthMm, p.cutHeightMm])).toEqual([[1190, 2195]]);
    expect((spec.channelCuts ?? []).map((c) => [c.label, c.lengthMm])).toEqual([
      ['Floor, under P1', 1200],
      ['Left wall, beside P1', 2181],
    ]);
    expect(spec.totalChannelLengthMm).toBe(3381);
  });

  test('a door sits in no channel, and a clamp job has none', () => {
    expect(buildSpec(door, company('Custom Showers')).channelCuts).toEqual([]);
    const clamped = buildSpec({ ...designFromTemplate('alcove-panel-door'), mounting: 'clamps' }, company('Custom Showers'));
    expect(clamped.channelCuts).toEqual([]);
    expect(clamped.totalChannelLengthMm).toBe(0);
  });

  test('a deeper channel cuts the wall channel shorter', () => {
    const spec = buildSpec(designFromTemplate('alcove-panel-door'), company('Brennan Glass', { 'deductions.channel.depthMm': 25 }));
    expect(spec.channelCuts?.find((c) => c.runs === 'wall')?.lengthMm).toBe(2000 - 25);
  });

  test('on clamps, glass at a wall loses 3mm for the silicone down the wall, and a door keeps its own gaps', () => {
    const spec = buildSpec({ ...designFromTemplate('alcove-panel-door'), mounting: 'clamps' }, company('Custom Showers'));
    expect(spec.panels[0].deductions.horizontal.breakdown).toEqual(['Left clamps: -3mm']);
    expect(spec.panels[0].cutWidthMm).toBe(397);
    const door = spec.panels[1];
    expect(door.deductions.horizontal.breakdown).toEqual(['Right, hung on the wall, bubble seal: -8mm']);
    expect(door.deductions.vertical.breakdown).toEqual(['Door, bottom: -17mm']);
    expect([door.cutWidthMm, door.cutHeightMm]).toEqual([687, 1983]);
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
    refused({ 'deductions.clamps.wallMm': 3.5 });
    refused({ 'deductions.clamps.wallMm': '3' });
    refused({ 'deductions.clamps.wallMm': null });
    refused({ 'deductions.clamps.wallMm': Number.NaN });
  });

  test('choose something a choice does not offer', () => {
    refused({ 'glass.cornerRunsThrough': 'sideways' });
    refused({ 'glass.cornerRunsThrough': 1 });
    refused({ 'deductions.clamps.wallMm': 'front' });
    expect(resolveRuleset({ 'glass.cornerRunsThrough': 'return' }).making.glass.cornerRunsThrough).toBe('return');
  });

  test('send something that is not a set of rules', () => {
    refused(null);
    refused([]);
    refused('deductions.clamps.wallMm=3');
    refused({ __proto__: null, constructor: 1 });
    refused({ toString: 3 });
  });

  test('every bound accepts its own edges', () => {
    for (const [rule, bounds] of Object.entries(ADJUSTABLE) as [AdjustableRule, (typeof ADJUSTABLE)[AdjustableRule]][]) {
      const edges: readonly (number | string)[] = 'choice' in bounds ? bounds.choice : 'oneOf' in bounds ? bounds.oneOf : [bounds.min, bounds.max];
      for (const value of edges) {
        expect(at(resolveRuleset({ [rule]: value }).making, rule), rule).toBe(value);
      }
    }
  });
});

describe('the rules in words', () => {
  test('every rule a company can change is named, but the glass thickness, which the designer sets', () => {
    const named = Object.keys(RULE_TEXT).sort();
    expect(named).toEqual(Object.keys(ADJUSTABLE).filter((rule) => rule !== 'glass.standardThicknessMm').sort());
    for (const text of Object.values(RULE_TEXT)) expect(RULE_GROUPS).toContain(text.group);
  });

  test('a measurement has its unit, and a choice names each of its choices', () => {
    for (const [rule, text] of Object.entries(RULE_TEXT)) {
      const bounds = ADJUSTABLE[rule as AdjustableRule];
      if ('choice' in bounds) {
        expect(text.unit, rule).toBeUndefined();
        expect(Object.keys(text.choices ?? {}), rule).toEqual([...bounds.choice]);
      } else {
        expect(text.unit, rule).toBeDefined();
        expect(text.choices, rule).toBeUndefined();
      }
    }
  });

  test('a rule’s value is read from the rules it is in', () => {
    expect(ruleValue(DEFAULT_MAKING_RULES, 'deductions.channel.horizontalMm')).toBe(10);
    expect(ruleValue(resolveRuleset({ 'deductions.channel.bottomMm': 7 }).making, 'deductions.channel.bottomMm')).toBe(7);
  });
});
