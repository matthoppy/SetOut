import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { DOCUMENT_FORMAT, ENGINE_VERSION, selfCheck } from '../src';

test('the engine version matches its package', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  expect(ENGINE_VERSION).toBe(pkg.version);
});

test('the document format is a whole number', () => {
  expect(Number.isInteger(DOCUMENT_FORMAT)).toBe(true);
  expect(DOCUMENT_FORMAT).toBeGreaterThanOrEqual(1);
});

test('the self check gives the known answer', () => {
  expect(selfCheck()).toEqual({
    ok: true,
    cutSizes: '395 x 1980, 690 x 1980',
    expected: '395 x 1980, 690 x 1980',
  });
});
