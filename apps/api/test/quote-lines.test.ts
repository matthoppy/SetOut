/** A quote's lines name each door's hinges as CRL makes them, and price each of CRL's hinges on its own. */
import { applyTemplate, buildSpec, createInitialState, DEFAULT_RULESET, designFromTemplate, TEMPLATES, type ConfiguratorState } from '@setout/engine';
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

describe('a sliding shower on a quote', () => {
  test('has its Serenity kit in place of hinges and a handle, priced as last sent', () => {
    const lines = draftLines([shower(designFromTemplate('sliding-alcove'))], labels, new Map([['sliding-kit:ser78:chrome', 42000]]));
    expect(lines.some((l) => l.key?.startsWith('hinge:') || l.key?.startsWith('handle:'))).toBe(false);
    expect(lines.find((l) => l.key === 'sliding-kit:ser78:chrome')).toEqual({
      key: 'sliding-kit:ser78:chrome',
      description: 'Serenity sliding door kit (CRL SER78), Polished chrome',
      quantity: 1,
      unit: 'each',
      unitPricePence: 42000,
    });
    // Both panes at their sliding sizes, and channel for the fixed panel only.
    expect(lines.filter((l) => l.key?.startsWith('glass:')).map((l) => l.description.match(/\d+ × \d+mm/)?.[0])).toEqual(['622 × 1995mm', '622 × 1992mm']);
    expect(lines.find((l) => l.key === 'channel:chrome')?.quantity).toBe(0.6);
  });

  test('with a return has the return kit too', () => {
    const keys = draftLines([shower(designFromTemplate('sliding-return'))], labels, new Map()).map((l) => l.key);
    expect(keys).toContain('sliding-kit:ser78:chrome');
    expect(keys).toContain('sliding-kit:ser90:chrome');
  });

  test('a hinged shower has no sliding line', () => {
    const template = TEMPLATES.find((t) => t.id === 'alcove-panel-door');
    if (!template) throw new Error('no template');
    const lines = draftLines([shower(applyTemplate(createInitialState(10), template))], labels, new Map());
    expect(lines.some((l) => l.key?.startsWith('sliding-kit:'))).toBe(false);
  });
});
