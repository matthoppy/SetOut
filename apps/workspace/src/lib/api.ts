/**
 * Talking to the workspace's routes.
 *
 * The session is a cookie the browser sends by itself, and no script here can
 * read it. A 401 means the person is signed out, which the app turns into the
 * sign-in page.
 */

import type {
  BellagioFit,
  ConfiguratorSpec,
  ConfiguratorState,
  GlassCoating,
  GlassType,
  HingeStyles,
  InLineHinge,
  Mounting,
  Offer,
  RulesetOverrides,
  ViennaCutout,
  WallHinge,
} from '@setout/engine';

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

async function call<T>(path: string, init: RequestInit = {}, base = '/api/workspace'): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { credentials: 'same-origin', ...init, headers });
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

/** SetOut's own staff only. To anyone else these answer "not found". */
const PLATFORM = '/api/platform';
const platformSend = <T>(method: string, path: string, body: unknown) => call<T>(path, { method, body: JSON.stringify(body) }, PLATFORM);

export const STAGES = ['new', 'reviewing', 'quoted', 'ordered', 'done', 'closed'] as const;
export type Stage = (typeof STAGES)[number];

export interface Me {
  user: { id: string; email: string; name: string | null };
  role: 'owner' | 'staff';
  company: { id: string; name: string; referencePrefix: string } | null;
  companies: { id: string; name: string; role: string }[];
  /** Where the company is with its set-up wizard. Null for one that was never sent to it. */
  setUp?: { done: boolean; step?: number } | null;
  /** Only with billing switched on. */
  billing?: Standing;
  /** One of SetOut's own staff. */
  platformAdmin?: boolean;
  signUpsOpen?: boolean;
}

/** Where a company stands with its plan. Locked: only the billing page opens. */
export interface Standing {
  state: 'free' | 'none' | 'trial' | 'active' | 'past_due' | 'trial_ended' | 'ended';
  locked: boolean;
  trialDaysLeft?: number;
}

export interface SignUpConfig {
  open: boolean;
  linkHours: number;
  /** The bot check's public key, where the check is set up. */
  turnstileSiteKey?: string;
}

export interface PlanOffer {
  id: string;
  name: string;
  monthlyPricePence: number;
  /** Designs a month. Null means no limit. */
  enquiriesPerMonth: number | null;
}

export interface Billing {
  canChange: boolean;
  standing: Standing;
  plan: PlanOffer | null;
  currency: string;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    paymentFailedAt: string | null;
    withStripe: boolean;
  } | null;
  usage: { month: string; enquiries: number; quotesSent: number };
  plans: PlanOffer[];
}

export interface PlatformPlan extends PlanOffer {
  stripePriceId: string | null;
  offered: boolean;
  position: number;
}

export interface PlatformCompany {
  id: string;
  name: string;
  referencePrefix: string;
  status: string;
  plan: string;
  createdAt: string;
  openedVia: 'sign_up' | 'setout' | 'seed';
  owners: { email: string; name: string | null; lastSignedInAt: string | null }[];
  people: number;
  designers: { id: string; name: string; siteKey: string; status: string; websites: string[] }[];
  usage: { month: string; enquiries: number; quotesSent: number }[];
  setUpDone: boolean | null;
  subscription: {
    status: string;
    planId: string | null;
    trialEndsAt: string | null;
    currentPeriodEndsAt: string | null;
    cancelAtPeriodEnd: boolean;
    paymentFailedAt: string | null;
    withStripe: boolean;
  } | null;
}

export interface Platform {
  companies: PlatformCompany[];
  plans: PlatformPlan[];
  switches: {
    environment: string;
    signUps: boolean;
    billing: boolean;
    trialDays: number;
    stripeKey: boolean;
    stripeWebhookSecret: boolean;
    botCheck: boolean;
    mail: boolean;
  };
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
  /** What the company calls its finishes and handles, and its standard hinges, for the shower's sheets. */
  labels: { finishes: OptionLabel[]; handles: OptionLabel[]; hinges: HingeStyles };
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

export interface Hinges {
  wall: { offered: WallHinge[]; standard: WallHinge };
  inLine: { offered: InLineHinge[]; standard: InLineHinge };
  viennaCutout: ViennaCutout;
  bellagioFit: BellagioFit;
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
  /** The thicknesses customers may choose, thinnest first, and the one a new design starts at. */
  glass: { offered: number[]; standard: number };
  /** The hinge styles customers may choose for a door hung from a wall and one hung in line, and the standard of each. */
  hinges: Hinges;
  /** The fixing methods customers may choose, and the one a new design starts with. */
  fixing: Offer<Mounting>;
  /** The glass types customers may choose, and the one a new design starts with. */
  glassTypes: Offer<GlassType>;
  /** The coatings customers may choose, and the one a new design starts with. */
  coatings: Offer<GlassCoating>;
  /** Whether customers are offered the sliding door layouts (CRL Serenity). Off until an owner turns it on. */
  sliding: boolean;
  notifyEmails: string[];
  /** The designer's public key, which goes in the embed code. */
  siteKey: string;
  /** The websites that may show the designer: https://www.example.co.uk. */
  websites: string[];
  /** How many showers on the company's jobs use each option, by id. */
  inUse: { finishes: Record<string, number>; handles: Record<string, number> };
  versions: {
    finishes: string;
    handles: string;
    glass: string;
    hinges: string;
    fixing: string;
    glassTypes: string;
    coatings: string;
    sliding: string;
    notifyEmails: string;
    websites: string;
  };
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
  | { field: 'glassOffered'; from: number[]; to: number[] }
  | { field: 'glassStandard'; from: number; to: number }
  | { field: 'wallHingesOffered' | 'inLineHingesOffered'; from: string[]; to: string[] }
  | { field: 'wallHingeStandard' | 'inLineHingeStandard'; from: string; to: string }
  | { field: 'viennaCutout' | 'bellagioFit'; from: string; to: string }
  | { field: 'slidingDoors'; from: boolean; to: boolean }
  | { field: 'fixingOffered' | 'glassTypesOffered' | 'coatingsOffered'; from: string[]; to: string[] }
  | { field: 'fixingStandard' | 'glassTypeStandard' | 'coatingStandard'; from: string; to: string }
  | { field: 'notifyEmails'; added: string[]; removed: string[] }
  | { field: 'websites'; added: string[]; removed: string[] }
  | { field: 'rule'; rule: string; from: number; to: number };

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
  /** The company's measurements: each rule it differs from SetOut's standard in, and which version that is. */
  rules: RulesSettings;
  limits: { options: number; label: number; description: number; notifyEmails: number; websites: number; companyName: number; logoUrl: number };
  /** Where the embed script is served from. */
  embedScript: string;
  /** Owners only. */
  changes?: SettingsChange[];
}

export interface RulesSettings {
  /** 0 until an owner first changes one. */
  version: number;
  overrides: RulesetOverrides;
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
  glass?: DesignerSettings['glass'];
  hinges?: Hinges;
  fixing?: DesignerSettings['fixing'];
  glassTypes?: DesignerSettings['glassTypes'];
  coatings?: DesignerSettings['coatings'];
  sliding?: boolean;
  notifyEmails?: string[];
  websites?: string[];
  basedOn: Partial<DesignerSettings['versions']>;
}

export const api = {
  me: () => call<Me>('/me'),
  askForLink: (email: string) => send<{ ok: true; link?: string }>('POST', '/sign-in', { email }),
  useLink: (token: string) => send<{ ok: true }>('POST', '/sign-in/verify', { token }),
  signOut: () => send<{ ok: true }>('POST', '/sign-out', {}),
  signUpConfig: (signal?: AbortSignal) => call<SignUpConfig>('/sign-up', { signal }),
  /** website: the hidden field no person fills. */
  signUp: (form: { companyName: string; name: string; email: string; turnstileToken: string | null; website: string }) =>
    send<{ ok: true; link?: string }>('POST', '/sign-up', form),
  useSignUpLink: (token: string) => send<{ ok: true; company: { id: string; name: string } }>('POST', '/sign-up/verify', { token }),
  /** Where the owner is with the set-up wizard. */
  saveSetUp: (state: { step?: number; done?: boolean }) => send<{ ok: true }>('POST', '/set-up', state),
  billing: (signal?: AbortSignal) => call<Billing>('/billing', { signal }),
  /** Answers with Stripe's page to send the browser to. */
  checkout: (planId: string) => send<{ ok: true; url: string }>('POST', '/billing/checkout', { planId }),
  billingPortal: () => send<{ ok: true; url: string }>('POST', '/billing/portal', {}),
  platform: (signal?: AbortSignal) => call<Platform>('/companies', { signal }, PLATFORM),
  addCompany: (company: { name: string; ownerEmail: string; ownerName: string; plan: string }) =>
    platformSend<{ ok: true; emailed: boolean; company: { id: string; referencePrefix: string; siteKey: string } }>('POST', '/companies', company),
  changeCompany: (id: string, changes: { status?: 'active' | 'suspended'; reason?: string; plan?: string }) =>
    platformSend<{ ok: true }>('PATCH', `/companies/${encodeURIComponent(id)}`, changes),
  startTrial: (id: string) => platformSend<{ ok: true; trialEndsAt: string }>('POST', `/companies/${encodeURIComponent(id)}/trial`, {}),
  savePlan: (plan: PlatformPlan) => platformSend<{ ok: true }>('PUT', `/plans/${encodeURIComponent(plan.id)}`, plan),
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
  /** Every measurement that differs from SetOut's standard, made from the version read. */
  saveRules: (overrides: RulesetOverrides, basedOn: number) =>
    send<{ ok: true; changed: boolean; rules: RulesSettings }>('PATCH', '/settings/rules', { overrides, basedOn: { rules: basedOn } }),
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
