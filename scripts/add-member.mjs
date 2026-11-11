/**
 * Write the SQL that puts a person on a company's team, so they can sign in
 * to the workspace.
 *
 *   node scripts/add-member.mjs co_01... someone@example.com --role owner --name "Their name" > member.sql
 *
 * It only prints. Run what it prints with wrangler, against the database you
 * mean:
 *
 *   npx wrangler d1 execute DB --local --file ../../member.sql          (from apps/api)
 *   npx wrangler d1 execute DB --env staging --remote --file ../../member.sql
 *
 * It does what addMember in apps/api/src/db/auth.ts does: the person's user is
 * made if they have none, and someone already on the team takes the role
 * given. Nothing is added if the company id is wrong. Until owners can invite
 * their own staff, this is how a person is added. The address is given on the
 * command line so that no inbox is ever committed to the repository.
 */
import { randomBytes } from 'node:crypto';

const [companyId, rawEmail, ...flags] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = flags.indexOf(`--${name}`);
  return i === -1 ? fallback : flags[i + 1];
};
if (!companyId || !rawEmail) {
  console.error('usage: add-member.mjs <company id> <email> [--role owner|staff] [--name "Name"]');
  process.exit(1);
}
// The same rules as normaliseEmail and ROLES in the API.
const email = rawEmail.trim().toLowerCase();
if (email.length > 254 || !/^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/.test(email)) throw new Error('That is not an email address.');
if (!/^co_[0-9A-HJKMNP-TV-Z]{26}$/.test(companyId)) throw new Error('The company id should look like co_01...');
const role = flag('role', 'staff');
if (role !== 'owner' && role !== 'staff') throw new Error('--role must be owner or staff');
const name = flag('name', null);

// The same shape as apps/api/src/lib/ids.ts.
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

const sql = (value) => (value === null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`);
const now = sql(new Date().toISOString());
const company = `EXISTS (SELECT 1 FROM companies WHERE id = ${sql(companyId)})`;

console.log(`-- ${email} on ${companyId} as ${role}`);
console.log(
  `INSERT INTO users (id, email, name, created_at, updated_at) SELECT ${sql(id('usr'))}, ${sql(email)}, ${sql(name)}, ${now}, ${now} WHERE ${company} ON CONFLICT (email) DO NOTHING;`
);
console.log(
  `INSERT INTO memberships (company_id, id, user_id, role, created_at, updated_at) SELECT ${sql(companyId)}, ${sql(id('mem'))}, id, ${sql(role)}, ${now}, ${now} FROM users WHERE email = ${sql(email)} AND ${company} ON CONFLICT (company_id, user_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at;`
);
