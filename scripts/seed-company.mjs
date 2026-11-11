/**
 * Write the SQL that adds a company and its first designer to a database.
 *
 *   node scripts/seed-company.mjs scripts/seeds/custom-showers.json --key test --notify sales@example.com > seed.sql
 *
 * It only prints. Run what it prints with wrangler, against the database you
 * mean:
 *
 *   npx wrangler d1 execute DB --local --file ../../seed.sql          (from apps/api)
 *   npx wrangler d1 execute DB --env staging --remote --file ../../seed.sql
 *
 * Until the platform admin exists (step 4), this is how a company is added.
 * The notify address is given on the command line so that no inbox is ever
 * committed to the repository.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [file, ...flags] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = flags.indexOf(`--${name}`);
  return i === -1 ? fallback : flags[i + 1];
};
if (!file) {
  console.error('usage: seed-company.mjs <seed.json> [--key test|live] [--notify email[,email]]');
  process.exit(1);
}
const seed = JSON.parse(readFileSync(file, 'utf8'));
const keyKind = flag('key', 'test');
const notify = (flag('notify', '') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (keyKind !== 'test' && keyKind !== 'live') throw new Error('--key must be test or live');
if (!/^[A-Z][A-Z0-9]{1,5}$/.test(seed.referencePrefix)) throw new Error('referencePrefix must be 2 to 6 capitals or digits');

// The same shapes as apps/api/src/lib/ids.ts and newSiteKey in db/platform.ts.
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
function siteKey(kind) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let key = '';
  for (const byte of randomBytes(24)) key += alphabet[byte & 31];
  return `pk_${kind}_${key}`;
}

const sql = (value) => (value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);
const json = (value) => sql(JSON.stringify(value));

const now = new Date().toISOString();
const companyId = id('co');
const designerId = id('dsn');
const key = siteKey(keyKind);

console.log(`-- ${seed.name}: company ${companyId}, designer ${designerId}`);
console.log(`-- site key: ${key}`);
console.log(
  `INSERT INTO companies (id, name, reference_prefix, branding, created_at, updated_at) VALUES (${sql(companyId)}, ${sql(seed.name)}, ${sql(seed.referencePrefix)}, ${json(seed.branding ?? {})}, ${sql(now)}, ${sql(now)});`
);
console.log(
  `INSERT INTO designers (company_id, id, name, site_key, allowed_origins, config, notify_emails, created_at, updated_at) VALUES (${sql(companyId)}, ${sql(designerId)}, ${sql(seed.designer.name)}, ${sql(key)}, ${json(seed.designer.allowedOrigins ?? [])}, ${json(seed.designer.settings ?? {})}, ${json(notify)}, ${sql(now)}, ${sql(now)});`
);
