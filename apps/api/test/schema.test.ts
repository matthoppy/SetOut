/**
 * The schema's conventions, checked against the database itself.
 *
 * These read the tables as the migrations left them, so a later migration
 * that forgets a convention fails here: a table with no company, an index
 * that does not start with the company, a link that leaves the company out.
 */
import { env } from 'cloudflare:workers';
import { expect, test } from 'vitest';
import { TABLES } from '../src/db/tables';

/** Tables that belong to the platform, not to a company. */
const PLATFORM_TABLES = ['companies', 'users', 'login_tokens', 'sessions'];
/** Company tables reached through their own methods, not the general ones. */
const SPECIAL_TABLES = ['rulesets', 'usage_monthly'];
/**
 * The only indexes that may start with something other than the company:
 * the keys that say which company a request belongs to.
 */
const GLOBAL_LOOKUPS = ['designers.site_key', 'drafts.resume_token_hash', 'memberships.user_id', 'quotes.link_token_hash'];

const all = async <T>(sql: string) => (await env.DB.prepare(sql).all<T>()).results;

async function tableNames(): Promise<string[]> {
  const rows = await all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY name"
  );
  return rows.map((r) => r.name);
}

test('every table is one the data layer knows about', async () => {
  const known = [...PLATFORM_TABLES, ...SPECIAL_TABLES, ...Object.keys(TABLES)].sort();
  expect(await tableNames()).toEqual(known);
});

test('the data layer’s column lists match the tables', async () => {
  for (const [table, info] of Object.entries(TABLES)) {
    const columns = await all<{ name: string }>(`PRAGMA table_info(${table})`);
    expect(columns.map((c) => c.name).sort(), table).toEqual(['company_id', ...info.columns].sort());
  }
});

test('every company table is keyed by the company first', async () => {
  for (const table of await tableNames()) {
    if (PLATFORM_TABLES.includes(table)) continue;
    const columns = await all<{ name: string; pk: number; notnull: number }>(`PRAGMA table_info(${table})`);
    const firstKey = columns.find((c) => c.pk === 1);
    expect(firstKey?.name, `${table} primary key`).toBe('company_id');
    expect(columns.filter((c) => c.pk > 0).length, `${table} primary key`).toBeGreaterThanOrEqual(2);
  }
});

test('every index on a company table starts with the company', async () => {
  for (const table of await tableNames()) {
    if (PLATFORM_TABLES.includes(table)) continue;
    const indexes = await all<{ name: string }>(`PRAGMA index_list(${table})`);
    expect(indexes.length, `${table} has no indexes at all`).toBeGreaterThan(0);
    for (const index of indexes) {
      const columns = await all<{ seqno: number; name: string }>(`PRAGMA index_info("${index.name}")`);
      const first = columns.find((c) => c.seqno === 0)?.name;
      if (first === 'company_id') continue;
      expect(GLOBAL_LOOKUPS, `${table} index ${index.name} starts with ${first}`).toContain(`${table}.${first}`);
      expect(columns.length, `${table} index ${index.name}`).toBe(1);
    }
  }
});

test('every link between company tables carries the company', async () => {
  for (const table of await tableNames()) {
    if (PLATFORM_TABLES.includes(table)) continue;
    const keys = await all<{ id: number; table: string; from: string; to: string }>(
      `PRAGMA foreign_key_list(${table})`
    );
    const byLink = new Map<number, typeof keys>();
    for (const key of keys) byLink.set(key.id, [...(byLink.get(key.id) ?? []), key]);
    let pointsAtCompany = false;
    for (const columns of byLink.values()) {
      const target = columns[0].table;
      if (target === 'companies') {
        expect(columns.map((c) => c.from), `${table} to companies`).toEqual(['company_id']);
        pointsAtCompany = true;
        continue;
      }
      // A platform row, such as a user, belongs to no company, so a link to it
      // is by its id alone.
      if (PLATFORM_TABLES.includes(target)) {
        expect(columns.map((c) => c.to), `${table} to ${target}`).toEqual(['id']);
        continue;
      }
      expect(columns.map((c) => c.from), `${table} to ${target}`).toContain('company_id');
      expect(columns.map((c) => c.to), `${table} to ${target}`).toContain('company_id');
    }
    expect(pointsAtCompany, `${table} must belong to a company that exists`).toBe(true);
  }
});

test('every table is strict about its types', async () => {
  const rows = await all<{ name: string; strict: number }>('PRAGMA table_list');
  for (const table of await tableNames()) {
    expect(rows.find((r) => r.name === table)?.strict, table).toBe(1);
  }
});

test('the database is consistent', async () => {
  expect(await all('PRAGMA foreign_key_check')).toEqual([]);
});
