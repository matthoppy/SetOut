/**
 * The tables a company owns, as the data layer knows them.
 *
 * Two things live here and must agree with the migrations: the shape of a row
 * in TypeScript, and the list of column names the data layer is allowed to
 * put into SQL. A column that is not listed cannot be read or written, which
 * is also what makes a column name from outside harmless.
 *
 * company_id is on every one of these tables and in none of these lists. The
 * data layer adds it itself; nothing above the data layer can name it.
 */

import type { ConfiguratorSpec, DesignDocument } from '@setout/engine';
import type { IdKind } from '../lib/ids';

export const JOB_STAGES = ['new', 'reviewing', 'quoted', 'ordered', 'done', 'closed'] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const JOB_SOURCES = ['designer', 'form', 'manual', 'import'] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const ACTOR_KINDS = ['customer', 'staff', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const FILE_KINDS = ['photo', 'measuring_photo', 'drawing', 'pdf', 'other'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

/** An owner can manage the team and the company's settings. Staff work the jobs. */
export const ROLES = ['owner', 'staff'] as const;
export type Role = (typeof ROLES)[number];

type JsonObject = Record<string, unknown>;

export interface DesignerRow {
  id: string;
  name: string;
  site_key: string;
  status: string;
  allowed_origins: string[];
  config: JsonObject;
  notify_emails: string[];
  created_at: string;
  updated_at: string;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  reference: string;
  customer_id: string;
  designer_id: string | null;
  stage: JobStage;
  source: JobSource;
  assigned_to: string | null;
  site_address: string | null;
  site_postcode: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignRow {
  id: string;
  job_id: string;
  label: string;
  position: number;
  current_revision: number;
  created_at: string;
  updated_at: string;
}

export interface DesignRevisionRow {
  id: string;
  design_id: string;
  number: number;
  document: DesignDocument;
  format_version: number;
  engine_version: string;
  ruleset_version: number;
  computed: ConfiguratorSpec;
  author_kind: ActorKind;
  author_id: string | null;
  reason: string | null;
  checked_by: string | null;
  checked_at: string | null;
  created_at: string;
}

export interface DraftRow {
  id: string;
  designer_id: string;
  resume_token_hash: string;
  document: unknown;
  format_version: number;
  /** Where the customer had got to: the step, the measuring card and the layout they started from. */
  progress: Record<string, unknown>;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface FileRow {
  id: string;
  job_id: string | null;
  revision_id: string | null;
  draft_id: string | null;
  kind: FileKind;
  storage_key: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface MembershipRow {
  id: string;
  user_id: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface JobEventRow {
  id: string;
  job_id: string;
  type: string;
  actor_kind: ActorKind;
  actor_id: string | null;
  data: JsonObject;
  created_at: string;
}

/** Each table's row, and the columns that must be given when one is made. */
export interface Tables {
  designers: { row: DesignerRow; required: 'name' | 'site_key' };
  customers: { row: CustomerRow; required: 'name' };
  jobs: { row: JobRow; required: 'reference' | 'customer_id' };
  designs: { row: DesignRow; required: 'job_id' };
  design_revisions: {
    row: DesignRevisionRow;
    required:
      | 'design_id'
      | 'number'
      | 'document'
      | 'format_version'
      | 'engine_version'
      | 'ruleset_version'
      | 'computed'
      | 'author_kind';
  };
  drafts: {
    row: DraftRow;
    required: 'designer_id' | 'resume_token_hash' | 'document' | 'format_version' | 'expires_at';
  };
  files: { row: FileRow; required: 'kind' | 'storage_key' | 'content_type' | 'size_bytes' };
  job_events: { row: JobEventRow; required: 'job_id' | 'type' | 'actor_kind' };
  memberships: { row: MembershipRow; required: 'user_id' | 'role' };
}

export type TableName = keyof Tables;
export type Row<T extends TableName> = Tables[T]['row'];

/** Columns the data layer sets itself. */
type Automatic = 'id' | 'created_at' | 'updated_at';

type RequiredColumn<T extends TableName> = Extract<Tables[T]['required'], keyof Row<T>>;

export type NewRow<T extends TableName> = Pick<Row<T>, RequiredColumn<T>> &
  Partial<Omit<Row<T>, RequiredColumn<T> | Automatic>>;

export type RowChanges<T extends TableName> = Partial<Omit<Row<T>, Automatic>>;

interface TableInfo {
  /** Which prefix a new row's id gets. */
  id: IdKind;
  /** Every column except company_id, in the order they are read. */
  columns: readonly string[];
  /** Columns stored as JSON text and handed back parsed. */
  json: readonly string[];
  /** Whether the table has updated_at as well as created_at. */
  tracksUpdates: boolean;
}

export const TABLES: { readonly [T in TableName]: TableInfo } = {
  designers: {
    id: 'designer',
    columns: ['id', 'name', 'site_key', 'status', 'allowed_origins', 'config', 'notify_emails', 'created_at', 'updated_at'],
    json: ['allowed_origins', 'config', 'notify_emails'],
    tracksUpdates: true,
  },
  customers: {
    id: 'customer',
    columns: ['id', 'name', 'email', 'phone', 'address', 'postcode', 'created_at', 'updated_at'],
    json: [],
    tracksUpdates: true,
  },
  jobs: {
    id: 'job',
    columns: ['id', 'reference', 'customer_id', 'designer_id', 'stage', 'source', 'assigned_to', 'site_address', 'site_postcode', 'created_at', 'updated_at'],
    json: [],
    tracksUpdates: true,
  },
  designs: {
    id: 'design',
    columns: ['id', 'job_id', 'label', 'position', 'current_revision', 'created_at', 'updated_at'],
    json: [],
    tracksUpdates: true,
  },
  design_revisions: {
    id: 'revision',
    columns: ['id', 'design_id', 'number', 'document', 'format_version', 'engine_version', 'ruleset_version', 'computed', 'author_kind', 'author_id', 'reason', 'checked_by', 'checked_at', 'created_at'],
    json: ['document', 'computed'],
    tracksUpdates: false,
  },
  drafts: {
    id: 'draft',
    columns: ['id', 'designer_id', 'resume_token_hash', 'document', 'format_version', 'progress', 'expires_at', 'created_at', 'updated_at'],
    json: ['document', 'progress'],
    tracksUpdates: true,
  },
  files: {
    id: 'file',
    columns: ['id', 'job_id', 'revision_id', 'draft_id', 'kind', 'storage_key', 'content_type', 'size_bytes', 'created_at'],
    json: [],
    tracksUpdates: false,
  },
  job_events: {
    id: 'event',
    columns: ['id', 'job_id', 'type', 'actor_kind', 'actor_id', 'data', 'created_at'],
    json: ['data'],
    tracksUpdates: false,
  },
  memberships: {
    id: 'member',
    columns: ['id', 'user_id', 'role', 'created_at', 'updated_at'],
    json: [],
    tracksUpdates: true,
  },
};

/**
 * Columns whose value must be one of a fixed list. Kept here, not as CHECK
 * constraints, so adding a stage is a code change and not a table rebuild.
 */
export const ALLOWED_VALUES: { readonly [T in TableName]?: Readonly<Record<string, readonly string[]>> } = {
  jobs: { stage: JOB_STAGES, source: JOB_SOURCES },
  design_revisions: { author_kind: ACTOR_KINDS },
  files: { kind: FILE_KINDS },
  job_events: { actor_kind: ACTOR_KINDS },
  memberships: { role: ROLES },
};
