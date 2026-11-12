/**
 * Serving the apps and SetOut's own site.
 *
 * One Worker answers on three addresses. The designer's address serves the
 * designer and its embed script, and is made to be shown in a frame on a
 * company's own website. The workspace's address serves the workspace, holds
 * staff sign-ins, and must never be framed by anyone. They are kept on
 * separate addresses so that nothing running in the public designer can reach
 * a signed-in workspace.
 *
 * The third is SetOut's own site, the public pages that say what SetOut is.
 * They are plain files, written at build time, and its address serves nothing
 * else.
 *
 * Where there is only one address (staging's workers.dev name, and a
 * developer's machine), all three are served from it by path: the designer
 * under /designer/, the site under /site/ and the workspace everywhere else.
 */

import type { Context } from 'hono';
import { designerFrameOrigins } from './db/platform';
import sitePages from './site-pages.json';

export type Surface = 'designer' | 'workspace' | 'site' | 'both';

type SiteContext = Context<{ Bindings: Env }>;

/** Which app this address serves. */
export function surfaceFor(
  env: Pick<Env, 'DESIGNER_HOST' | 'APP_HOST'> & { SITE_HOST?: string },
  hostname: string
): Surface {
  const host = hostname.toLowerCase();
  // The site answers on its name with and without www. The www one only redirects.
  if (env.SITE_HOST && (host === env.SITE_HOST || host === `www.${env.SITE_HOST}`)) return 'site';
  if (env.DESIGNER_HOST && host === env.DESIGNER_HOST) return 'designer';
  if (env.APP_HOST && host === env.APP_HOST) return 'workspace';
  return 'both';
}

const isEmbedScript = (path: string) => path === '/embed.js' || path === '/designer/embed.js';
/** Where staff change a sent design: /edit/<job>/<shower>. */
const isEditorPath = (path: string) => path.startsWith('/edit/');
/** Where a customer reads and accepts their quote: /q/<link>. */
const isQuotePath = (path: string) => path.startsWith('/q/');
const isDesignerPath = (path: string) => path === '/designer' || path.startsWith('/designer/');
/** Where the site lives on an address that serves everything by path. */
const SITE_PREFIX = '/site';
const isSitePath = (path: string) => path === SITE_PREFIX || path.startsWith(`${SITE_PREFIX}/`);
/** What the site's build writes in its not-found page where the site's root goes. */
const SITE_ROOT_MARKER = '__SITE_ROOT__';

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

/**
 * A customer's quote. Public, like the designer, but never framed, never
 * kept by a cache, and its address, which is the customer's link, is never
 * sent on to anywhere it links to.
 */
async function quotePage(c: SiteContext): Promise<Response> {
  const page = await c.env.ASSETS.fetch(new Request(new URL('/designer/quote', c.req.url), { headers: c.req.raw.headers }));
  return withHeaders(page, {
    ...COMMON,
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
}

// ---------------------------------------------------------------------------
// SetOut's own site
// ---------------------------------------------------------------------------

/**
 * What a page of the site may load: its own files, and Cloudflare's bot check
 * on the get-started form. Nothing else, from anywhere, and nobody may frame it.
 */
export const SITE_CSP = [
  "default-src 'none'",
  "style-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * A page or file of the site.
 *
 * `path` is the path within the site, whatever address it is on: `/pricing/`
 * both at setoutglass.com/pricing/ and at /site/pricing/ on staging. `prefix`
 * is where the site starts on this address: nothing on its own, /site by path.
 *
 * The files live under /site/ in the built folder. That folder answers any
 * path it does not have with the workspace's page, so which pages exist is
 * decided here, from the list the site's build is checked against, and
 * anything else gets the site's own not-found page.
 */
async function sitePage(c: SiteContext, path: string, prefix: string): Promise<Response> {
  const url = new URL(c.req.url);
  // Only the real address is for search engines. Staging and a developer's
  // machine serve the same pages and must never be listed.
  const robots = prefix === '' ? null : 'noindex';
  const file = (sitePath: string, conditional = true) =>
    c.env.ASSETS.fetch(
      new Request(new URL(`${SITE_PREFIX}${sitePath}`, url), {
        method: c.req.method,
        headers: conditional ? c.req.raw.headers : undefined,
      })
    );
  const pageHeaders = {
    ...COMMON,
    'Content-Security-Policy': SITE_CSP,
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': robots,
  };
  const missing = async () => {
    const page = await file(sitePages.notFound, false);
    // This page is shown at any address, so its links cannot be relative.
    // The build leaves a marker where the site's root goes.
    const html = (await page.text()).replaceAll(SITE_ROOT_MARKER, `${prefix}/`);
    return withHeaders(new Response(c.req.method === 'HEAD' ? null : html, { status: 404, headers: page.headers }), {
      ...pageHeaders,
      'Cache-Control': 'no-store',
      'Content-Length': null,
      ETag: null,
    });
  };

  if (sitePages.pages.includes(path)) {
    return withHeaders(await file(path), { ...pageHeaders, 'Cache-Control': 'no-cache' });
  }
  // /pricing is /pricing/, so that a page's own links always work.
  if (sitePages.pages.includes(`${path}/`)) {
    return new Response(null, {
      status: 301,
      headers: { ...COMMON, Location: `${prefix}${path}/${url.search}`, 'Cache-Control': 'public, max-age=3600' },
    });
  }
  const fingerprinted = path.startsWith('/assets/');
  if (fingerprinted || sitePages.files.includes(path)) {
    const found = await file(path);
    // None of the site's files is a page, so a page here is the folder's
    // fallback for a file it does not have.
    if ((found.headers.get('content-type') ?? '').includes('text/html')) return missing();
    return withHeaders(found, {
      ...COMMON,
      'X-Robots-Tag': robots,
      // A stylesheet, script or picture has a hash of its contents in its name.
      'Cache-Control': fingerprinted ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
    });
  }
  return missing();
}

const notFound = () => new Response('Not found', { status: 404, headers: { ...COMMON, 'Cache-Control': 'no-store' } });

/** Everything that is not the API: the designer, its embed script, the workspace and SetOut's own site. */
export async function serveSite(c: SiteContext): Promise<Response> {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(c.req.url);
  const surface = surfaceFor(c.env, url.hostname);
  const path = url.pathname;

  if (surface === 'site') {
    const siteHost = c.env.SITE_HOST;
    if (url.hostname.toLowerCase() !== siteHost) {
      // www is the same site. One address is the real one, so that is where it sends people.
      return new Response(null, {
        status: 301,
        headers: { ...COMMON, Location: `https://${siteHost}${path}${url.search}`, 'Cache-Control': 'public, max-age=3600' },
      });
    }
    return sitePage(c, path, '');
  }
  if (surface === 'both' && isSitePath(path)) return sitePage(c, path.slice(SITE_PREFIX.length), SITE_PREFIX);

  if (surface !== 'designer' && isEditorPath(path)) return editorPage(c);
  if (surface !== 'workspace' && isQuotePath(path)) return quotePage(c);
  if (surface === 'workspace') {
    if (isEmbedScript(path) || isDesignerPath(path) || isQuotePath(path) || isSitePath(path)) return notFound();
    return workspacePage(c);
  }
  if (isEmbedScript(path)) return embedScript(c);
  if (surface === 'designer' || isDesignerPath(path)) return designerPage(c);
  return workspacePage(c);
}
