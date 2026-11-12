/**
 * Helpers for the workspace's tests: two addresses, companies with a designer,
 * designs sent the way customers send them, and signing in the way a browser
 * does.
 */
import { createDocument, designFromTemplate } from '@setout/engine';
import { env, exports } from 'cloudflare:workers';
import { expect } from 'vitest';
import { companyDb, type CompanyDb } from '../src/db/company-db';
import { createCompany, newSiteKey } from '../src/db/platform';
import app from '../src/index';
import { SESSION_COOKIE } from '../src/routes/workspace';

export const APP = 'https://app.test';
export const DESIGNER = 'https://designer.test';

export const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
export const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3];
export const PNG = base64(PNG_BYTES);
export const JPEG = base64([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]);

export interface Company {
  id: string;
  name: string;
  db: CompanyDb;
  siteKey: string;
}

export async function company(name: string, prefix: string): Promise<Company> {
  const record = await createCompany(env, { name, referencePrefix: prefix });
  const db = companyDb(env, record.id);
  const siteKey = newSiteKey('test');
  await db.insert('designers', { name: `${name} website`, site_key: siteKey, allowed_origins: [] });
  return { id: record.id, name, db, siteKey };
}

/** A customer sends a design through the company's designer. Answers with its reference. */
export async function enquire(c: Company, name: string, email: string, postcode: string, phone = '020 7946 0000'): Promise<string> {
  const response = await exports.default.fetch(`${DESIGNER}/api/designer/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteKey: c.siteKey,
      document: createDocument(designFromTemplate('alcove-panel-door')),
      templateId: 'alcove-panel-door',
      customer: { name, email, phone, postcode, notes: 'Tray is in.', measurementsAcknowledged: true },
      attachments: [
        { filename: 'plan-view.png', content: PNG, kind: 'drawing' },
        { filename: 'left-wall.jpg', content: JPEG, kind: 'photo' },
      ],
      turnstileToken: null,
      antispam: { honeypot: '', elapsedMs: 240_000 },
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { reference: string }).reference;
}

export interface Call extends RequestInit {
  cookie?: string;
  origin?: string | null;
}

/** A call to the workspace's API, from the workspace's own page unless told otherwise. */
export function api(path: string, init: Call = {}, host = APP): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', `${SESSION_COOKIE}=${init.cookie}`);
  const method = init.method ?? 'GET';
  if (method !== 'GET' && init.origin !== null) headers.set('Origin', init.origin ?? host);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return exports.default.fetch(`${host}/api/workspace${path}`, { ...init, method, headers });
}

export const post = (path: string, body: unknown, init: Call = {}) => api(path, { ...init, method: 'POST', body: JSON.stringify(body) });

/** The session cookie a response set, if it set one. */
export function sessionFrom(response: Response): string | null {
  const header = response.headers.get('Set-Cookie') ?? '';
  const match = new RegExp(`${SESSION_COOKIE.replace(/[-]/g, '\\-')}=([^;]*)`).exec(header);
  return match ? match[1] : null;
}

/** Sign in as this person, the way a browser does: ask for a link, then use it. */
export async function signIn(email: string): Promise<string> {
  const asked = await post('/sign-in', { email });
  const { link } = (await asked.json()) as { link: string };
  const token = new URL(link).searchParams.get('token');
  const used = await post('/sign-in/verify', { token });
  expect(used.status).toBe(200);
  const session = sessionFrom(used);
  if (!session) throw new Error('no session cookie');
  return session;
}

export const json = async <T>(response: Response) => (await response.json()) as T;

/** What a deploy is switched to and holds, where a test needs something other than a developer's machine. */
export type Overrides = Partial<
  Pick<
    Env,
    | 'ENVIRONMENT'
    | 'SIGNUPS'
    | 'BILLING'
    | 'TRIAL_DAYS'
    | 'PLATFORM_ADMINS'
    | 'TURNSTILE_SECRET_KEY'
    | 'TURNSTILE_SITE_KEY'
    | 'STRIPE_SECRET_KEY'
    | 'STRIPE_WEBHOOK_SECRET'
    | 'RESEND_API_KEY'
    | 'EMAIL_FROM'
  >
>;

/**
 * A call to the Worker with some of its settings changed, as another deploy
 * would have them. `path` is the whole path, such as /api/platform/companies.
 * A change comes from the workspace's own page unless told otherwise.
 */
export async function callWith(overrides: Overrides, path: string, init: Call = {}, host = APP): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set('Cookie', `${SESSION_COOKIE}=${init.cookie}`);
  const method = init.method ?? 'GET';
  if (method !== 'GET' && init.origin !== null) headers.set('Origin', init.origin ?? host);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const waiting: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => void waiting.push(promise),
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext;
  const response = await app.fetch(new Request(`${host}${path}`, { ...init, method, headers }), { ...env, ...overrides }, ctx);
  await Promise.all(waiting);
  return response;
}

/** The body of a JSON call. */
export const body = (value: unknown) => JSON.stringify(value);

