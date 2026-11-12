#!/usr/bin/env node
/**
 * Makes the CRL product photos SetOut shows, from Matt's copy of CRL's
 * catalogue (data/crl/): every hinge SetOut names (packages/engine/src/hinges.ts)
 * in every finish CRL lists, and every pull handle and knob, since a company
 * may give any of them as a handle's CRL number.
 *
 * It writes two things, both checked in:
 *
 *   apps/designer/public/assets/crl/<name>.webp   the photos, 320px at most
 *   packages/engine/src/crl-photos.ts             which photo each catalogue number has
 *
 * CRL photographs most parts once and shows that photo for every finish, so
 * each different photo is kept once, named by a fingerprint of CRL's file, and
 * the catalogue numbers that share it are listed against it.
 *
 * Run it again whenever data/crl/ is refreshed or SetOut names another hinge:
 *
 *   npm install --no-save sharp@0.34.5
 *   node scripts/crl-photos.mjs
 *
 * The photos are unpacked from data/crl/crl_assets.tar.part* into a new folder
 * outside the repository, which is removed afterwards. To use a copy already
 * unpacked, give its folder: node scripts/crl-photos.mjs /path/to/unpacked
 *
 * The engine's tests check the photos, the list and the catalogue still agree.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = join(root, 'data/crl');
const out = join(root, 'apps/designer/public/assets/crl');
/** Shown at 64px at most, so 320px is sharp on any screen and leaves room to show them bigger. */
const SIZE = 320;
const QUALITY = 82;

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('This needs sharp, which is not one of SetOut’s own dependencies. Run: npm install --no-save sharp@0.34.5');
  process.exit(1);
}

// What SetOut can show ------------------------------------------------------

const catalogue = JSON.parse(readFileSync(join(data, 'crl_shower_catalogue.json'), 'utf8'));
const variants = catalogue.products.flatMap((p) => p.variants.map((v) => ({ ...v, product: p })));

/** CRL's number for each hinge SetOut names, before its finish: GEN044, V1EH037, BEL392. */
const hinges = [...new Set(readFileSync(join(root, 'packages/engine/src/hinges.ts'), 'utf8').match(/(?<=')[A-Z][A-Z0-9]{2,4}\d{3}(?=')/g))];
if (hinges.length === 0) throw new Error('Found no hinge numbers in packages/engine/src/hinges.ts');

const HANDLES = 'Pull Handles and Knobs';
const isHandle = (p) => [p.category, p.category_path, p.also_listed_under].some((text) => (text ?? '').includes(HANDLES));

const wanted = new Map();
for (const series of hinges) {
  // One hinge is one family in CRL's catalogue: its number, then a finish.
  const family = variants.find((v) => v.sku === `${series}CH`)?.product ?? variants.find((v) => v.sku.startsWith(series))?.product;
  if (!family) throw new Error(`CRL's catalogue has no hinge ${series}`);
  for (const v of family.variants) if (v.sku.startsWith(series)) wanted.set(v.sku, v);
}
const hingeCount = wanted.size;
for (const v of variants) if (isHandle(v.product)) wanted.set(v.sku, v);

// The photos -----------------------------------------------------------------

let unpacked = process.argv[2];
let scratch = null;
if (!unpacked) {
  scratch = mkdtempSync(join(tmpdir(), 'crl-photos-'));
  unpacked = scratch;
  const parts = readdirSync(data)
    .filter((name) => /^crl_assets\.tar\.part\d+$/.test(name))
    .sort()
    .map((name) => readFileSync(join(data, name)));
  // Only the photos are unpacked, and nothing in the archive is run.
  const tar = spawnSync('tar', ['-xf', '-', '-C', scratch, 'images'], { input: Buffer.concat(parts), maxBuffer: Infinity });
  if (tar.status !== 0) throw new Error(`Could not unpack the photos: ${tar.stderr}`);
}

try {
  /** Fingerprint of CRL's file to the catalogue numbers that show it. */
  const photos = new Map();
  const missing = [];
  for (const [sku, v] of [...wanted].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const file = v.image_file ? join(unpacked, v.image_file) : null;
    if (!file || !/^images\/[0-9A-Z]+\.gif$/.test(v.image_file) || !existsSync(file)) {
      missing.push(sku);
      continue;
    }
    const source = readFileSync(file);
    const name = createHash('sha256').update(source).digest('hex').slice(0, 12);
    if (!photos.has(name)) photos.set(name, { source, skus: [] });
    photos.get(name).skus.push(sku);
  }

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let bytes = 0;
  for (const [name, { source }] of photos) {
    const webp = await sharp(source)
      // CRL's photos stand on white; any that are see-through are given the same.
      .flatten({ background: '#ffffff' })
      .resize(SIZE, SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 6 })
      .toBuffer();
    writeFileSync(join(out, `${name}.webp`), webp);
    bytes += webp.length;
  }

  const date = String(catalogue.meta.generated_at).slice(0, 10);
  const lines = [...photos].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, { skus }]) => `${name} ${skus.join(' ')}`);
  const listed = lines.reduce((n, line) => n + line.split(' ').length - 1, 0);
  writeFileSync(
    join(root, 'packages/engine/src/crl-photos.ts'),
    `/**
 * CRL's product photos that SetOut shows, from Matt's copy of CRL's catalogue
 * (data/crl/, taken ${date}): ${photos.size} photos for ${listed} catalogue numbers.
 *
 * One line a photo: its file's name (apps/designer/public/assets/crl/<name>.webp),
 * then every catalogue number CRL shows that photo for. CRL photographs most
 * parts once and uses the photo for every finish.
 *
 * Written by scripts/crl-photos.mjs. Do not edit: run the script again when
 * the catalogue is refreshed or SetOut names another hinge. The engine's
 * tests check the files, this list and the catalogue still agree.
 */

export const CRL_PHOTOS = \`
${lines.join('\n')}
\`;
`
  );

  const total = readdirSync(out).reduce((n, name) => n + statSync(join(out, name)).size, 0);
  console.log(`${hinges.length} hinges in ${hingeCount} finishes and ${wanted.size - hingeCount} handles and knobs: ${listed} catalogue numbers.`);
  console.log(`Wrote ${photos.size} photos, ${(total / 1024).toFixed(0)} KB in all (${(bytes / photos.size / 1024).toFixed(1)} KB each on average).`);
  if (missing.length) console.log(`No photo in data/crl for: ${missing.join(', ')}`);
} finally {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
}
