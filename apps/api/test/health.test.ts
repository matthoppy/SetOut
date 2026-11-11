import { DOCUMENT_FORMAT, ENGINE_VERSION } from '@setout/engine';
import { env, exports } from 'cloudflare:workers';
import { expect, test } from 'vitest';

test('the health check reports the engine, its known answer and the database', async () => {
  const response = await exports.default.fetch('https://setout.test/api/health');
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({
    ok: true,
    service: 'setout',
    environment: 'local',
    commit: 'local',
    engine: ENGINE_VERSION,
    documentFormat: DOCUMENT_FORMAT,
    selfCheck: { ok: true, cutSizes: '395 x 1980, 690 x 1980', expected: '395 x 1980, 690 x 1980' },
    // Every migration in the folder has been applied, however many there are by now.
    database: { ok: true, migrations: env.TEST_MIGRATIONS.length },
  });
});

test('an unknown API route is a plain 404, not a page', async () => {
  const response = await exports.default.fetch('https://setout.test/api/nothing-here');
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: 'not_found' });
});

test('the API never answers with another verb’s success', async () => {
  const response = await exports.default.fetch('https://setout.test/api/health', { method: 'DELETE' });
  expect(response.status).toBe(404);
});
