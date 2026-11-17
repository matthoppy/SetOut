/**
 * Write the SQL that adds ESG Group Ltd as a glass supplier, with the
 * Brennan Glass 03.03.2026 cost list, and a CRL hardware supplier with no
 * prices yet, for one company.
 *
 *   node scripts/seed-suppliers.mjs --company co_01... > seed-suppliers.sql
 *
 * It only prints. Run what it prints with wrangler, against the database you
 * mean, after the 0012_suppliers migration has been applied:
 *
 *   npx wrangler d1 execute DB --local --file ../../seed-suppliers.sql
 *   npx wrangler d1 execute DB --env staging --remote --file ../../seed-suppliers.sql
 *
 * This script will not run, and will not print, for production. It refuses
 * --env production, the production environment name, and the production D1
 * id. It never defaults to Custom Showers’ production company id: you must
 * pass --company yourself.
 *
 * The ESG list is written as a draft. Activate it in Settings (or pass
 * --activate) when you are ready for new quotes to use these costs. Site
 * delivery is on the list, so an active list will add delivery to a new
 * quote.
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
const has = (name) => argv.includes(`--${name}`);

if (joined.includes(PRODUCTION_D1) || /\bproduction\b/.test(joined) || process.env.ENVIRONMENT === 'production') {
  console.error('Refusing to seed suppliers for production. This script never runs against production D1.');
  process.exit(1);
}

const companyId = flag('company');
if (!companyId || !/^co_[0-9A-HJKMNP-TV-Z]{26}$/i.test(companyId)) {
  console.error('usage: seed-suppliers.mjs --company co_... [--activate]');
  console.error('Pass the company id explicitly. This script will not default to a production company.');
  process.exit(1);
}

const activate = has('activate');
const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(here, '..', 'data', 'esg', 'brennan-glass-03.03.2026.csv');
const csv = readFileSync(csvPath, 'utf8');

// A small CSV reader that matches the import format (header + quoted fields).
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
  const min = col(fields, 'min_area_m2');
  const rules = min ? { minAreaM2: Math.round(Number(min) * 100) / 100 } : {};
  return {
    key: col(fields, 'key') ? col(fields, 'key').toLowerCase() : null,
    sku: col(fields, 'sku') || null,
    description: col(fields, 'description'),
    unit: col(fields, 'unit').toLowerCase(),
    costPence: Math.round(pounds * 100),
    notes: col(fields, 'notes') || null,
    rules,
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
const listId = id('lst');
const crlId = id('sup');
const listStatus = activate ? 'active' : 'draft';

console.log(`-- Suppliers for company ${companyId}`);
console.log('-- ESG Group Ltd (glass) and C.R. Laurence (hardware). ESG list is a draft unless --activate was passed.');
console.log('-- Do not run this against production.');
console.log(`UPDATE suppliers SET is_default = 0, updated_at = ${sql(now)} WHERE company_id = ${sql(companyId)} AND kind = 'glass' AND is_default = 1;`);
console.log(`UPDATE suppliers SET is_default = 0, updated_at = ${sql(now)} WHERE company_id = ${sql(companyId)} AND kind = 'hardware' AND is_default = 1;`);
console.log(
  `INSERT INTO suppliers (company_id, id, name, kind, account_ref, notes, is_default, active, created_at, updated_at) VALUES (${sql(companyId)}, ${sql(esgId)}, 'ESG Group Ltd', 'glass', NULL, ${sql('Glass processor. Costs from the Brennan Glass list of 3 March 2026 are a rough guide until ESG confirms they apply to Custom Showers.')}, 1, 1, ${sql(now)}, ${sql(now)});`
);
console.log(
  `INSERT INTO suppliers (company_id, id, name, kind, account_ref, notes, is_default, active, created_at, updated_at) VALUES (${sql(companyId)}, ${sql(crlId)}, 'C.R. Laurence', 'hardware', NULL, ${sql('Hardware supplier. Catalogue SKUs can be imported once Smart Glazier prices are available. No prices have been loaded.')}, 1, 1, ${sql(now)}, ${sql(now)});`
);
console.log(
  `INSERT INTO supplier_price_lists (company_id, id, supplier_id, name, status, effective_from, effective_to, currency, vat_included, source, notes, created_at, updated_at) VALUES (${sql(companyId)}, ${sql(listId)}, ${sql(esgId)}, 'Brennan Glass 03.03.2026', ${sql(listStatus)}, '2026-03-03', NULL, 'GBP', 0, ${sql('Brennan Glass - 03.03.2026 - Price List.pdf (fwd Ronan Brennan 2026-03-31)')}, ${sql('Trade costs issued to Brennan Glass, plus VAT, based on agreed volume. Enduroshield is by the square metre (email correction).')}, ${sql(now)}, ${sql(now)});`
);
for (const item of items) {
  const itemId = id('pit');
  console.log(
    `INSERT INTO supplier_price_items (company_id, id, list_id, key, sku, description, unit, cost_pence, sell_pence, rules, notes, created_at, updated_at) VALUES (${sql(companyId)}, ${sql(itemId)}, ${sql(listId)}, ${sql(item.key)}, ${sql(item.sku)}, ${sql(item.description)}, ${sql(item.unit)}, ${item.costPence}, NULL, ${sql(JSON.stringify(item.rules))}, ${sql(item.notes)}, ${sql(now)}, ${sql(now)});`
  );
}
console.log(`-- ESG supplier ${esgId}, list ${listId} (${items.length} items, ${listStatus}); CRL supplier ${crlId}, no list.`);
