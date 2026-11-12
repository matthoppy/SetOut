/** A quote's lines name each door's hinges as CRL makes them, and price each of CRL's hinges on its own. */
import { applyTemplate, buildSpec, createInitialState, DEFAULT_RULESET, panesOf, TEMPLATES, type ConfiguratorState } from '@setout/engine';
import { describe, expect, test } from 'vitest';
import { draftLines } from '../src/lib/quote-lines';

const labels = { finishes: [{ id: 'chrome', label: 'Polished chrome' }], handles: [{ id: 'pull', label: 'Pull handle' }] };
const shower = (design: ConfiguratorState) => ({ prefix: '', design, spec: buildSpec(design, { rules: DEFAULT_RULESET, companyName: 'Test' }) });
const hingeLine = (design: ConfiguratorState, prices = new Map<string, number>(), standards?: { wall: 'offset' | 'full'; inLine: 'standard' }) =>
  draftLines([shower(design)], { ...labels, ...(standards ? { hinges: standards } : {}) }, prices).find((l) => l.key?.startsWith('hinge:'));

describe('hinges on a quote', () => {
  const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
  if (!template) throw new Error('no template');
  const design = applyTemplate(createInitialState(10), template);

  test('a door hung from a wall is quoted on the company standard, by its CRL number', () => {
    const line = hingeLine(design);
    expect(line?.key).toMatch(/^hinge:(gen044|v1e044|bel344):chrome$/);
    expect(line?.description).toMatch(/hinges: \w+, to the wall, (offset back plate, )?Polished chrome$/);
  });

  test('a shower with its own wall hinge is priced as that hinge, at the price last sent for it', () => {
    const offset = hingeLine(design);
    const full = hingeLine({ ...design, wallHinge: 'full' }, new Map([['hinge:gen037:chrome', 2950]]));
    if (offset?.key?.startsWith('hinge:gen')) {
      expect(full?.key).toBe('hinge:gen037:chrome');
      expect(full?.description).toContain('to the wall, full back plate');
      expect(full?.unitPricePence).toBe(2950);
    }
  });

  test("the company's standard applies where the shower has not chosen", () => {
    const line = hingeLine(design, new Map(), { wall: 'full', inLine: 'standard' });
    if (line?.key?.startsWith('hinge:gen')) expect(line.key).toBe('hinge:gen037:chrome');
  });
});

describe('cut-outs on a quote', () => {
  const lineOf = (design: ConfiguratorState, key: string, standards?: Parameters<typeof draftLines>[1]['hinges']) =>
    draftLines([shower(design)], { ...labels, ...(standards ? { hinges: standards } : {}) }, new Map()).find((l) => l.key === key);

  test('each shower is charged for its notches and its holes, a mouse ear counting as two holes', () => {
    const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
    if (!template) throw new Error('no template');
    const design = applyTemplate(createInitialState(10), template);
    const spec = buildSpec(design, { rules: DEFAULT_RULESET, companyName: 'Test' });
    const features = panesOf(design, spec, DEFAULT_RULESET.fixed).flatMap((p) => p.features);
    const notches = features.filter((f) => f.kind !== 'hole').length;
    const ears = features.filter((f) => f.kind === 'notch' && f.ears).length;
    const holes = features.filter((f) => f.kind === 'hole').length + 2 * ears;
    expect(notches).toBeGreaterThan(0);
    expect(lineOf(design, 'cutout:notch')).toMatchObject({ description: 'Notches cut in the glass', quantity: notches, unit: 'each' });
    expect(lineOf(design, 'cutout:hole')).toMatchObject({ description: 'Holes drilled in the glass', quantity: holes, unit: 'each' });
  });

  test('a Vienna door cut rectangular has two holes fewer for each hinge than with mouse ears', () => {
    const vienna = (cut: 'mouse-ear' | 'rectangular') => {
      const template = TEMPLATES.find((t) => t.id === 'alcove-door');
      if (!template) throw new Error('no template');
      const design = applyTemplate(createInitialState(10), template);
      design.panels = design.panels.map((p) => (p.door ? { ...p, width_mm: 800 } : p));
      design.viennaCutout = cut;
      return design;
    };
    const spec = buildSpec(vienna('mouse-ear'), { rules: DEFAULT_RULESET, companyName: 'Test' });
    const door = spec.panels.find((p) => p.door)?.door;
    expect(door?.hingeBrand).toBe('Vienna');
    if (!door) return;
    const eared = lineOf(vienna('mouse-ear'), 'cutout:hole')?.quantity ?? 0;
    const square = lineOf(vienna('rectangular'), 'cutout:hole')?.quantity ?? 0;
    expect(eared - square).toBe(2 * door.hingeCount);
  });
});
