/**
 * Serving the two apps.
 *
 * One Worker answers on two addresses. The designer's address serves the
 * designer and its embed script, and is made to be shown in a frame on a
 * company's own website. The workspace's address serves the workspace, holds
 * staff sign-ins, and must never be framed by anyone. They are kept on
 * separate addresses so that nothing running in the public designer can reach
 * a signed-in workspace.
 *
 * Where there is only one address (staging's workers.dev name, and a
 * developer's machine), both are served from it by path: the designer under
 * /designer/ and the workspace everywhere else.
 */

import type { Context } from 'hono';
import { designerFrameOrigins } from './db/platform';

export type Surface = 'designer' | 'workspace' | 'both';

type SiteContext = Context<{ Bindings: Env }>;

/** Which app this address serves. */
export function surfaceFor(env: Pick<Env, 'DESIGNER_HOST' | 'APP_HOST'>, hostname: string): Surface {
  const host = hostname.toLowerCase();
  if (env.DESIGNER_HOST && host === env.DESIGNER_HOST) return 'designer';
  if (env.APP_HOST && host === env.APP_HOST) return 'workspace';
  return 'both';
}

const isEmbedScript = (path: string) => path === '/embed.js' || path === '/designer/embed.js';
/** Where staff change a sent design: /edit/<job>/<shower>. */
const isEditorPath = (path: string) => path.startsWith('/edit/');
const isDesignerPath = (path: string) => path === '/designer' || path.startsWith('/designer/');

/** An origin as it may appear in a header: https and a host, nothing else. */
const SAFE_ORIGIN = /^https:\/\/[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/;

/**
 * Who may show this designer in a frame, as a Content-Security-Policy value.
 *
 * Only the websites listed for the designer. A test key may also be framed
 * from a developer's own machine. With no key, or an unknown one, nobody may.
 */
export function frameAncestors(siteKey: string | undefined, origins: string[] | null): string {
  if (!siteKey || origins === null) return "frame-ancestors 'none'";
  const allowed = origins.map((o) => o.toLowerCase()).filter((o) => SAFE_ORIGIN.test(o));
  if (siteKey.startsWith('pk_test_')) allowed.push('http://localhost:*', 'http://127.0.0.1:*');
  return allowed.length > 0 ? `frame-ancestors ${allowed.join(' ')}` : "frame-ancestors 'none'";
}

function withHeaders(response: Response, headers: Record<string, string | null>): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(headers)) {
    if (value === null) out.headers.delete(name);
    else out.headers.set(name, value);
  }
  return out;
}

const COMMON = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

async function designerPage(c: SiteContext): Promise<Response> {
  const url = new URL(c.req.url);
  const siteKey = url.searchParams.get('key') ?? undefined;
  const origins = siteKey ? await designerFrameOrigins(c.env, siteKey) : null;
  const page = await c.env.ASSETS.fetch(new Request(new URL('/designer/', url), { headers: c.req.raw.headers }));
  return withHeaders(page, {
    ...COMMON,
    'Content-Security-Policy': frameAncestors(siteKey, origins),
    // Which websites may frame it depends on the key, so it is never reused.
    'Cache-Control': 'no-store',
    'X-Frame-Options': null,
  });
}

async function embedScript(c: SiteContext): Promise<Response> {
  const url = new URL(c.req.url);
  const script = await c.env.ASSETS.fetch(new Request(new URL('/designer/embed.js', url)));
  return withHeaders(script, {
    ...COMMON,
    'Content-Type': 'text/javascript; charset=utf-8',
    // Companies paste this address once and never change it, so a fix has to
    // reach every site within the hour without anyone doing anything.
    'Cache-Control': 'public, max-age=3600',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Frame-Options': null,
  });
}

async function workspacePage(c: SiteContext): Promise<Response> {
  // Unknown paths fall back to the workspace page, which routes them itself.
  const page = await c.env.ASSETS.fetch(c.req.raw);
  if (!(page.headers.get('content-type') ?? '').includes('text/html')) {
    return withHeaders(page, COMMON);
  }
  return withHeaders(page, {
    ...COMMON,
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-cache',
  });
}

/**
 * The editor staff change a sent design in. It is the designer's own code,
 * served on the workspace's address, because it works with a staff session,
 * and it may never be framed.
 */
async function editorPage(c: SiteContext): Promise<Response> {
  const page = await c.env.ASSETS.fetch(new Request(new URL('/designer/edit', c.req.url), { headers: c.req.raw.headers }));
  return withHeaders(page, {
    ...COMMON,
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-cache',
  });
}

const notFound = () => new Response('Not found', { status: 404, headers: { ...COMMON, 'Cache-Control': 'no-store' } });

/** Everything that is not the API: the designer, its embed script and the workspace. */
export async function serveSite(c: SiteContext): Promise<Response> {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(c.req.url);
  const surface = surfaceFor(c.env, url.hostname);
  const path = url.pathname;

  if (surface !== 'designer' && isEditorPath(path)) return editorPage(c);
  if (surface === 'workspace') {
    if (isEmbedScript(path) || isDesignerPath(path)) return notFound();
    return workspacePage(c);
  }
  if (isEmbedScript(path)) return embedScript(c);
  if (surface === 'designer' || isDesignerPath(path)) return designerPage(c);
  return workspacePage(c);
}
