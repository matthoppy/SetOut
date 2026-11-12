/**
 * Three addresses, one Worker: which app each address serves, who may show
 * the designer in a frame, and SetOut's own site.
 */
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { companyDb } from '../src/db/company-db';
import { createCompany, newSiteKey } from '../src/db/platform';
import { frameAncestors, SITE_CSP, surfaceFor } from '../src/site';

const DESIGNER = 'https://designer.test';
const APP = 'https://app.test';
const BOTH = 'https://setout-staging.example.workers.dev';
const SITE = 'https://site.test';
const WWW = 'https://www.site.test';

const get = (url: string, init?: RequestInit) => exports.default.fetch(url, init);
const title = async (response: Response) => /<title>(\w+)<\/title>/.exec(await response.text())?.[1] ?? null;

let liveKey = '';
let testKey = '';
let designerId = '';
let pausedKey = '';

beforeAll(async () => {
  const company = await createCompany(env, { name: 'Custom Showers', referencePrefix: 'CS' });
  const db = companyDb(env, company.id);
  liveKey = newSiteKey('live');
  testKey = newSiteKey('test');
  pausedKey = newSiteKey('live');
  const live = await db.insert('designers', {
    name: 'Live site',
    site_key: liveKey,
    allowed_origins: ['https://customshowers.uk', 'https://www.customshowers.uk'],
  });
  designerId = live.id;
  await db.insert('designers', { name: 'Staging site', site_key: testKey, allowed_origins: ['https://staging.customshowers.uk'] });
  await db.insert('designers', { name: 'Old site', site_key: pausedKey, status: 'paused', allowed_origins: ['https://old.example'] });
});

describe('which app an address serves', () => {
  test('by its name, whatever the capitals', () => {
    const hosts = { DESIGNER_HOST: 'designer.test', APP_HOST: 'app.test' };
    expect(surfaceFor(hosts, 'designer.test')).toBe('designer');
    expect(surfaceFor(hosts, 'Designer.Test')).toBe('designer');
    expect(surfaceFor(hosts, 'app.test')).toBe('workspace');
    expect(surfaceFor(hosts, 'setout-staging.example.workers.dev')).toBe('both');
    expect(surfaceFor(hosts, 'evil-designer.test')).toBe('both');
  });

  test('the site by its name, with www or without', () => {
    const hosts = { DESIGNER_HOST: 'designer.test', APP_HOST: 'app.test', SITE_HOST: 'site.test' };
    expect(surfaceFor(hosts, 'site.test')).toBe('site');
    expect(surfaceFor(hosts, 'WWW.Site.Test')).toBe('site');
    expect(surfaceFor(hosts, 'designer.test')).toBe('designer');
    expect(surfaceFor(hosts, 'app.test')).toBe('workspace');
    expect(surfaceFor(hosts, 'other.site.test')).toBe('both');
    expect(surfaceFor(hosts, 'notsite.test')).toBe('both');
    // With no address of its own the site is only ever under /site/.
    expect(surfaceFor({ ...hosts, SITE_HOST: '' }, 'site.test')).toBe('both');
    expect(surfaceFor({ ...hosts, SITE_HOST: '' }, 'www.')).toBe('both');
  });

  test('with no addresses set, everything is served from the one there is', () => {
    expect(surfaceFor({ DESIGNER_HOST: '', APP_HOST: '' }, 'localhost')).toBe('both');
    expect(surfaceFor({ DESIGNER_HOST: '', APP_HOST: '' }, '')).toBe('both');
  });
});

describe('the designer’s address', () => {
  test('serves the designer at its root and at any path', async () => {
    for (const path of ['/', `/?key=${liveKey}`, '/anything', '/designer/', '/jobs/12']) {
      const response = await get(DESIGNER + path);
      expect(response.status, path).toBe(200);
      expect(await title(response), path).toBe('designer');
    }
  });

  test('serves the embed script at its permanent address', async () => {
    const response = await get(`${DESIGNER}/embed.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('/* embed */');
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('serves a customer’s quote, never framed, never cached, never passed on', async () => {
    const response = await get(`${DESIGNER}/q/qt_abcdefghijkmnpqrstuvwxyz23456789`);
    expect(response.status).toBe(200);
    expect(await title(response)).toBe('quote');
    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  test('answers the designer’s own routes and the health check', async () => {
    expect((await get(`${DESIGNER}/api/designer/config?key=${liveKey}`)).status).toBe(200);
    expect((await get(`${DESIGNER}/api/health`)).status).toBe(200);
  });

  test('never offers the workspace, nor the editor staff change a design in', async () => {
    for (const path of ['/', '/jobs/12', '/settings', '/edit/job_1/dsg_1']) {
      expect(await title(await get(DESIGNER + path)), path).not.toBe('workspace');
    }
  });
});

describe('the workspace’s address', () => {
  test('serves the workspace at any path, and can never be framed', async () => {
    for (const path of ['/', '/jobs/12', '/settings/team']) {
      const response = await get(APP + path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get('x-frame-options'), path).toBe('DENY');
      expect(response.headers.get('content-security-policy'), path).toBe("frame-ancestors 'none'");
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff');
      expect(await title(response), path).toBe('workspace');
    }
  });

  test('has no designer, no embed script and no designer routes', async () => {
    for (const path of ['/designer', '/designer/', `/designer/?key=${liveKey}`, '/embed.js', '/designer/embed.js', '/q/qt_abcdefghijkmnpqrstuvwxyz23456789']) {
      const response = await get(APP + path);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).toBe('Not found');
    }
    for (const path of [`/api/designer/config?key=${liveKey}`, '/api/designer/enquiries']) {
      const response = await get(APP + path, path.endsWith('enquiries') ? { method: 'POST', body: '{}' } : undefined);
      expect(response.status, path).toBe(404);
      expect(await response.json(), path).toEqual({ error: 'not_found' });
    }
  });

  test('serves the editor staff change a design in, which can never be framed', async () => {
    const response = await get(`${APP}/edit/job_1/dsg_1`);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('content-security-policy')).toBe("frame-ancestors 'none'");
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(await title(response)).toBe('editor');
  });

  test('still answers the health check, and passes other files through', async () => {
    expect((await get(`${APP}/api/health`)).status).toBe(200);
    const icon = await get(`${APP}/favicon.ico`);
    expect(icon.headers.get('content-type')).toMatch(/^image\//);
    expect((await icon.arrayBuffer()).byteLength).toBe(4);
    expect(icon.headers.get('x-frame-options')).toBeNull();
  });
});

describe('one address for both, as on staging', () => {
  test('the designer is under /designer/ and the workspace is everywhere else', async () => {
    expect(await title(await get(`${BOTH}/designer/?key=${testKey}`))).toBe('designer');
    expect(await title(await get(`${BOTH}/designer`))).toBe('designer');
    expect(await title(await get(`${BOTH}/`))).toBe('workspace');
    expect(await title(await get(`${BOTH}/jobs/12`))).toBe('workspace');
    expect(await title(await get(`${BOTH}/edit/job_1/dsg_1`))).toBe('editor');
    expect(await title(await get(`${BOTH}/q/qt_abcdefghijkmnpqrstuvwxyz23456789`))).toBe('quote');
    expect((await get(`${BOTH}/designer/embed.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await get(`${BOTH}/embed.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await get(`${BOTH}/api/designer/config?key=${testKey}`)).status).toBe(200);
  });
});

describe('SetOut’s own site, on its own address', () => {
  test('serves its pages at the root, for search engines to read', async () => {
    for (const [path, page] of [['/', 'site'], ['/pricing/', 'pricing']]) {
      const response = await get(SITE + path);
      expect(response.status, path).toBe(200);
      expect(await title(response), path).toBe(page);
      expect(response.headers.get('content-type'), path).toContain('text/html');
      expect(response.headers.get('x-robots-tag'), path).toBeNull();
      expect(response.headers.get('cache-control'), path).toBe('no-cache');
    }
  });

  test('can never be framed, and loads nothing but its own files and the bot check', async () => {
    const response = await get(`${SITE}/`);
    expect(response.headers.get('content-security-policy')).toBe(SITE_CSP);
    expect(SITE_CSP).toContain("frame-ancestors 'none'");
    expect(SITE_CSP).toContain("default-src 'none'");
    expect(SITE_CSP).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(SITE_CSP).not.toContain('unsafe');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  test('sends a page asked for without its last slash to the one with it', async () => {
    const response = await get(`${SITE}/pricing?from=email`, { redirect: 'manual' });
    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe('/pricing/?from=email');
  });

  test('answers a page it does not have with its own not-found page, never the workspace', async () => {
    for (const path of ['/nothing-here', '/jobs/12', '/sign-in', '/designer/', '/site/', '/site/pricing/', '/embed.js', '/edit/job_1/dsg_1', '/q/qt_abcdefghijkmnpqrstuvwxyz23456789', '/pricing/extra', '/index.html', '/not-found/']) {
      const response = await get(SITE + path);
      expect(response.status, path).toBe(404);
      expect(await title(response), path).toBe('missing');
      expect(response.headers.get('cache-control'), path).toBe('no-store');
      expect(response.headers.get('content-security-policy'), path).toBe(SITE_CSP);
    }
  });

  test('the not-found page’s links start at the root, however deep the address', async () => {
    const response = await get(`${SITE}/a/b/c`);
    expect(await response.text()).toContain('<a href="/pricing/">Pricing</a>');
    const head = await get(`${SITE}/a/b/c`, { method: 'HEAD' });
    expect(head.status).toBe(404);
    expect(await head.text()).toBe('');
  });

  test('serves its stylesheet for good, and its other files for an hour', async () => {
    const style = await get(`${SITE}/assets/site.abc123.css`);
    expect(style.status).toBe(200);
    expect(await style.text()).toBe('/* site */\n');
    expect(style.headers.get('content-type')).toContain('text/css');
    expect(style.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(style.headers.get('x-content-type-options')).toBe('nosniff');

    const robots = await get(`${SITE}/robots.txt`);
    expect(robots.status).toBe(200);
    expect(await robots.text()).toContain('User-agent: *');
    expect(robots.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  test('a file it does not have is not found, not the workspace’s page', async () => {
    for (const path of ['/assets/gone.css', '/sitemap.xml', '/favicon.svg', '/favicon.ico']) {
      const response = await get(SITE + path);
      expect(response.status, path).toBe(404);
      expect(await title(response), path).toBe('missing');
    }
  });

  test('www is sent to the address without it, path and all', async () => {
    for (const [path, to] of [['/', '/'], ['/pricing/?a=1', '/pricing/?a=1'], ['/anything', '/anything']]) {
      const response = await get(WWW + path, { redirect: 'manual' });
      expect(response.status, path).toBe(301);
      expect(response.headers.get('location'), path).toBe(`https://site.test${to}`);
    }
  });

  test('takes nothing but a read', async () => {
    const response = await get(`${SITE}/get-started/`, { method: 'POST' });
    expect(response.status).toBe(405);
  });
});

describe('SetOut’s own site, where everything shares one address', () => {
  test('is under /site/, and is never for search engines there', async () => {
    for (const [path, page] of [['/site/', 'site'], ['/site/pricing/', 'pricing']]) {
      const response = await get(BOTH + path);
      expect(response.status, path).toBe(200);
      expect(await title(response), path).toBe(page);
      expect(response.headers.get('x-robots-tag'), path).toBe('noindex');
      expect(response.headers.get('content-security-policy'), path).toBe(SITE_CSP);
    }
    const style = await get(`${BOTH}/site/assets/site.abc123.css`);
    expect(style.headers.get('content-type')).toContain('text/css');
    expect(style.headers.get('x-robots-tag')).toBe('noindex');
  });

  test('keeps its redirects and its not-found page under /site/', async () => {
    for (const [path, to] of [['/site', '/site/'], ['/site/pricing', '/site/pricing/']]) {
      const response = await get(BOTH + path, { redirect: 'manual' });
      expect(response.status, path).toBe(301);
      expect(response.headers.get('location'), path).toBe(to);
    }
    const missing = await get(`${BOTH}/site/nothing-here/at/all`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('x-robots-tag')).toBe('noindex');
    // Its links are to the site under /site/, however deep the address that was asked for.
    expect(await missing.text()).toContain('<title>missing</title><a href="/site/pricing/">Pricing</a>');
  });

  test('leaves the workspace and the designer where they were', async () => {
    expect(await title(await get(`${BOTH}/`))).toBe('workspace');
    expect(await title(await get(`${BOTH}/sites`))).toBe('workspace');
    expect(await title(await get(`${BOTH}/designer/`))).toBe('designer');
  });
});

describe('the other two addresses and the site', () => {
  test('the workspace’s address has no site', async () => {
    for (const path of ['/site', '/site/', '/site/pricing/', '/site/assets/site.abc123.css']) {
      const response = await get(APP + path);
      expect(response.status, path).toBe(404);
      expect(await response.text(), path).toBe('Not found');
    }
  });

  test('nor has the designer’s', async () => {
    for (const path of ['/site/', '/site/pricing/']) {
      expect(await title(await get(DESIGNER + path)), path).toBe('designer');
    }
  });
});

describe('who may show a designer in a frame', () => {
  const policy = async (url: string) => (await get(url)).headers.get('content-security-policy');

  test('only the websites listed for that designer', async () => {
    expect(await policy(`${DESIGNER}/?key=${liveKey}`)).toBe(
      'frame-ancestors https://customshowers.uk https://www.customshowers.uk'
    );
  });

  test('a test key may also be framed from a developer’s own machine', async () => {
    expect(await policy(`${DESIGNER}/?key=${testKey}`)).toBe(
      'frame-ancestors https://staging.customshowers.uk http://localhost:* http://127.0.0.1:*'
    );
  });

  test('nobody, with no key, an unknown key or a designer that is switched off', async () => {
    for (const query of ['', '?key=', '?key=pk_live_nobodyathome0000000000', `?key=${pausedKey}`, "?key=' OR 1=1"]) {
      expect(await policy(`${DESIGNER}/${query}`), query).toBe("frame-ancestors 'none'");
    }
  });

  test('the page is never kept by a cache, and the old frame header is gone', async () => {
    const response = await get(`${DESIGNER}/?key=${liveKey}`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-frame-options')).toBeNull();
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  test('a change to the list takes effect on the next page load', async () => {
    const db = companyDb(env, (await env.DB.prepare('SELECT company_id FROM designers WHERE id = ?').bind(designerId).first<{ company_id: string }>())!.company_id);
    await db.update('designers', designerId, { allowed_origins: ['https://customshowers.uk'] });
    expect(await policy(`${DESIGNER}/?key=${liveKey}`)).toBe('frame-ancestors https://customshowers.uk');
  });

  test('nothing but a plain https address ever reaches the header', () => {
    const stored = [
      'https://good.example',
      'HTTPS://Capitals.Example',
      'https://with-port.example:8443',
      'http://not-secure.example',
      "https://evil.example; script-src *",
      'https://evil.example\r\nSet-Cookie: x=1',
      'javascript:alert(1)',
      '*',
      'https://*.wild.example',
      'https://path.example/page',
      '',
    ];
    expect(frameAncestors('pk_live_abcdefghijklmnopqrstuvwx', stored)).toBe(
      'frame-ancestors https://good.example https://capitals.example https://with-port.example:8443'
    );
    expect(frameAncestors('pk_live_abcdefghijklmnopqrstuvwx', [])).toBe("frame-ancestors 'none'");
    expect(frameAncestors('pk_live_abcdefghijklmnopqrstuvwx', ['nonsense'])).toBe("frame-ancestors 'none'");
    expect(frameAncestors(undefined, ['https://good.example'])).toBe("frame-ancestors 'none'");
    expect(frameAncestors('pk_live_abcdefghijklmnopqrstuvwx', null)).toBe("frame-ancestors 'none'");
  });
});

describe('what a page will not do', () => {
  test('take anything but a read', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const response = await get(`${APP}/`, { method });
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow')).toBe('GET, HEAD');
    }
  });
});
