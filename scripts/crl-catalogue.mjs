#!/usr/bin/env node
/**
 * Writes packages/engine/src/crl-catalogue.ts: every catalogue number in
 * Matt's copy of CRL's shower hardware catalogue (data/crl/), so the engine
 * can say whether CRL makes a part in a finish.
 *
 * Run it again whenever data/crl/ is refreshed:
 *
 *   node scripts/crl-catalogue.mjs
 *
 * The engine's tests read the catalogue too, and fail if the two disagree.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(readFileSync(join(root, 'data/crl/crl_shower_catalogue.json'), 'utf8'));

const skus = [...new Set(catalogue.products.flatMap((p) => p.variants.map((v) => v.sku)))].sort();
for (const sku of skus) {
  if (!/^[0-9A-Z]+$/.test(sku)) throw new Error(`Unexpected catalogue number: ${sku}`);
}
const date = String(catalogue.meta.generated_at).slice(0, 10);

const lines = [];
let line = '';
for (const sku of skus) {
  if (line && line.length + sku.length + 1 > 100) {
    lines.push(line);
    line = '';
  }
  line = line ? `${line} ${sku}` : sku;
}
if (line) lines.push(line);

const out = `/**
 * Every catalogue number in Matt's copy of CRL's shower hardware catalogue
 * (data/crl/, taken ${date}), ${skus.length} in all, space separated.
 *
 * Written by scripts/crl-catalogue.mjs from data/crl/crl_shower_catalogue.json.
 * Do not edit: run the script again when the catalogue is refreshed. The
 * engine's tests check the two still agree.
 */

export const CRL_CATALOGUE_DATE = '${date}';

export const CRL_CATALOGUE = \`
${lines.join('\n')}
\`;
`;

writeFileSync(join(root, 'packages/engine/src/crl-catalogue.ts'), out);
console.log(`Wrote ${skus.length} catalogue numbers, taken ${date}.`);
