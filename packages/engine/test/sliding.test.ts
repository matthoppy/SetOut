/**
 * Sliding doors on CRL's Serenity.
 *
 * The sizes and holes are held to CRL's own installation sheets, saved in
 * docs/sliding/: 11M0347 and AVDB3149 for the SER78 kit, AVDB3176 for a 90°
 * return. Nothing here has been confirmed against a job yet, and the tests
 * hold SetOut to saying so wherever a sliding shower is worked out.
 *
 * They also hold sliding apart from everything else: a design without
 * `sliding` set is never touched by any of it.
 */
import { describe, expect, test } from 'vitest';
import {
  applyTemplate,
  buildCards,
  buildSpec,
  createDocument,
  createInitialState,
  crlPartOf,
  DEFAULT_RULESET,
  designFromTemplate,
  DocumentError,
  FIXED_RULES,
  fittingsOf,
  getTemplate,
  hasDeck,
  inCrlCatalogue,
  panesOf,
  setOutOf,
  shapesOf,
  SLIDING_TEMPLATES,
  TEMPLATES,
  templatesFor,
  upgradeDocument,
  type ConfiguratorState,
  type PaneHole,
} from '../src';
import { GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: 'Custom Showers' };
const fixed = DEFAULT_RULESET.fixed;
const serenity = FIXED_RULES.sliding.serenity;

/** A sliding alcove with its opening set to a width. */
function alcove(widthMm = 1200, change: (s: ConfiguratorState) => ConfiguratorState = (s) => s): ConfiguratorState {
  const state = designFromTemplate('sliding-alcove');
  const half = Math.floor(widthMm / 2);
  state.panels[0].width_mm = half;
  state.panels[1].width_mm = widthMm - half;
  state.opening.runs[0].widthAtFloorMm = widthMm;
  return change(state);
}

/** A sliding door across the front with a return, by its two runs. */
function withReturn(returnMm = 800, frontMm = 1200): ConfiguratorState {
  const state = designFromTemplate('sliding-return');
  state.panels[0].width_mm = returnMm;
  state.panels[1].width_mm = frontMm / 2;
  state.panels[2].width_mm = frontMm / 2;
  state.opening.runs[0].widthAtFloorMm = returnMm;
  state.opening.runs[1].widthAtFloorMm = frontMm;
  return state;
}

const sizes = (state: ConfiguratorState) => buildSpec(state, context).panels.map((p) => [p.cutWidthMm, p.cutHeightMm]);
const holesOn = (state: ConfiguratorState, pane: number) =>
  panesOf(state, buildSpec(state, context), fixed)[pane].features.filter((f): f is PaneHole => f.kind === 'hole');

describe('sliding is kept apart', () => {
  test('the sliding layouts are not among the standard ones', () => {
    expect(TEMPLATES.some((t) => t.sliding)).toBe(false);
    expect(SLIDING_TEMPLATES.every((t) => t.sliding?.system === 'serenity')).toBe(true);
    expect(templatesFor()).toEqual(TEMPLATES);
    expect(templatesFor({ sliding: false })).toEqual(TEMPLATES);
    expect(templatesFor({ sliding: true }).map((t) => t.id)).toEqual([...TEMPLATES, ...SLIDING_TEMPLATES].map((t) => t.id));
    expect(getTemplate('sliding-alcove')?.name).toBe('Sliding door');
  });

  test.each(TEMPLATES)('a $id design has nothing sliding about it', (template) => {
    const state = designFromTemplate(template.id);
    expect('sliding' in state).toBe(false);
    const spec = buildSpec(state, context);
    expect('sliding' in spec).toBe(false);
    expect(spec.panels.some((p) => 'sliding' in p)).toBe(false);
    expect(spec.warnings.join(' ')).not.toMatch(/sliding|Serenity/i);
    expect(fittingsOf(state, spec, fixed).some((f) => f.kind === 'sliding-kit' || f.kind === 'sliding-return-kit')).toBe(false);
    expect(setOutOf(state, spec, fixed).panes.some((p) => p.left.overlapMm !== undefined || p.right.overlapMm !== undefined)).toBe(false);
  });

  test('no golden is a sliding shower', () => {
    expect(GOLDENS.some((g) => 'sliding' in g.document.design)).toBe(false);
  });

  test('going back to a hinged layout leaves no trace of the sliding one', () => {
    const sliding = designFromTemplate('sliding-alcove');
    expect(sliding.sliding).toEqual({ system: 'serenity' });
    const hinged = applyTemplate(sliding, TEMPLATES.find((t) => t.id === 'alcove-panel-door')!);
    expect('sliding' in hinged).toBe(false);
    expect(buildSpec(hinged, context).panels.map((p) => [p.cutWidthMm, p.cutHeightMm])).toEqual(
      buildSpec(designFromTemplate('alcove-panel-door'), context).panels.map((p) => [p.cutWidthMm, p.cutHeightMm])
    );
  });

  test('a layout’s own sliding setting is copied, not shared', () => {
    const state = applyTemplate(createInitialState(10), SLIDING_TEMPLATES[0]);
    expect(state.sliding).not.toBe(SLIDING_TEMPLATES[0].sliding);
  });
});

describe('in the design document', () => {
  test.each(SLIDING_TEMPLATES)('a fresh $id design reads back unchanged', (template) => {
    const doc = createDocument(designFromTemplate(template.id));
    expect(upgradeDocument(structuredClone(doc))).toEqual(doc);
  });

  test('a system SetOut does not know is refused', () => {
    const doc = createDocument({ ...alcove(), sliding: { system: 'hydroslide' as 'serenity' } });
    expect(() => upgradeDocument(doc)).toThrow(DocumentError);
    expect(() => upgradeDocument(createDocument({ ...alcove(), sliding: 'serenity' as unknown as { system: 'serenity' } }))).toThrow(DocumentError);
  });

  test('sliding left as null is the same as left out', () => {
    const doc = createDocument({ ...designFromTemplate('alcove-panel-door'), sliding: null as unknown as undefined });
    expect('sliding' in upgradeDocument(doc).design).toBe(false);
  });
});

describe('cut sizes, to CRL’s formula (11M0347, page 4)', () => {
  test('each pane is half the opening plus 22mm; the fixed panel 5mm and the door 8mm short of the height', () => {
    // 1200 ÷ 2 + 22 = 622. 2000 − 5 = 1995, 2000 − 8 = 1992.
    expect(sizes(alcove(1200))).toEqual([
      [622, 1995],
      [622, 1992],
    ]);
    expect(sizes(alcove(1000))).toEqual([
      [522, 1995],
      [522, 1992],
    ]);
  });

  test('an odd millimetre goes on the fixed panel, so the lap never changes', () => {
    expect(sizes(alcove(1201)).map(([w]) => w)).toEqual([623, 622]);
  });

  test.each([900, 1000, 1201, 1333, 1480, 1481, 1700, 2025])('at %imm the two panes, their gaps and their lap make the opening', (width) => {
    const state = alcove(width);
    const spec = buildSpec(state, context);
    const [panel, door] = spec.panels;
    expect(spec.sliding?.overallWidthMm).toBe(width);
    expect(spec.sliding?.overlapMm).toBe(50);
    expect(serenity.wallGapMm + panel.cutWidthMm + door.cutWidthMm - 50 + serenity.wallGapMm).toBe(width);
    // And where they stand says the same.
    expect(panel.sliding).toMatchObject({ role: 'fixed', fromMm: 3, toMm: 3 + panel.cutWidthMm });
    expect(door.sliding).toMatchObject({ role: 'door', fromMm: width - 3 - door.cutWidthMm, toMm: width - 3 });
    expect(panel.sliding!.toMm - door.sliding!.fromMm).toBe(50);
  });

  test('the door may stand on either side', () => {
    const state = alcove(1200);
    state.panels.reverse();
    const spec = buildSpec(state, context);
    expect(spec.panels.map((p) => p.sliding?.role)).toEqual(['door', 'fixed']);
    expect(spec.sliding?.doorCloses).toBe('left');
    expect(spec.panels[0].sliding).toMatchObject({ fromMm: 3, toMm: 625 });
    expect(spec.panels[1].sliding).toMatchObject({ fromMm: 575, toMm: 1197 });
  });

  test('the split the customer happened to leave between the two panels changes nothing', () => {
    const lopsided = alcove(1200);
    lopsided.panels[0].width_mm = 300;
    lopsided.panels[1].width_mm = 900;
    expect(sizes(lopsided)).toEqual(sizes(alcove(1200)));
  });

  test('the sliding door has no hinges, handle holes or swing, and is named for what it is', () => {
    const spec = buildSpec(alcove(), context);
    expect(spec.panels.every((p) => p.door === undefined)).toBe(true);
    expect(spec.panels.map((p) => p.label)).toEqual(['P1 — Fixed (Front)', 'P2 — Sliding door (Front)']);
    expect(spec.panels.every((p) => p.cutouts.length === 0)).toBe(true);
    expect(spec.support).toMatchObject({ supportBarRequired: false, supportPanelRequired: false });
  });

  test('a company’s own deductions do not move a sliding pane: the formula is CRL’s', () => {
    const theirs = { rules: { ...DEFAULT_RULESET, making: { ...DEFAULT_RULESET.making, deductions: { ...DEFAULT_RULESET.making.deductions, channel: { verticalMm: 14, horizontalMm: 9, floorToCeilingMm: 16 } } } }, companyName: 'Other' };
    expect(buildSpec(alcove(), theirs).panels.map((p) => [p.cutWidthMm, p.cutHeightMm])).toEqual(sizes(alcove()));
  });

  test('working one out does not change the design', () => {
    const state = alcove();
    const before = structuredClone(state);
    buildSpec(state, context);
    expect(state).toEqual(before);
  });
});

describe('it says it is unconfirmed', () => {
  test.each(SLIDING_TEMPLATES)('$id: the first warning says the sizes are not confirmed', (template) => {
    const spec = buildSpec(designFromTemplate(template.id), context);
    expect(spec.warnings[0]).toMatch(/^Sliding door: .*not confirmed yet\. Custom Showers will check every size/);
    expect(spec.blockingIssues).toEqual([]);
  });

  test('and lists each of SetOut’s own stand-ins', () => {
    const notes = buildSpec(alcove(), context).sliding!.unconfirmed.join('\n');
    expect(notes).toMatch(/Pull: its hole is drilled 50mm/);
    expect(notes).toMatch(/track holder holes are 12mm/);
    expect(notes).toMatch(/3mm at each end/);
    expect(notes).toMatch(/stops 19mm short/);
    expect(buildSpec(withReturn(), context).sliding!.unconfirmed.join('\n')).toMatch(/Return panel:/);
  });
});

describe('what CRL’s kit will not do is refused', () => {
  const issues = (state: ConfiguratorState) => buildSpec(state, context).blockingIssues.join('\n');

  test('12mm glass takes the Senior kit, which is not built', () => {
    expect(issues({ ...alcove(), glassThicknessMm: 12 })).toMatch(/takes 8 or 10mm glass, not 12mm/);
    expect(issues({ ...alcove(), glassThicknessMm: 8 })).toBe('');
  });

  test('glass to the ceiling', () => {
    expect(issues({ ...alcove(), isFloorToCeiling: true })).toMatch(/cannot go to the ceiling/);
  });

  test('a door over 40kg', () => {
    // 762 wide by 2192 in 10mm glass is 41.76kg.
    const tall = { ...alcove(1600), heightMm: 2200 };
    expect(buildSpec(tall, context).panels[1].weightKg).toBeGreaterThan(40);
    expect(issues(tall)).toMatch(/CRL’s limit for a Serenity door is 40kg/);
    expect(issues(alcove(1600))).toBe('');
  });

  test('an opening wider than the 2m header reaches', () => {
    expect(issues(alcove(2025))).toBe('');
    expect(issues(alcove(2026))).toMatch(/needs a 2001mm header/);
  });

  test.each([
    ['no fixed panel', (s: ConfiguratorState) => ({ ...s, panels: [s.panels[1]], junctions: [] })],
    ['no door', (s: ConfiguratorState) => ({ ...s, panels: s.panels.map((p) => ({ id: p.id, kind: 'fixed' as const, width_mm: p.width_mm })) })],
    ['an open end', (s: ConfiguratorState) => ({ ...s, rightWall: false })],
    ['a corner between the panel and the door', (s: ConfiguratorState) => ({ ...s, junctions: [{ angle_deg: 90 as const }] })],
  ])('a layout with %s is not a sliding shower', (_what, change) => {
    const state = change(alcove());
    state.opening = designFromTemplate('sliding-alcove').opening;
    const spec = buildSpec(state, context);
    expect(spec.blockingIssues.join('\n')).toMatch(/Choose one of the sliding layouts, or a hinged door\./);
    expect(spec.panels).toHaveLength(state.panels.length);
    expect(spec.panels.every((p) => p.door === undefined)).toBe(true);
  });
});

describe('an opening too wide for two equal panes', () => {
  test('up to 1480mm the door is CRL’s formula', () => {
    const spec = buildSpec(alcove(1480), context);
    expect(spec.panels.map((p) => p.cutWidthMm)).toEqual([762, 762]);
    expect(spec.warnings.join('\n')).not.toMatch(/wider than two equal panes/);
  });

  test('past it the door is held at CRL’s 762mm, and it is marked for review as SetOut’s own', () => {
    const spec = buildSpec(alcove(1700), context);
    expect(spec.panels.map((p) => p.cutWidthMm)).toEqual([982, 762]);
    expect(spec.warnings.join('\n')).toMatch(/Review: The opening is 1700mm, wider than two equal panes allow/);
    expect(spec.sliding!.unconfirmed.join('\n')).toMatch(/The door is held at 762mm/);
  });

  test('a narrow one is marked too', () => {
    expect(buildSpec(alcove(900), context).warnings.join('\n')).toMatch(/the way in is about 425mm/);
    expect(buildSpec(alcove(1000), context).warnings.join('\n')).not.toMatch(/the way in/);
  });
});

describe('an opening out of square', () => {
  test('the panes stay square and the shower is marked for review', () => {
    const state = alcove(1200);
    state.opening.runs[0] = { ...state.opening.runs[0], floorFallMm: 6, floorLowEnd: 'end' };
    const spec = buildSpec(state, context);
    expect(spec.warnings.join('\n')).toMatch(/Review: Sliding glass is cut square, to the width at the floor, and here the floor falls\./);
    expect(shapesOf(state, spec, fixed).every((s) => !s.shaped)).toBe(true);
    expect(sizes(state)).toEqual(sizes(alcove(1200)));
    // The gaps to the floor are as it was measured.
    expect(setOutOf(state, spec, fixed).panes[1].floorGap).toEqual({ left: 11, right: 14 });
  });

  test('a square one is not', () => {
    expect(buildSpec(alcove(), context).warnings.join('\n')).not.toMatch(/cut square/);
  });
});

describe('holes, as CRL draws them', () => {
  test('the door: four 16mm roller holes, 89mm in from each side, 44mm and 106mm down', () => {
    const state = alcove();
    const rollers = holesOn(state, 1).filter((h) => h.role === 'roller');
    expect(rollers).toHaveLength(4);
    for (const side of ['left', 'right'] as const) {
      const pair = rollers.filter((h) => h.side === side);
      expect(pair.map((h) => 1992 - h.centreMm).sort((a, b) => a - b)).toEqual([44, 106]);
      expect(pair.every((h) => h.insetMm === 89 && h.diameterMm === 16 && h.apartMm === 62)).toBe(true);
    }
  });

  test('the door: the pull’s hole 64mm in from the closing edge, half way up', () => {
    const pull = holesOn(alcove(), 1).filter((h) => h.role === 'pull');
    expect(pull).toEqual([expect.objectContaining({ side: 'right', insetMm: 64, centreMm: 996, diameterMm: 50, apartMm: null })]);
    const mirrored = alcove();
    mirrored.panels.reverse();
    expect(holesOn(mirrored, 0).find((h) => h.role === 'pull')?.side).toBe('left');
  });

  test('the fixed panel: two 12mm holes, 89mm in from each side, 76mm down', () => {
    const holes = holesOn(alcove(), 0);
    expect(holes.map((h) => [h.role, h.side, h.insetMm, 1995 - h.centreMm, h.diameterMm])).toEqual([
      ['track-holder', 'left', 89, 76, 12],
      ['track-holder', 'right', 89, 76, 12],
    ]);
  });

  test('every hole is named for its part and CRL’s sheet, and none is a hinge’s or a handle’s', () => {
    for (const state of [alcove(), withReturn()]) {
      const panes = panesOf(state, buildSpec(state, context), fixed);
      for (const pane of panes) {
        expect(pane.features.length).toBeGreaterThan(0);
        for (const f of pane.features) {
          expect(f.kind).toBe('hole');
          if (f.kind !== 'hole') continue;
          expect(['roller', 'track-holder', 'pull', 'return-fitting']).toContain(f.role);
          expect(f.template).toMatch(/^serenity\//);
          expect(f.source).toMatch(/^CRL (11M0347|AVDB3176)/);
          // Inside the glass, clear of every edge.
          expect(f.insetMm - f.diameterMm / 2).toBeGreaterThanOrEqual(fixed.limits.minHoleEdgeDistanceMm - f.diameterMm);
          expect(f.centreMm).toBeGreaterThan(0);
          expect(f.centreMm).toBeLessThan(pane.heightMm);
        }
      }
    }
  });

  test('the header: 25mm shorter than the opening, its centre 76mm below the top of the glass, drilled where the fixed panel’s holes are', () => {
    const { header } = buildSpec(alcove(1200), context).sliding!;
    // CRL’s own example: 89mm in the glass and a 3mm gap put the first hole 92mm from the wall.
    expect(header).toEqual({ lengthMm: 1175, centreHeightMm: 1924, holesFromFixedEndMm: [92, 536], holeDiameterMm: 6 });
  });
});

describe('set out', () => {
  test('3mm at each wall, 5mm under the fixed panel, 8mm under the door, and the door laps the panel by 50mm', () => {
    const state = alcove();
    const { panes } = setOutOf(state, buildSpec(state, context), fixed);
    expect(panes[0]).toMatchObject({
      fromMm: 3,
      toMm: 625,
      floorGap: { left: 5, right: 5 },
      ceilingGap: null,
      left: { meets: 'wall', bottomMm: 3, topMm: 3 },
      right: { meets: 'glass', overlapMm: 50, bottomMm: -50, topMm: -50 },
    });
    expect(panes[1]).toMatchObject({
      fromMm: 575,
      toMm: 1197,
      floorGap: { left: 8, right: 8 },
      left: { meets: 'glass', overlapMm: 50 },
      right: { meets: 'wall', bottomMm: 3, topMm: 3 },
    });
    // Their tops are level.
    expect(panes[0].corners.topLeft.y).toBe(2000);
    expect(panes[1].corners.topRight.y).toBe(2000);
  });
});

describe('with a return (AVDB3176)', () => {
  test('the front glass is set out to the inside face of the return panel', () => {
    const spec = buildSpec(withReturn(800, 1200), context);
    // 1200 less the 10mm return glass is 1190: 595 + 22 each.
    expect(spec.sliding).toMatchObject({ overallWidthMm: 1190, returnKit: 'SER90', doorCloses: 'right' });
    expect(spec.panels.map((p) => [p.sliding?.role, p.cutWidthMm, p.cutHeightMm])).toEqual([
      ['return', 797, 1995],
      ['fixed', 617, 1995],
      ['door', 617, 1992],
    ]);
    expect(spec.panels[1].sliding).toMatchObject({ fromMm: 13, toMm: 630 });
    expect(spec.panels[2].sliding).toMatchObject({ fromMm: 580, toMm: 1197 });
    expect(spec.panels[0].label).toBe('P1 — Fixed return (Return left)');
  });

  test('the return panel takes one 13mm hole, 22mm in from its edge at the corner and 76mm down', () => {
    const state = withReturn();
    expect(holesOn(state, 0).map((h) => [h.role, h.side, h.insetMm, 1995 - h.centreMm, h.diameterMm])).toEqual([['return-fitting', 'right', 22, 76, 13]]);
  });

  test('a return on the other side is the same, mirrored', () => {
    const state = withReturn();
    state.panels.reverse();
    state.junctions.reverse();
    state.opening.runs.reverse();
    const spec = buildSpec(state, context);
    expect(spec.panels.map((p) => [p.sliding?.role, p.cutWidthMm])).toEqual([
      ['door', 617],
      ['fixed', 617],
      ['return', 797],
    ]);
    expect(spec.sliding?.doorCloses).toBe('left');
    expect(spec.panels[0].sliding).toMatchObject({ fromMm: 3, toMm: 620 });
    expect(spec.panels[1].sliding).toMatchObject({ fromMm: 570, toMm: 1187 });
    expect(holesOn(state, 2)[0]).toMatchObject({ role: 'return-fitting', side: 'left' });
    expect(setOutOf(state, spec, fixed).panes[2]).toMatchObject({ left: { meets: 'corner' }, right: { meets: 'wall', bottomMm: 3 } });
  });

  test('a door closing on the return panel is marked for review', () => {
    const state = withReturn();
    [state.panels[1], state.panels[2]] = [state.panels[2], state.panels[1]];
    expect(buildSpec(state, context).warnings.join('\n')).toMatch(/Review: The door closes against the return panel/);
    expect(buildSpec(withReturn(), context).warnings.join('\n')).not.toMatch(/closes against the return/);
  });
});

describe('what the fitter takes', () => {
  const parts = (state: ConfiguratorState, finishCode: string | null) => {
    const spec = buildSpec(state, context);
    return fittingsOf(state, spec, fixed).map((f) => [f.kind, crlPartOf(f, { glassMm: spec.glassThicknessMm, finishCode, handleCode: null })] as const);
  };

  test('the Serenity kit in place of hinges, a handle and a door seal, and channel for the fixed panel', () => {
    const state = alcove();
    const fittings = fittingsOf(state, buildSpec(state, context), fixed);
    expect(fittings).toEqual([
      { kind: 'sliding-kit', pane: 1, series: 'SER78', headerLengthMm: 1175 },
      // 622 less the 19mm left for the door guide.
      { kind: 'channel', lengthMm: 603 },
    ]);
    expect(fittingsOf({ ...state, mounting: 'clamps' }, buildSpec({ ...state, mounting: 'clamps' }, context), fixed).at(-1)).toEqual({ kind: 'clamps' });
  });

  test('a return adds the SER90 kit and its own channel', () => {
    const state = withReturn();
    expect(fittingsOf(state, buildSpec(state, context), fixed)).toEqual([
      { kind: 'sliding-kit', pane: 2, series: 'SER78', headerLengthMm: 1165 },
      { kind: 'sliding-return-kit', pane: 0, series: 'SER90' },
      { kind: 'channel', lengthMm: 617 - 19 + 797 },
    ]);
  });

  test('CRL’s number for the kit in the shower’s finish, where CRL makes it', () => {
    expect(parts(alcove(), 'MBL')[0]).toEqual(['sliding-kit', { status: 'found', code: 'SER78MBL' }]);
    expect(parts(alcove(), 'BBRZ')[0]).toEqual(['sliding-kit', { status: 'found', code: 'SER78BBRZ' }]);
    // Polished chrome takes polished stainless.
    expect(parts(alcove(), 'CH')[0]).toEqual(['sliding-kit', { status: 'found', code: 'SER78PS' }]);
    expect(parts(alcove(), 'SB')[0]).toEqual(['sliding-kit', { status: 'not-in-finish', series: 'SER78', code: 'SER78SB' }]);
    expect(parts(alcove(), null)[0]).toEqual(['sliding-kit', { status: 'no-finish-code', series: 'SER78' }]);
    expect(parts(withReturn(), 'MBL')[1]).toEqual(['sliding-return-kit', { status: 'found', code: 'SER90MBL' }]);
    expect(parts(withReturn(), 'CH')[1]).toEqual(['sliding-return-kit', { status: 'found', code: 'SER90PS' }]);
  });

  test('every number given is in Matt’s copy of CRL’s catalogue', () => {
    for (const state of [alcove(), withReturn()]) {
      for (const finish of ['CH', 'MBL', 'BBRZ', 'BS', 'PS', 'BN', 'SB']) {
        for (const [, part] of parts(state, finish)) {
          if (part?.status === 'found') expect(inCrlCatalogue(part.code), part.code).toBe(true);
        }
      }
    }
  });
});

describe('measuring is the same', () => {
  test.each(SLIDING_TEMPLATES)('$id is measured with the cards its shape already has', (template) => {
    const sliding = designFromTemplate(template.id);
    const laser = { ...sliding, opening: { ...sliding.opening, method: 'laser' as const } };
    expect(hasDeck(laser)).toBe(true);
    // The same cards as the same shape with a hinged door.
    const { sliding: _sliding, ...hinged } = laser;
    void _sliding;
    expect(buildCards(laser).map((c) => c.id)).toEqual(buildCards(hinged).map((c) => c.id));
  });
});

describe('the rules', () => {
  test('are CRL’s numbers', () => {
    expect(serenity).toMatchObject({
      glassMm: [8, 10],
      maxDoorWidthMm: 762,
      maxDoorWeightKg: 40,
      halfWidthPlusMm: 22,
      wallGapMm: 3,
      fixedBottomGapMm: 5,
      doorBottomGapMm: 8,
      header: { shorterThanOpeningMm: 25, centreBelowGlassTopMm: 76, stockLengthMm: 2000, holeDiameterMm: 6 },
      rollerHoles: { diameterMm: 16, inMm: 89, downMm: [44, 106] },
      fixedPanelHoles: { diameterMm: 12, inMm: 89, downMm: 76 },
      returnPanelHole: { diameterMm: 13, inMm: 22, downMm: 76 },
      pullHole: { diameterMm: 50, inMm: 64 },
    });
  });
});
