/**
 * The SetOut API.
 *
 * One Worker. It answers /api and serves the built designer and workspace,
 * so all three ship together with the same engine. See site.ts for which
 * address serves which app.
 *
 * Routes arrive with the steps that need them: the designer's, the
 * workspace's, the platform admin's and Stripe's webhook. The health check is what a deploy is judged by.
 */

import { DOCUMENT_FORMAT, ENGINE_VERSION, selfCheck } from '@setout/engine';
import { Hono } from 'hono';
import { databaseStatus } from './db/platform';
import { designer } from './routes/designer';
import { platform } from './routes/platform';
import { quote } from './routes/quote';
import { stripeWebhook } from './routes/stripe-webhook';
import { workspace } from './routes/workspace';
import { serveSite, surfaceFor } from './site';

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

// The designer's routes answer on the designer's address, and nowhere a staff
// sign-in lives. The workspace's routes are the reverse: nothing running in
// the public designer can reach them.
app.use('/api/designer/*', async (c, next) => {
  if (surfaceFor(c.env, new URL(c.req.url).hostname) === 'workspace') {
    return c.json({ error: 'not_found' }, 404);
  }
  await next();
});
app.route('/api/designer', designer);

// A customer's quote is read and accepted on the designer's address, the
// public one, too.
app.use('/api/quote/*', async (c, next) => {
  if (surfaceFor(c.env, new URL(c.req.url).hostname) === 'workspace') {
    return c.json({ error: 'not_found' }, 404);
  }
  await next();
});
app.route('/api/quote', quote);

app.use('/api/workspace/*', async (c, next) => {
  if (surfaceFor(c.env, new URL(c.req.url).hostname) === 'designer') {
    return c.json({ error: 'not_found' }, 404);
  }
  await next();
});
app.route('/api/workspace', workspace);

// SetOut's own staff, and Stripe's webhook, answer on the workspace's address
// too, and never on the public designer's.
app.use('/api/platform/*', async (c, next) => {
  if (surfaceFor(c.env, new URL(c.req.url).hostname) === 'designer') {
    return c.json({ error: 'not_found' }, 404);
  }
  await next();
});
app.route('/api/platform', platform);

app.use('/api/stripe/*', async (c, next) => {
  if (surfaceFor(c.env, new URL(c.req.url).hostname) === 'designer') {
    return c.json({ error: 'not_found' }, 404);
  }
  await next();
});
app.route('/api/stripe', stripeWebhook);

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

// Everything else is one of the two apps.
app.all('*', serveSite);

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
