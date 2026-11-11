/**
 * Two addresses, one Worker: which app each address serves, and who may
 * show the designer in a frame.
 */
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { companyDb } from '../src/db/company-db';
import { createCompany, newSiteKey } from '../src/db/platform';
import { frameAncestors, surfaceFor } from '../src/site';

const DESIGNER = 'https://designer.test';
const APP = 'https://app.test';
const BOTH = 'https://setout-staging.example.workers.dev';

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
    for (const path of ['/designer', '/designer/', `/designer/?key=${liveKey}`, '/embed.js', '/designer/embed.js']) {
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
    expect((await get(`${BOTH}/designer/embed.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await get(`${BOTH}/embed.js`)).headers.get('content-type')).toContain('text/javascript');
    expect((await get(`${BOTH}/api/designer/config?key=${testKey}`)).status).toBe(200);
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
