/**
 * Write the SQL that adds ESG Group Ltd as the default glass supplier, with
 * the Brennan Glass 03.03.2026 cost list, and C.R. Laurence as the default
 * hardware supplier with no prices yet, for one company.
 *
 *   node scripts/seed-suppliers.mjs --company co_01... > seed-suppliers.sql
 *
 * It only prints. Run what it prints with wrangler, against the database you
 * mean, after the 0013_supplier_kinds migration has been applied:
 *
 *   npx wrangler d1 execute DB --local --file ../../seed-suppliers.sql
 *   npx wrangler d1 execute DB --env staging --remote --file ../../seed-suppliers.sql
 *
 * This script will not run, and will not print, for production. It refuses
 * --env production, the production environment name, and the production D1
 * id. It never defaults to Custom Showers’ production company id: you must
 * pass --company yourself.
 *
 * The ESG figures are trade costs issued to Brennan Glass, plus VAT, “based
 * on agreed volume”. They are a rough guide until ESG confirms the same
 * rates apply. Do not load them into the selling price book. Site delivery
 * is on the list for the record; a new quote does not add delivery by itself.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_D1 = 'faee68c8-6ecf-4884-b724-e80f98672d50';
const argv = process.argv.slice(2);
const joined = argv.join(' ').toLowerCase();

const flag = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

if (joined.includes(PRODUCTION_D1) || /\bproduction\b/.test(joined) || process.env.ENVIRONMENT === 'production') {
  console.error('Refusing to seed suppliers for production. This script never runs against production D1.');
  process.exit(1);
}

const companyId = flag('company');
if (!companyId || !/^co_[0-9A-HJKMNP-TV-Z]{26}$/i.test(companyId)) {
  console.error('usage: seed-suppliers.mjs --company co_...');
  console.error('Pass the company id explicitly. This script will not default to a production company.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(here, '..', 'data', 'esg', 'brennan-glass-03.03.2026.csv');
const csv = readFileSync(csvPath, 'utf8');

function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else quoted = false;
      } else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      fields.push(current);
      current = '';
    } else current += ch;
  }
  fields.push(current);
  return fields;
}

const lines = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
const col = (fields, name) => {
  const at = headers.indexOf(name);
  return at < 0 ? '' : (fields[at] ?? '').trim();
};
const items = lines.slice(1).map((line, i) => {
  const fields = splitCsvLine(line);
  const cost = col(fields, 'cost');
  const pounds = Number(cost.replace(/^£/, '').replace(/,/g, ''));
  if (!Number.isFinite(pounds) || pounds < 0) throw new Error(`Row ${i + 2}: bad cost "${cost}"`);
  const sku = col(fields, 'sku') || null;
  const key = col(fields, 'key') ? col(fields, 'key').toLowerCase() : sku ? `sku:${sku}` : null;
  if (!key) throw new Error(`Row ${i + 2}: an item needs a SetOut key or a SKU.`);
  return {
    key,
    sku,
    unit: col(fields, 'unit').toLowerCase(),
    costPence: Math.round(pounds * 100),
  };
});

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function id(prefix) {
  let time = '';
  let rest = Date.now();
  for (let i = 0; i < 10; i++) {
    time = BASE32[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  let random = '';
  for (const byte of randomBytes(16)) random += BASE32[byte & 31];
  return `${prefix}_${time}${random}`;
}

const sql = (value) => (value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);
const now = new Date().toISOString();
const esgId = id('sup');
const crlId = id('sup');

console.log(`-- Suppliers for company ${companyId}`);
console.log('-- ESG Group Ltd (default glass) and C.R. Laurence (default hardware).');
console.log('-- ESG costs are a rough guide, issued to Brennan Glass, plus VAT, based on agreed volume.');
console.log('-- Do not run this against production. Do not load these figures into price_list.');
console.log(`UPDATE suppliers SET is_default = 0, updated_at = ${sql(now)} WHERE company_id = ${sql(companyId)} AND kind IN ('glass', 'hardware') AND is_default = 1;`);
console.log(
  `INSERT INTO suppliers (company_id, id, name, kind, is_default, created_at, updated_at) VALUES (${sql(companyId)}, ${sql(esgId)}, 'ESG Group Ltd', 'glass', 1, ${sql(now)}, ${sql(now)});`
);
console.log(
  `INSERT INTO suppliers (company_id, id, name, kind, is_default, created_at, updated_at) VALUES (${sql(companyId)}, ${sql(crlId)}, 'C.R. Laurence', 'hardware', 1, ${sql(now)}, ${sql(now)});`
);
for (const item of items) {
  const itemId = id('spr');
  console.log(
    `INSERT INTO supplier_prices (company_id, id, supplier_id, key, unit, cost_pence, sku, created_at, updated_at) VALUES (${sql(companyId)}, ${sql(itemId)}, ${sql(esgId)}, ${sql(item.key)}, ${sql(item.unit)}, ${item.costPence}, ${sql(item.sku)}, ${sql(now)}, ${sql(now)});`
  );
}
console.log(`-- ESG supplier ${esgId} (${items.length} prices); CRL supplier ${crlId}, no prices.`);
