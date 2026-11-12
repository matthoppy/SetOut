/**
 * The site as built: the pages the Worker expects, links that go somewhere,
 * nothing a strict content security policy would refuse, and none of the
 * things the site must not say.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, ROOT_MARKER, workspaceTokens } from '../build.mjs';
import { NOT_FOUND, PAGES } from '../src/pages/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const out = join(mkdtempSync(join(tmpdir(), 'setout-site-')), 'site');
const result = build(out);

const html = (path) => readFileSync(join(out, path, 'index.html'), 'utf8');
const pages = PAGES.map((page) => ({ ...page, html: html(page.path) }));
const everyPage = [...pages, { ...NOT_FOUND, html: html(NOT_FOUND.path) }];

/** The words of a page as a person reads them. */
const words = (page) => page.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** Where the site may link to that is not itself. */
const OUTSIDE = [
  'https://app.setoutglass.com/',
  'https://customshowers.uk/design-shower',
  'https://ico.org.uk/make-a-complaint/',
];

test('writes every page the Worker serves, and the files beside them', () => {
  const served = JSON.parse(readFileSync(join(repo, 'apps', 'api', 'src', 'site-pages.json'), 'utf8'));
  assert.deepEqual(result.pages.sort(), [...served.pages, served.notFound].sort());
  for (const file of served.files) assert.ok(existsSync(join(out, file)), file);
  assert.match(readFileSync(join(out, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/setoutglass\.com\/pricing\/<\/loc>/);
  assert.match(readFileSync(join(out, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/setoutglass\.com\/sitemap\.xml/);
});

test('uses the workspace’s own colours, light and dark', () => {
  const workspace = readFileSync(join(repo, 'apps', 'workspace', 'src', 'index.css'), 'utf8');
  const css = readFileSync(join(out, 'assets', readdirSync(join(out, 'assets')).find((f) => f.endsWith('.css'))), 'utf8');
  assert.ok(css.startsWith(workspaceTokens(workspace)));
  for (const token of ['--ground: 246 245 242', '--accent: 29 61 102', '--ground: 18 22 27', '--accent: 140 182 235']) {
    assert.ok(workspace.includes(token) && css.includes(token), token);
  }
  assert.throws(() => workspaceTokens(':root { --ground: 1 2 3; }'), /colour tokens were not found/);
});

test('every page says what it is, once', () => {
  const titles = new Set();
  for (const page of everyPage) {
    assert.match(page.html, /^<!doctype html>\n<html lang="en-GB">/, page.path);
    assert.equal(page.html.match(/<h1[ >]/g)?.length, 1, `${page.path} has one h1`);
    assert.equal(page.html.match(/<main id="main">/g)?.length, 1, page.path);
    assert.ok(page.html.includes(`<title>${page.title}</title>`), page.path);
    assert.ok(page.description.length > 20 && page.description.length <= 160, `${page.path} description`);
    assert.ok(page.title.length <= 65, `${page.path} title`);
    assert.ok(page.html.includes('<a class="skip" href="#main">'), page.path);
    titles.add(page.title);
  }
  assert.equal(titles.size, everyPage.length);
  for (const page of pages) {
    assert.ok(page.html.includes(`<link rel="canonical" href="https://setoutglass.com${page.path}">`), page.path);
  }
  assert.ok(!html(NOT_FOUND.path).includes('rel="canonical"'));
  assert.ok(html(NOT_FOUND.path).includes('<meta name="robots" content="noindex">'));
});

test('has nothing a strict content security policy would refuse', () => {
  for (const page of everyPage) {
    assert.doesNotMatch(page.html, /\sstyle=/, `${page.path} has an inline style`);
    assert.doesNotMatch(page.html, /<style/, `${page.path} has a style block`);
    assert.doesNotMatch(page.html, /\son[a-z]+=/, `${page.path} has an inline handler`);
    for (const script of page.html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      assert.match(script[1], /\ssrc="/, `${page.path} has a script written into it`);
      assert.equal(script[2], '', page.path);
    }
  }
  // Only the form's page runs a script at all.
  for (const page of everyPage) {
    assert.equal(page.html.includes('<script'), page.path === '/get-started/', page.path);
  }
});

test('every link and file inside the site is there, from wherever the page is', () => {
  for (const page of pages) {
    const refs = [...page.html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(refs.length > 5, page.path);
    for (const ref of refs) {
      if (ref.startsWith('#')) {
        assert.ok(page.html.includes(`id="${ref.slice(1)}"`), `${page.path} links to ${ref}`);
        continue;
      }
      if (ref.startsWith('mailto:')) {
        // The one address on the site, where Matt said enquiries and privacy questions go.
        assert.equal(ref, 'mailto:sales@customshowers.uk', `${page.path} emails ${ref}`);
        continue;
      }
      if (/^https?:/.test(ref)) {
        const allowed = OUTSIDE.includes(ref) || ref.startsWith('https://setoutglass.com/');
        assert.ok(allowed, `${page.path} links outside the site, to ${ref}`);
        continue;
      }
      assert.ok(!ref.startsWith('/'), `${page.path} has a link that only works at the root: ${ref}`);
      const [path, anchor] = ref.split('#');
      const target = join(out, page.path, path);
      const file = path.endsWith('/') || path === '.' ? join(target, 'index.html') : target;
      assert.ok(existsSync(file), `${page.path} links to ${ref}, which is not there`);
      if (anchor) assert.ok(readFileSync(file, 'utf8').includes(`id="${anchor}"`), `${page.path} links to ${ref}`);
    }
  }
});

test('the not-found page’s links wait for the Worker to say where the site starts', () => {
  const page = html(NOT_FOUND.path);
  const refs = [...page.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(ref.startsWith(ROOT_MARKER) || ref.startsWith('#') || OUTSIDE.includes(ref), ref);
  }
  assert.ok(refs.some((ref) => ref === `${ROOT_MARKER}pricing/`));
});

test('every picture has words for it and room left for it', () => {
  let count = 0;
  for (const page of pages) {
    for (const [img] of page.html.matchAll(/<img[^>]+>/g)) {
      count++;
      assert.match(img, /\salt="[^"]{30,}"/, `${page.path}: ${img.slice(0, 80)}`);
      assert.match(img, /\swidth="\d+" height="\d+"/, `${page.path}: ${img.slice(0, 80)}`);
    }
  }
  assert.ok(count >= 10);
});

test('the form asks for what the API reads, with a label on every box', () => {
  const page = html('/get-started/');
  for (const name of ['company', 'name', 'email', 'phone', 'website', 'showers', 'message']) {
    assert.match(page, new RegExp(`<label for="${name}">`), name);
    assert.match(page, new RegExp(`id="${name}" name="${name}"`), name);
  }
  for (const band of ['under-5', '5-20', '20-50', 'over-50', 'unsure']) {
    assert.ok(page.includes(`<option value="${band}">`), band);
  }
  const api = readFileSync(join(repo, 'apps', 'api', 'src', 'lib', 'site-enquiry.ts'), 'utf8');
  for (const band of ['under-5', '5-20', '20-50', 'over-50', 'unsure']) assert.ok(api.includes(`${band}`), band);
  assert.ok(page.includes('role="alert"'));
  assert.ok(page.includes('<noscript>'));
});

test('says nothing it must not', () => {
  for (const page of everyPage) {
    const text = words(page.html);
    // No price is decided, so no amount of money appears anywhere.
    assert.doesNotMatch(text, /£\s?\d|\d+\s?(p|pence)\b|per month|\/month|a month for/i, `${page.path} names a price`);
    // Sign-up, trials and card billing are not built.
    assert.doesNotMatch(text, /free trial|14-day|start your trial|sign up (now|today|free)|no credit card/i, page.path);
    // Nothing made up to impress.
    assert.doesNotMatch(text, /testimonial|trusted by|\d+%|\d+ (companies|customers|showers designed)|award/i, page.path);
    // Custom Showers is the only company the site names.
    assert.doesNotMatch(text, /Brennan/i, `${page.path} names a company it must not`);
    // Tracking of any kind would show up as one of these.
    assert.doesNotMatch(page.html, /googletagmanager|google-analytics|gtag\(|plausible|fathom|hotjar|fbq\(|document\.cookie/i, page.path);
  }
});

test('lists what is still to be settled, so none of it goes live by accident', () => {
  assert.deepEqual(result.placeholders.sort(), [
    '/pricing/: prices',
    '/privacy/: enquiry-retention',
    '/privacy/: legal-details',
  ]);
});
