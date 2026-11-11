/**
 * Reading an enquiry from outside.
 *
 * Everything here arrives from a browser we do not control, so every field is
 * checked for shape and size before anything else looks at it. The design
 * document has its own, stricter check in the engine.
 */

export class RequestError extends Error {
  constructor(
    readonly status: 400 | 404 | 413 | 422,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

export interface EnquiryCustomer {
  name: string;
  email: string;
  phone: string;
  postcode: string;
  notes: string;
}

export interface EnquiryFile {
  kind: 'drawing' | 'photo';
  filename: string;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: Uint8Array;
  /** As it arrived, kept so an email attachment does not have to be encoded again. */
  base64: string;
}

export interface Enquiry {
  siteKey: string;
  document: unknown;
  templateId: string | null;
  customer: EnquiryCustomer;
  files: EnquiryFile[];
  turnstileToken: string | null;
  honeypot: string;
  elapsedMs: number | null;
}

/** Two drawings of the design, one of what was measured, and up to ten photos, with room to spare. */
const MAX_FILES = 16;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
/** Base64 is a third larger than what it carries, plus the rest of the request. */
export const MAX_BODY_BYTES = 45 * 1024 * 1024;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(v: unknown, field: string, max: number, required = false): string {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw new RequestError(400, 'invalid_request', `${field} must be text.`);
  const trimmed = v.trim();
  if (trimmed.length > max) {
    throw new RequestError(400, 'invalid_request', `${field} is too long. The limit is ${max} characters.`);
  }
  if (required && trimmed.length === 0) {
    throw new RequestError(400, 'invalid_request', `${field} is needed.`);
  }
  return trimmed;
}

/** What kind of image these bytes are, from the bytes themselves. */
function imageType(bytes: Uint8Array): EnquiryFile['contentType'] | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function decodeBase64(content: string, field: string): Uint8Array {
  if (content.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4) {
    throw new RequestError(413, 'file_too_large', `${field} is too large. The limit is 8MB.`);
  }
  let binary: string;
  try {
    binary = atob(content);
  } catch {
    throw new RequestError(400, 'invalid_request', `${field} is not a readable file.`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A file name with nothing in it but what a file name needs. */
function safeFilename(name: unknown, index: number, contentType: EnquiryFile['contentType']): string {
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const base =
    typeof name === 'string'
      ? name
          .replace(/\.[A-Za-z0-9]{1,5}$/, '')
          .replace(/[^A-Za-z0-9_-]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 60)
      : '';
  return `${base || `file-${index + 1}`}.${extension}`;
}

export function readEnquiry(body: unknown): Enquiry {
  if (!isObject(body)) throw new RequestError(400, 'invalid_request', 'The request must be a JSON object.');

  if (typeof body.siteKey !== 'string' || body.siteKey.length === 0 || body.siteKey.length > 80) {
    throw new RequestError(400, 'invalid_request', 'A site key is needed.');
  }

  const c = isObject(body.customer) ? body.customer : {};
  const customer: EnquiryCustomer = {
    name: text(c.name, 'Your name', 100, true),
    email: text(c.email, 'Your email', 200, true).toLowerCase(),
    phone: text(c.phone, 'Your phone number', 40),
    postcode: text(c.postcode, 'Your postcode', 12).toUpperCase(),
    notes: text(c.notes, 'Your note', 2000),
  };
  if (customer.name.length < 2) throw new RequestError(400, 'invalid_request', 'Your name is needed.');
  if (!EMAIL.test(customer.email)) {
    throw new RequestError(400, 'invalid_request', 'That email address does not look right.');
  }
  if (c.measurementsAcknowledged !== true) {
    throw new RequestError(
      400,
      'not_acknowledged',
      'Please confirm that you measured this yourself and the sizes are correct.'
    );
  }

  const attachments = body.attachments === undefined ? [] : body.attachments;
  if (!Array.isArray(attachments) || attachments.length > MAX_FILES) {
    throw new RequestError(400, 'invalid_request', `No more than ${MAX_FILES} drawings and photos can be sent.`);
  }
  let total = 0;
  const files: EnquiryFile[] = attachments.map((a, i) => {
    if (!isObject(a) || typeof a.content !== 'string') {
      throw new RequestError(400, 'invalid_request', `File ${i + 1} is not a readable file.`);
    }
    const bytes = decodeBase64(a.content, `File ${i + 1}`);
    total += bytes.length;
    if (bytes.length > MAX_FILE_BYTES) {
      throw new RequestError(413, 'file_too_large', `File ${i + 1} is too large. The limit is 8MB.`);
    }
    if (total > MAX_TOTAL_BYTES) {
      throw new RequestError(413, 'files_too_large', 'Those files are too large together. The limit is 30MB.');
    }
    const contentType = imageType(bytes);
    if (!contentType) {
      throw new RequestError(400, 'unsupported_file', `File ${i + 1} is not a JPEG, PNG or WebP picture.`);
    }
    return {
      kind: a.kind === 'drawing' ? 'drawing' : 'photo',
      filename: safeFilename(a.filename, i, contentType),
      contentType,
      bytes,
      base64: a.content,
    };
  });

  const antispam = isObject(body.antispam) ? body.antispam : {};
  return {
    siteKey: body.siteKey,
    document: body.document,
    templateId: typeof body.templateId === 'string' && body.templateId.length <= 60 ? body.templateId : null,
    customer,
    files,
    turnstileToken:
      typeof body.turnstileToken === 'string' && body.turnstileToken.length > 0 && body.turnstileToken.length < 4096
        ? body.turnstileToken
        : null,
    honeypot: typeof antispam.honeypot === 'string' ? antispam.honeypot : '',
    elapsedMs:
      typeof antispam.elapsedMs === 'number' && Number.isFinite(antispam.elapsedMs) ? antispam.elapsedMs : null,
  };
}

// ---------------------------------------------------------------------------
// The bot check
// ---------------------------------------------------------------------------

export type BotCheck = 'passed' | 'failed' | 'not_run' | 'not_configured';

/**
 * Check a Turnstile token.
 *
 * A missing token is not a refusal. The widget sometimes fails to load inside
 * a frame, and losing a real customer's ten minutes of measuring is worse than
 * letting a flagged enquiry through. A token that is present and wrong is a
 * refusal.
 */
export async function checkBot(
  secret: string | undefined,
  token: string | null,
  ip: string | null,
  send: typeof fetch = fetch
): Promise<BotCheck> {
  if (!secret) return 'not_configured';
  if (!token) return 'not_run';
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const response = await send('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true ? 'passed' : 'failed';
  } catch {
    // Cloudflare's own check being unreachable is not the customer's fault.
    return 'not_run';
  }
}
