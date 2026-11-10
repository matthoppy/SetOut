import { expect, test } from 'vitest';
import { ID_PREFIX, newId, nowIso } from '../src/lib/ids';

test('an id is its prefix, ten characters of time and sixteen of chance', () => {
  for (const [kind, prefix] of Object.entries(ID_PREFIX)) {
    expect(newId(kind as keyof typeof ID_PREFIX)).toMatch(new RegExp(`^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`));
  }
});

test('ids made later sort later', () => {
  const earlier = newId('job', Date.UTC(2026, 10, 10));
  const later = newId('job', Date.UTC(2026, 10, 11));
  expect(earlier < later).toBe(true);
  expect(earlier.slice(0, 14)).toBe(newId('job', Date.UTC(2026, 10, 10)).slice(0, 14));
});

test('ids do not repeat', () => {
  const now = Date.now();
  const ids = new Set(Array.from({ length: 20_000 }, () => newId('job', now)));
  expect(ids.size).toBe(20_000);
});

test('the clock is UTC', () => {
  expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});
