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
  author_kind: string;
  checked_by: string | null;
  checked_at: string | null;
  /** Who checked it, if they are still on the team. */
  checkedBy: { name: string | null; email: string } | null;
  created_at: string;
}

export interface JobDetail {
  job: { id: string; reference: string; stage: Stage; created_at: string; updated_at: string; site_postcode: string | null };
  customer: { name: string; email: string | null; phone: string | null; postcode: string | null; address: string | null } | null;
  designs: { id: string; label: string; position: number; current_revision: number; revision: Revision | null }[];
  files: JobFile[];
  events: JobEvent[];
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
  /** revision: the number of the revision the person looked over. */
  check: (jobId: string, designId: string, revision: number) =>
    send<{ ok: true }>('POST', `/jobs/${encodeURIComponent(jobId)}/designs/${encodeURIComponent(designId)}/check`, { revision }),
  uncheck: (jobId: string, designId: string) =>
    call<{ ok: true }>(`/jobs/${encodeURIComponent(jobId)}/designs/${encodeURIComponent(designId)}/check`, { method: 'DELETE' }),
  team: (signal?: AbortSignal) => call<Team>('/team', { signal }),
  addToTeam: (person: { email: string; name: string; role: Role }) =>
    send<{ ok: true; member: TeamMember; emailed: boolean }>('POST', '/team', person),
  setRole: (id: string, role: Role) => send<{ ok: true }>('PATCH', `/team/${encodeURIComponent(id)}`, { role }),
  removeFromTeam: (id: string) => call<{ ok: true }>(`/team/${encodeURIComponent(id)}`, { method: 'DELETE' }),
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
