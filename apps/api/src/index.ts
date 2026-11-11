/**
 * The SetOut API.
 *
 * One Worker. It answers /api, and the built designer and workspace are
 * served beside it as files, so all three ship together with the same engine.
 *
 * Routes arrive with the steps that need them. The designer's routes are
 * here; the workspace's come in step 2. The health check is what a deploy is
 * judged by.
 */

import { DOCUMENT_FORMAT, ENGINE_VERSION, selfCheck } from '@setout/engine';
import { Hono } from 'hono';
import { databaseStatus } from './db/platform';
import { designer } from './routes/designer';

const app = new Hono<{ Bindings: Env }>();

/**
 * Is this deploy alive, which engine is it running, does that engine give the
 * known answer for a known design, and can it reach its database? The apps
 * run the same check on their own copy of the engine, so a disagreement
 * between the three is visible at a glance.
 */
app.get('/api/health', async (c) => {
  const database = await databaseStatus(c.env);
  const check = selfCheck();
  const ok = database.ok && check.ok;
  return c.json(
    {
      ok,
      service: 'setout',
      environment: c.env.ENVIRONMENT,
      commit: c.env.COMMIT,
      engine: ENGINE_VERSION,
      documentFormat: DOCUMENT_FORMAT,
      selfCheck: check,
      database,
    },
    ok ? 200 : 503,
    { 'Cache-Control': 'no-store' }
  );
});

app.route('/api/designer', designer);

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      message: 'unhandled error',
      error: error instanceof Error ? error.message : String(error),
      path: new URL(c.req.url).pathname,
      method: c.req.method,
    })
  );
  return c.json({ error: 'internal_error' }, 500);
});

export default app;
