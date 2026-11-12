/**
 * Talking to the workspace's routes.
 *
 * The session is a cookie the browser sends by itself, and no script here can
 * read it. A 401 means the person is signed out, which the app turns into the
 * sign-in page.
 */

import type { ConfiguratorSpec, ConfiguratorState } from '@setout/engine';

export class SignedOut extends Error {
  constructor() {
    super('Please sign in.');
    this.name = 'SignedOut';
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`/api/workspace${path}`, { credentials: 'same-origin', ...init, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('The workspace could not be reached. Check your connection.', 0, 'offline');
  }
  if (response.status === 401) throw new SignedOut();
  const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!response.ok) throw new ApiError(body.message ?? 'Something went wrong. Please try again.', response.status, body.error);
  return body as T;
}

const send = <T>(method: string, path: string, body: unknown) => call<T>(path, { method, body: JSON.stringify(body) });

export const STAGES = ['new', 'reviewing', 'quoted', 'ordered', 'done', 'closed'] as const;
export type Stage = (typeof STAGES)[number];

export interface Me {
  user: { id: string; email: string; name: string | null };
  role: 'owner' | 'staff';
  company: { id: string; name: string; referencePrefix: string } | null;
  companies: { id: string; name: string; role: string }[];
}

export interface InboxJob {
  id: string;
  reference: string;
  stage: Stage;
  createdAt: string;
  updatedAt: string;
  customer: { name: string; email: string | null; phone: string | null; postcode: string | null };
  designs: number;
  layout: string | null;
  widthMm: number | null;
  heightMm: number | null;
  panels: number | null;
  warnings: number;
  blockingIssues: number;
  photos: number;
  sentQuickly: boolean;
  botCheck: string | null;
}

export interface Inbox {
  jobs: InboxJob[];
  counts: Record<Stage, number>;
  next: string | null;
}

export interface JobFile {
  id: string;
  kind: 'drawing' | 'measuring_photo' | 'photo' | 'pdf' | 'other';
  name: string;
  /** The revision a drawing was drawn for. */
  revisionId: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface JobEvent {
  id: string;
  type: string;
  actorKind: 'customer' | 'staff' | 'system';
  actor: { name: string | null; email: string } | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface Revision {
  id: string;
  number: number;
  document: { format: number; design: ConfiguratorState };
  computed: ConfiguratorSpec;
  engine_version: string;
  checked_by: string | null;
  checked_at: string | null;
  /** Who checked it, if they are still on the team. */
  checkedBy: { name: string | null; email: string } | null;
  author_kind: 'customer' | 'staff' | 'system';
  /** Why staff changed it, for a revision they saved. */
  reason: string | null;
  /** Who saved it, for a revision staff saved, if they are still on the team. */
  changedBy: { name: string | null; email: string } | null;
  created_at: string;
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'withdrawn';
export type QuoteUnit = 'each' | 'm2' | 'm' | 'set' | 'job';

export interface QuoteSummary {
  id: string;
  number: number;
  status: QuoteStatus;
  totalPence: number;
  currency: string;
  createdAt: string;
  sentAt: string | null;
  validUntil: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
}

export interface QuoteLine {
  key: string | null;
  description: string;
  quantity: number;
  unit: QuoteUnit;
  unitPricePence: number;
  totalPence?: number;
}

export interface Quote {
  id: string;
  job_id: string;
  number: number;
  status: QuoteStatus;
  lines: QuoteLine[];
  note: string | null;
  currency: string;
  vat_rate_bp: number;
  subtotal_pence: number;
  vat_pence: number;
  total_pence: number;
  valid_days: number;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  created_at: string;
}

export interface QuoteDetail {
  quote: Quote;
  job: { id: string; reference: string; stage: Stage } | null;
  customer: { name: string; email: string | null } | null;
  /** What stands in the way of sending a draft, if anything. */
  blocker: { error: string; message: string } | null;
}

export interface OptionLabel {
  id: string;
  label: string;
  /** CRL's code for it, where the company has set one: a finish's, such as MBL, or a handle's number before its finish. */
  code?: string;
}

export interface JobDetail {
  job: {
    id: string;
    reference: string;
    stage: Stage;
    created_at: string;
    updated_at: string;
    site_address: string | null;
    site_postcode: string | null;
    /** What the fitters are told, on the installation sheets. */
    install_notes: string | null;
  };
  customer: { name: string; email: string | null; phone: string | null; postcode: string | null; address: string | null } | null;
  /** What the company calls its finishes and handles. */
  labels: { finishes: OptionLabel[]; handles: OptionLabel[] };
  designs: { id: string; label: string; position: number; current_revision: number; revision: Revision | null }[];
  files: JobFile[];
  events: JobEvent[];
  quotes: QuoteSummary[];
}

export type Role = 'owner' | 'staff';

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  joinedAt: string;
  lastSignedInAt: string | null;
}

export interface TeamChange {
  id: string;
  action: 'member_added' | 'member_removed' | 'role_changed';
  by: { email: string; name: string | null } | null;
  data: { email?: string; role?: Role; from?: Role; to?: Role };
  at: string;
}

export interface Team {
  members: TeamMember[];
  /** Owners only. */
  changes?: TeamChange[];
}

export interface Finish {
  id: string;
  label: string;
  /** The colour shown beside it in the designer, as #rrggbb. */
  swatch: string;
  /** CRL's code for the finish, such as MBL, where the company has set one. */
  code?: string;
}

export interface Handle {
  id: string;
  label: string;
  description: string;
  /** CRL's number for the handle without its finish, such as BM8X8, where the company has set one. */
  code?: string;
}

/** A finish or handle as it is sent to be saved: one without an id is new. */
export type NewOption<T extends { id: string }> = Omit<T, 'id'> & { id?: string };

export interface Branding {
  primary: string;
  primaryForeground: string;
  logoUrl: string | null;
}

export interface QuoteSettings {
  /** Hundredths of a percent: 2000 is 20%. */
  vatRateBp: number;
  validDays: number;
}

export interface CompanySettings {
  name: string;
  branding: Branding;
  quotes: QuoteSettings;
  /** Which version of each part a change is made from. */
  versions: { name: string; branding: string; quotes: string };
}

export interface DesignerSettings {
  id: string;
  name: string;
  active: boolean;
  finishes: Finish[];
  handles: Handle[];
  notifyEmails: string[];
  /** How many showers on the company's jobs use each option, by id. */
  inUse: { finishes: Record<string, number>; handles: Record<string, number> };
  versions: { finishes: string; handles: string; notifyEmails: string };
}

export type SettingsChangeItem =
  | { field: 'name'; from: string; to: string }
  | { field: 'primary' | 'primaryForeground'; from: string; to: string }
  | { field: 'logoUrl'; from: string | null; to: string | null }
  | { field: 'vatRateBp' | 'quoteValidDays'; from: number; to: number }
  | {
      field: 'finish' | 'handle';
      change: 'added' | 'removed' | 'renamed' | 'recoloured' | 'described' | 'coded' | 'reordered';
      id?: string;
      label?: string;
      from?: string;
      to?: string;
    }
  | { field: 'notifyEmails'; added: string[]; removed: string[] };

export interface SettingsChange {
  id: string;
  by: { email: string; name: string | null } | null;
  data: { designer?: { id: string; name: string }; changes?: SettingsChangeItem[] };
  at: string;
}

export interface Settings {
  /** Only owners can change anything. */
  canChange: boolean;
  company: CompanySettings;
  designers: DesignerSettings[];
  limits: { options: number; label: number; description: number; notifyEmails: number; companyName: number; logoUrl: number };
  /** Owners only. */
  changes?: SettingsChange[];
}

export interface CompanyChanges {
  name?: string;
  branding?: Partial<Branding>;
  quotes?: Partial<QuoteSettings>;
  basedOn: Partial<CompanySettings['versions']>;
}

export interface DesignerChanges {
  finishes?: NewOption<Finish>[];
  handles?: NewOption<Handle>[];
  notifyEmails?: string[];
  basedOn: Partial<DesignerSettings['versions']>;
}

export const api = {
  me: () => call<Me>('/me'),
  askForLink: (email: string) => send<{ ok: true; link?: string }>('POST', '/sign-in', { email }),
  useLink: (token: string) => send<{ ok: true }>('POST', '/sign-in/verify', { token }),
  signOut: () => send<{ ok: true }>('POST', '/sign-out', {}),
  switchCompany: (companyId: string) => send<{ ok: true }>('POST', '/company', { companyId }),
  /** after: the next page's mark, from the page before it. */
  inbox: (params: { stage?: Stage | ''; q?: string; after?: string }, signal?: AbortSignal) => {
    const search = new URLSearchParams();
    if (params.stage) search.set('stage', params.stage);
    if (params.q) search.set('q', params.q);
    if (params.after) search.set('after', params.after);
    const query = search.toString();
    return call<Inbox>(`/jobs${query ? `?${query}` : ''}`, { signal });
  },
  job: (id: string, signal?: AbortSignal) => call<JobDetail>(`/jobs/${encodeURIComponent(id)}`, { signal }),
  moveJob: (id: string, stage: Stage) => send<{ ok: true }>('PATCH', `/jobs/${encodeURIComponent(id)}`, { stage }),
  addNote: (id: string, text: string) => send<{ ok: true }>('POST', `/jobs/${encodeURIComponent(id)}/notes`, { text }),
  /** A field left out stays as it is. */
  saveInstallation: (id: string, changes: { address?: string | null; postcode?: string | null; notes?: string | null }) =>
    send<{ ok: true; installation: { address: string | null; postcode: string | null; notes: string | null } }>(
      'PATCH',
      `/jobs/${encodeURIComponent(id)}/installation`,
      changes
    ),
  /** revision: the number of the revision the person looked over. */
  check: (jobId: string, designId: string, revision: number) =>
    send<{ ok: true }>('POST', `/jobs/${encodeURIComponent(jobId)}/designs/${encodeURIComponent(designId)}/check`, { revision }),
  uncheck: (jobId: string, designId: string) =>
    call<{ ok: true }>(`/jobs/${encodeURIComponent(jobId)}/designs/${encodeURIComponent(designId)}/check`, { method: 'DELETE' }),
  writeQuote: (jobId: string) => send<{ ok: true; id: string; number: number }>('POST', `/jobs/${encodeURIComponent(jobId)}/quotes`, {}),
  quote: (jobId: string, quoteId: string, signal?: AbortSignal) =>
    call<QuoteDetail>(`/jobs/${encodeURIComponent(jobId)}/quotes/${encodeURIComponent(quoteId)}`, { signal }),
  saveQuote: (jobId: string, quoteId: string, changes: { lines?: QuoteLine[]; note?: string | null; vatRateBp?: number; validDays?: number }) =>
    send<{ ok: true; quote: Quote }>('PATCH', `/jobs/${encodeURIComponent(jobId)}/quotes/${encodeURIComponent(quoteId)}`, changes),
  deleteQuote: (jobId: string, quoteId: string) =>
    call<{ ok: true }>(`/jobs/${encodeURIComponent(jobId)}/quotes/${encodeURIComponent(quoteId)}`, { method: 'DELETE' }),
  sendQuote: (jobId: string, quoteId: string) =>
    send<{ ok: true; quote: Quote; link: string; emailed: boolean }>('POST', `/jobs/${encodeURIComponent(jobId)}/quotes/${encodeURIComponent(quoteId)}/send`, {}),
  withdrawQuote: (jobId: string, quoteId: string) =>
    send<{ ok: true; quote: Quote }>('POST', `/jobs/${encodeURIComponent(jobId)}/quotes/${encodeURIComponent(quoteId)}/withdraw`, {}),
  team: (signal?: AbortSignal) => call<Team>('/team', { signal }),
  addToTeam: (person: { email: string; name: string; role: Role }) =>
    send<{ ok: true; member: TeamMember; emailed: boolean }>('POST', '/team', person),
  setRole: (id: string, role: Role) => send<{ ok: true }>('PATCH', `/team/${encodeURIComponent(id)}`, { role }),
  removeFromTeam: (id: string) => call<{ ok: true }>(`/team/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  settings: (signal?: AbortSignal) => call<Settings>('/settings', { signal }),
  /** A part left out stays as it is. */
  saveCompanySettings: (changes: CompanyChanges) => send<{ ok: true; changed: boolean }>('PATCH', '/settings/company', changes),
  /** A list is sent whole, in order. A part left out stays as it is. */
  saveDesignerSettings: (id: string, changes: DesignerChanges) =>
    send<{ ok: true; changed: boolean; designer: DesignerSettings }>('PATCH', `/settings/designers/${encodeURIComponent(id)}`, changes),
};

/**
 * Go to the sign-in page by loading it afresh, so nothing the last person
 * could see stays in the page's memory.
 */
export function signInAgain() {
  window.location.replace('/sign-in');
}

/** Where a job's file is served from. The browser sends the session with it. */
export const fileUrl = (id: string) => `/api/workspace/files/${encodeURIComponent(id)}`;
