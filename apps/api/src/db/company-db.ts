/**
 * The company-scoped data layer.
 *
 * Every read and write of a company's data goes through a CompanyDb, and a
 * CompanyDb is made for exactly one company. It adds that company to every
 * statement it builds: every WHERE, every INSERT. Code above this layer has
 * no way to name a company, so it has no way to name the wrong one.
 *
 * That is the first of two locks. The second is in the schema: every row
 * points at (company_id, id), so the database itself refuses to link a row
 * in one company to a row in another, even if this file had a bug.
 *
 * All SQL for company data lives in this file. Routes never write SQL.
 */

import {
  resolveRuleset,
  type EngineContext,
  type RulesetOverrides,
} from '@setout/engine';
import { newId, nowIso } from '../lib/ids';
import {
  ALLOWED_VALUES,
  TABLES,
  type NewRow,
  type Row,
  type RowChanges,
  type TableName,
} from './tables';

export class DataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataError';
  }
}

type Value = string | number | null;

export interface FindOptions<T extends TableName> {
  /** Columns that must equal these values. null matches an empty column. */
  where?: Partial<Row<T>>;
  orderBy?: { column: keyof Row<T> & string; direction?: 'asc' | 'desc' };
  /** At most this many rows. 100 unless given, never more than 500. */
  limit?: number;
  offset?: number;
}

export interface CompanyRecord {
  id: string;
  name: string;
  reference_prefix: string;
  status: string;
  plan: string;
  currency: string;
  branding: Record<string, unknown>;
  settings: Record<string, unknown>;
  features: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type UsageMetric = 'enquiries' | 'quotes_sent';

/** Statements queued to run together, all or nothing. */
export interface Batch {
  /** Queue a new row and return the id it will have. */
  insert<T extends TableName>(table: T, values: NewRow<T>): string;
  update<T extends TableName>(table: T, id: string, changes: RowChanges<T>): void;
  remove(table: TableName, id: string): void;
}

export interface CompanyDb {
  readonly companyId: string;

  /** This company's own record, or null if it does not exist. */
  company(): Promise<CompanyRecord | null>;

  get<T extends TableName>(table: T, id: string): Promise<Row<T> | null>;
  find<T extends TableName>(table: T, options?: FindOptions<T>): Promise<Row<T>[]>;
  count<T extends TableName>(table: T, where?: Partial<Row<T>>): Promise<number>;
  insert<T extends TableName>(table: T, values: NewRow<T>): Promise<Row<T>>;
  /** The changed row, or null if this company has no row with that id. */
  update<T extends TableName>(table: T, id: string, changes: RowChanges<T>): Promise<Row<T> | null>;
  /** True if a row was removed. */
  remove(table: TableName, id: string): Promise<boolean>;

  /** Run several writes together. If one fails, none of them happen. */
  batch(build: (batch: Batch) => void): Promise<void>;

  /** The next readable job reference for this company, such as CS-1001. */
  allocateJobReference(): Promise<string>;

  rulesets: {
    /** The company's current rule changes. Version 0 means none. */
    current(): Promise<{ version: number; overrides: RulesetOverrides }>;
    /** Save a new version. Refused if the engine would not accept the rules. */
    add(overrides: RulesetOverrides, note?: string): Promise<number>;
  };

  /** What the engine needs to make this company's designs, and which rules that is. */
  engineContext(): Promise<{ context: EngineContext; rulesetVersion: number }>;

  usage: {
    add(metric: UsageMetric, month?: string): Promise<void>;
    get(month: string): Promise<{ enquiries: number; quotes_sent: number }>;
  };

  drafts: {
    /** Remove this company's unfinished designs whose time has run out. Says how many went. */
    clearExpired(now?: string): Promise<number>;
  };
}

// ---------------------------------------------------------------------------
// Building statements
// ---------------------------------------------------------------------------

function info(table: string) {
  if (!Object.hasOwn(TABLES, table)) throw new DataError(`There is no table called "${table}".`);
  return TABLES[table as TableName];
}

function assertColumn(table: string, column: string): void {
  if (column === 'company_id') {
    throw new DataError('The company is set by the data layer and cannot be named.');
  }
  if (!info(table).columns.includes(column)) {
    throw new DataError(`"${table}" has no column called "${column}".`);
  }
}

/** A value as it is stored: JSON columns as text, everything else as it is. */
function encode(table: string, column: string, value: unknown): Value {
  if (info(table).json.includes(column)) {
    if (value === undefined) throw new DataError(`"${table}.${column}" has no value.`);
    return JSON.stringify(value);
  }
  if (value === null || typeof value === 'string') return check(table, column, value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  throw new DataError(`"${table}.${column}" must be text, a number or empty.`);
}

function check(table: string, column: string, value: string | null): string | null {
  const allowed = ALLOWED_VALUES[table as TableName]?.[column];
  if (allowed && (value === null || !allowed.includes(value))) {
    throw new DataError(`"${table}.${column}" must be one of ${allowed.join(', ')}.`);
  }
  return value;
}

function decode<T extends TableName>(table: T, stored: Record<string, unknown>): Row<T> {
  const row: Record<string, unknown> = { ...stored };
  for (const column of info(table).json) row[column] = JSON.parse(row[column] as string);
  return row as unknown as Row<T>;
}

/** The given keys, without those left undefined. */
function entries(values: object): [string, unknown][] {
  return Object.entries(values).filter(([, value]) => value !== undefined);
}

function whereClause(table: string, where: object | undefined): { sql: string; params: Value[] } {
  let sql = '';
  const params: Value[] = [];
  for (const [column, value] of entries(where ?? {})) {
    assertColumn(table, column);
    if (info(table).json.includes(column)) {
      throw new DataError(`"${table}.${column}" is JSON and cannot be searched by.`);
    }
    if (value === null) {
      sql += ` AND ${column} IS NULL`;
    } else {
      sql += ` AND ${column} = ?`;
      params.push(encode(table, column, value));
    }
  }
  return { sql, params };
}

interface Built {
  sql: string;
  params: Value[];
}

function buildInsert(companyId: string, table: string, values: object, id: string, now: string): Built {
  const { columns, tracksUpdates } = info(table);
  const row: [string, Value][] = [
    ['company_id', companyId],
    ['id', id],
  ];
  for (const [column, value] of entries(values)) {
    assertColumn(table, column);
    if (column === 'id' || column === 'created_at' || column === 'updated_at') {
      throw new DataError(`"${table}.${column}" is set by the data layer.`);
    }
    row.push([column, encode(table, column, value)]);
  }
  row.push(['created_at', now]);
  if (tracksUpdates) row.push(['updated_at', now]);
  return {
    sql: `INSERT INTO ${table} (${row.map(([c]) => c).join(', ')}) VALUES (${row.map(() => '?').join(', ')}) RETURNING ${columns.join(', ')}`,
    params: row.map(([, v]) => v),
  };
}

function buildUpdate(companyId: string, table: string, id: string, changes: object, now: string): Built {
  const { columns, tracksUpdates } = info(table);
  const set: [string, Value][] = [];
  for (const [column, value] of entries(changes)) {
    assertColumn(table, column);
    if (column === 'id' || column === 'created_at' || column === 'updated_at') {
      throw new DataError(`"${table}.${column}" cannot be changed.`);
    }
    set.push([column, encode(table, column, value)]);
  }
  if (set.length === 0) throw new DataError(`Nothing to change on "${table}".`);
  if (tracksUpdates) set.push(['updated_at', now]);
  return {
    sql: `UPDATE ${table} SET ${set.map(([c]) => `${c} = ?`).join(', ')} WHERE company_id = ? AND id = ? RETURNING ${columns.join(', ')}`,
    params: [...set.map(([, v]) => v), companyId, id],
  };
}

function buildRemove(companyId: string, table: string, id: string): Built {
  info(table);
  return { sql: `DELETE FROM ${table} WHERE company_id = ? AND id = ?`, params: [companyId, id] };
}

// ---------------------------------------------------------------------------
// The handle
// ---------------------------------------------------------------------------

/**
 * The data layer for one company. Made once a request has been tied to a
 * company, by a site key or a sign-in, and never from anything the request
 * itself claims.
 */
export function companyDb(env: Pick<Env, 'DB'>, companyId: string): CompanyDb {
  if (typeof companyId !== 'string' || companyId.length === 0) {
    throw new DataError('A company is needed to read or write company data.');
  }
  const d1 = env.DB;
  const run = ({ sql, params }: Built) => d1.prepare(sql).bind(...params);

  const db: CompanyDb = {
    companyId,

    async company() {
      const row = await d1
        .prepare(
          'SELECT id, name, reference_prefix, status, plan, currency, branding, settings, features, created_at, updated_at FROM companies WHERE id = ?'
        )
        .bind(companyId)
        .first<Record<string, unknown>>();
      if (!row) return null;
      return {
        ...row,
        branding: JSON.parse(row.branding as string),
        settings: JSON.parse(row.settings as string),
        features: JSON.parse(row.features as string),
      } as CompanyRecord;
    },

    async get(table, id) {
      const row = await d1
        .prepare(`SELECT ${info(table).columns.join(', ')} FROM ${table} WHERE company_id = ? AND id = ?`)
        .bind(companyId, id)
        .first<Record<string, unknown>>();
      return row ? decode(table, row) : null;
    },

    async find(table, options = {}) {
      const { columns } = info(table);
      const where = whereClause(table, options.where);
      let order = 'created_at';
      let direction = 'ASC';
      if (options.orderBy) {
        assertColumn(table, options.orderBy.column);
        order = options.orderBy.column;
        direction = options.orderBy.direction === 'desc' ? 'DESC' : 'ASC';
      }
      const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 500);
      const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
      const { results } = await d1
        .prepare(
          `SELECT ${columns.join(', ')} FROM ${table} WHERE company_id = ?${where.sql} ORDER BY ${order} ${direction}, id ${direction} LIMIT ? OFFSET ?`
        )
        .bind(companyId, ...where.params, limit, offset)
        .all<Record<string, unknown>>();
      return results.map((row) => decode(table, row));
    },

    async count(table, where) {
      const clause = whereClause(table, where);
      const row = await d1
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE company_id = ?${clause.sql}`)
        .bind(companyId, ...clause.params)
        .first<{ n: number }>();
      return row?.n ?? 0;
    },

    async insert(table, values) {
      const built = buildInsert(companyId, table, values, newId(info(table).id), nowIso());
      const row = await run(built).first<Record<string, unknown>>();
      if (!row) throw new DataError(`"${table}" did not accept the new row.`);
      return decode(table, row);
    },

    async update(table, id, changes) {
      const row = await run(buildUpdate(companyId, table, id, changes, nowIso())).first<
        Record<string, unknown>
      >();
      return row ? decode(table, row) : null;
    },

    async remove(table, id) {
      const result = await run(buildRemove(companyId, table, id)).run();
      return result.meta.changes > 0;
    },

    async batch(build) {
      const now = nowIso();
      const statements: Built[] = [];
      build({
        insert(table, values) {
          const id = newId(info(table).id);
          statements.push(buildInsert(companyId, table, values, id, now));
          return id;
        },
        update(table, id, changes) {
          statements.push(buildUpdate(companyId, table, id, changes, now));
        },
        remove(table, id) {
          statements.push(buildRemove(companyId, table, id));
        },
      });
      if (statements.length > 0) await d1.batch(statements.map(run));
    },

    async allocateJobReference() {
      const row = await d1
        .prepare(
          'UPDATE companies SET next_job_number = next_job_number + 1, updated_at = ? WHERE id = ? RETURNING reference_prefix, next_job_number - 1 AS number'
        )
        .bind(nowIso(), companyId)
        .first<{ reference_prefix: string; number: number }>();
      if (!row) throw new DataError('This company does not exist.');
      return `${row.reference_prefix}-${row.number}`;
    },

    rulesets: {
      async current() {
        const row = await d1
          .prepare('SELECT version, overrides FROM rulesets WHERE company_id = ? ORDER BY version DESC LIMIT 1')
          .bind(companyId)
          .first<{ version: number; overrides: string }>();
        if (!row) return { version: 0, overrides: {} };
        return { version: row.version, overrides: JSON.parse(row.overrides) as RulesetOverrides };
      },

      async add(overrides, note) {
        // Throws a RulesetError for anything a company may not change.
        resolveRuleset(overrides);
        const row = await d1
          .prepare(
            'INSERT INTO rulesets (company_id, version, overrides, note, created_at) SELECT ?1, COALESCE(MAX(version), 0) + 1, ?2, ?3, ?4 FROM rulesets WHERE company_id = ?1 RETURNING version'
          )
          .bind(companyId, JSON.stringify(overrides), note ?? null, nowIso())
          .first<{ version: number }>();
        if (!row) throw new DataError('The ruleset was not saved.');
        return row.version;
      },
    },

    async engineContext() {
      const [company, ruleset] = await Promise.all([db.company(), db.rulesets.current()]);
      if (!company) throw new DataError('This company does not exist.');
      return {
        context: { rules: resolveRuleset(ruleset.overrides), companyName: company.name },
        rulesetVersion: ruleset.version,
      };
    },

    usage: {
      async add(metric, month = nowIso().slice(0, 7)) {
        if (metric !== 'enquiries' && metric !== 'quotes_sent') {
          throw new DataError(`"${String(metric)}" is not something usage counts.`);
        }
        await d1
          .prepare(
            `INSERT INTO usage_monthly (company_id, month, ${metric}) VALUES (?, ?, 1) ON CONFLICT (company_id, month) DO UPDATE SET ${metric} = ${metric} + 1`
          )
          .bind(companyId, month)
          .run();
      },

      async get(month) {
        const row = await d1
          .prepare('SELECT enquiries, quotes_sent FROM usage_monthly WHERE company_id = ? AND month = ?')
          .bind(companyId, month)
          .first<{ enquiries: number; quotes_sent: number }>();
        return row ?? { enquiries: 0, quotes_sent: 0 };
      },
    },

    drafts: {
      async clearExpired(now = nowIso()) {
        // A draft with a file stored against it is left for whatever clears the file.
        const result = await d1
          .prepare(
            `DELETE FROM drafts WHERE company_id = ? AND expires_at < ?
               AND NOT EXISTS (SELECT 1 FROM files f WHERE f.company_id = drafts.company_id AND f.draft_id = drafts.id)`
          )
          .bind(companyId, now)
          .run();
        return result.meta.changes;
      },
    },
  };

  return db;
}
