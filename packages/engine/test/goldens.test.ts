/**
 * Known designs, checked against known cut lists.
 *
 * A wrong number here is toughened glass in a skip, so every change to the
 * engine is run against designs whose correct answer is already known. If one
 * of these fails, the engine now cuts that shower differently. That is either
 * a bug, or a deliberate change that needs the golden updated on purpose and
 * the engine version raised.
 */
import { describe, expect, test } from 'vitest';
import { buildSpec, DEFAULT_RULESET, upgradeDocument } from '../src';
import { deepFreeze, GOLDEN_COMPANY, GOLDENS } from './goldens';

const context = { rules: DEFAULT_RULESET, companyName: GOLDEN_COMPANY };

test('the goldens are all there', () => {
  expect(GOLDENS.length).toBe(33);
  expect(new Set(GOLDENS.map((g) => g.name)).size).toBe(GOLDENS.length);
});

describe.each(GOLDENS)('$name: $title', (golden) => {
  test('cuts to the known sizes', () => {
    const spec = buildSpec(structuredClone(golden.document.design), context);
    expect(spec.panels.map((p) => [p.id, p.cutWidthMm, p.cutHeightMm])).toEqual(
      golden.expected.spec.panels.map((p) => [p.id, p.cutWidthMm, p.cutHeightMm])
    );
  });

  test('gives the whole known spec: hardware, cutouts, notes and warnings', () => {
    const spec = buildSpec(structuredClone(golden.document.design), context);
    // Through JSON, because that is how a spec is stored and sent.
    expect(JSON.parse(JSON.stringify(spec))).toEqual(golden.expected.spec);
  });

  test('reads back unchanged through the document check', () => {
    expect(upgradeDocument(structuredClone(golden.document))).toEqual(golden.document);
  });

  test('is not changed by being worked out', () => {
    const design = deepFreeze(structuredClone(golden.document.design));
    expect(() => buildSpec(design, context)).not.toThrow();
  });
});
