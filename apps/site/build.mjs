/**
 * Build SetOut's own site.
 *
 *   node build.mjs            writes ../../dist/site/site/
 *
 * No framework. Each page is a function in src/pages that returns HTML, and
 * this writes it to a file. The Worker serves those files: at the root of
 * setoutglass.com, and under /site/ where one address serves everything.
 *
 * Three things are checked here so they cannot drift:
 *  - the colours are read from the workspace's own stylesheet;
 *  - the pages written are exactly the pages the Worker will serve;
 *  - every link inside the site points at a page that exists.
 */
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from './src/layout.mjs';
import { PAGES, NOT_FOUND, SITE_URL } from './src/pages/index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

/** The marker the Worker swaps for the site's root on the not-found page. */
export const ROOT_MARKER = '__SITE_ROOT__';

/** The workspace's colour tokens, light and dark, as it declares them. */
export function workspaceTokens(css) {
  const light = /:root\s*\{([^}]*)\}/.exec(css);
  const dark = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css);
  if (!light || !dark) throw new Error("The workspace's colour tokens were not found in its stylesheet.");
  const declarations = (block) =>
    block
      .split(';')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('--') || line.startsWith('color-scheme'))
      .map((line) => `  ${line};`)
      .join('\n');
  for (const name of ['ground', 'surface', 'ink', 'quiet', 'rule', 'accent', 'accent-ink', 'good', 'warn', 'bad']) {
    if (!light[1].includes(`--${name}:`) || !dark[1].includes(`--${name}:`)) {
      throw new Error(`The workspace's stylesheet has no --${name}.`);
    }
  }
  return `:root {\n${declarations(light[1])}\n}\n@media (prefers-color-scheme: dark) {\n:root {\n${declarations(dark[1])}\n}\n}\n`;
}

const hashOf = (content) => createHash('sha256').update(content).digest('hex').slice(0, 10);

/** A file's name with a hash of its contents in it, so it can be cached for good. */
function fingerprint(name, content) {
  const dot = name.lastIndexOf('.');
  return `${name.slice(0, dot)}.${hashOf(content)}${name.slice(dot)}`;
}

/** How to get from a page to the site's root: "./" from the home page, "../" one folder down. */
const rootFrom = (path) => (path === '/' ? './' : '../'.repeat(path.split('/').filter(Boolean).length));

/** Width and height of a WebP picture, so a page can leave room for it. */
function webpSize(bytes) {
  const kind = bytes.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  throw new Error('Not a WebP picture.');
}

export function build(outDir = join(repo, 'dist', 'site', 'site')) {
  // Only ever this folder. The workspace and the designer are built beside it.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'assets'), { recursive: true });

  const assets = {};
  const add = (name, content) => {
    const file = fingerprint(name, content);
    writeFileSync(join(outDir, 'assets', file), content);
    assets[name] = `assets/${file}`;
  };

  const tokens = workspaceTokens(readFileSync(join(repo, 'apps', 'workspace', 'src', 'index.css'), 'utf8'));
  add('site.css', tokens + readFileSync(join(here, 'src', 'site.css'), 'utf8'));
  add('form.js', readFileSync(join(here, 'src', 'client', 'form.js'), 'utf8'));

  const images = {};
  for (const file of readdirSync(join(here, 'src', 'images')).sort()) {
    if (!file.endsWith('.webp')) continue;
    const bytes = readFileSync(join(here, 'src', 'images', file));
    add(file, bytes);
    images[file.replace(/\.webp$/, '')] = { file: assets[file], ...webpSize(bytes) };
  }

  cpSync(join(here, 'src', 'favicon.svg'), join(outDir, 'favicon.svg'));

  const used = new Set();
  const written = [];
  const placeholders = [];
  const write = (page, root) => {
    const tools = {
      root,
      asset: (name) => `${root}${assets[name]}`,
      /** A link to another page of the site, by its path within the site. */
      to: (path) => {
        const [bare] = path.split('#');
        if (!PAGES.some((p) => p.path === bare)) throw new Error(`${page.path} links to ${path}, which is not a page.`);
        return `${root}${path.slice(1)}`;
      },
      /** A picture of SetOut itself, with room left for it before it loads. */
      shot: (name, alt, caption, kind = 'wide') => {
        const image = images[name];
        if (!image) throw new Error(`${page.path} shows ${name}, which is not in src/images.`);
        used.add(name);
        return `<figure class="shot shot-${kind}">
  <img src="${root}${image.file}" width="${image.width}" height="${image.height}" alt="${alt}" loading="lazy" decoding="async">
  <figcaption>${caption}</figcaption>
</figure>`;
      },
    };
    const html = layout(page, page.body(tools), tools);
    for (const match of html.matchAll(/data-placeholder="([^"]+)"/g)) placeholders.push(`${page.path}: ${match[1]}`);
    const dir = join(outDir, page.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html);
    written.push(page.path);
  };

  for (const page of PAGES) write(page, rootFrom(page.path));
  // The not-found page is shown at any address, so its links cannot be
  // relative. The Worker puts the site's root where the marker is.
  write(NOT_FOUND, ROOT_MARKER);

  writeFileSync(join(outDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  writeFileSync(
    join(outDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map(
      (p) => `  <url><loc>${SITE_URL}${p.path}</loc></url>`
    ).join('\n')}\n</urlset>\n`
  );

  // The Worker serves the pages on its list and nothing else, so the two must agree.
  const served = JSON.parse(readFileSync(join(repo, 'apps', 'api', 'src', 'site-pages.json'), 'utf8'));
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (!same(served.pages, PAGES.map((p) => p.path)) || served.notFound !== NOT_FOUND.path) {
    throw new Error('The pages built are not the pages in apps/api/src/site-pages.json. Change both together.');
  }
  if (!same(served.files, ['/robots.txt', '/sitemap.xml', '/favicon.svg'])) {
    throw new Error('The files built are not the files in apps/api/src/site-pages.json. Change both together.');
  }
  const unused = Object.keys(images).filter((name) => !used.has(name));
  if (unused.length) throw new Error(`Pictures no page shows: ${unused.join(', ')}. Remove them from src/images.`);

  return { outDir, pages: written, placeholders };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = build();
  console.log(`Site: ${result.pages.length} pages written to ${result.outDir}`);
  if (result.placeholders.length) {
    console.log(`Still to be confirmed before it goes live (${result.placeholders.length}):`);
    for (const line of result.placeholders) console.log(`  ${line}`);
  }
}
