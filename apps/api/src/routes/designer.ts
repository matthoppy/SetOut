/**
 * The designer's routes.
 *
 * These are called by the embedded designer, from a frame SetOut serves. They
 * are public: anyone can call them. So a request is tied to a company by the
 * designer's site key and by nothing else it says, and whatever a browser
 * worked out is thrown away and worked out again here.
 */

import {
  buildSpec,
  DOCUMENT_FORMAT,
  DocumentError,
  ENGINE_VERSION,
  upgradeDocument,
} from '@setout/engine';
import { Hono } from 'hono';
import { companyDb } from '../db/company-db';
import { resolveDesigner, type DesignerSettings } from '../db/platform';
import { DEFAULT_SETTINGS, designerConfig, slidingOf } from '../lib/designer-config';
import { checkBot, MAX_BODY_BYTES, readEnquiry, RequestError, type BotCheck } from '../lib/enquiry';
import { mailIsSetUp, notifyEnquiry, type MailSettings } from '../lib/notify';
import { drafts } from './drafts';

export const designer = new Hono<{ Bindings: Env }>();

designer.route('/drafts', drafts);

/** Sent faster than this, an enquiry is flagged: a person cannot measure a shower in ten seconds. */
const SUSPICIOUS_ELAPSED_MS = 10_000;

/**
 * What a designer needs to know about its company. Everything in it is
 * public. Where enquiries are emailed, and anything about staff or prices,
 * stays on the server.
 */
designer.get('/config', async (c) => {
  const found = await resolveDesigner(c.env, c.req.query('key'));
  const config = found && (await designerConfig(c.env, found.companyId, found.designerId));
  if (!config) return c.json({ error: 'unknown_designer', message: 'This designer is not set up.' }, 404);
  return c.json(config, 200, { 'Cache-Control': 'private, max-age=60' });
});

/**
 * A customer sends their design.
 *
 * The order matters. The design is checked and worked out, then the customer,
 * the job, the design and its first revision are saved together. Only then
 * are the drawings and photos stored. A failure to store a photo must never
 * lose the measurements someone spent ten minutes taking.
 */
designer.post('/enquiries', async (c) => {
  const length = Number(c.req.header('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) {
    return c.json({ error: 'too_large', message: 'That is too much to send at once. Try fewer photos.' }, 413);
  }

  let enquiry;
  try {
    enquiry = readEnquiry(await c.req.json().catch(() => null));
  } catch (error) {
    if (error instanceof RequestError) return c.json({ error: error.code, message: error.message }, error.status);
    throw error;
  }

  // The site key decides the company. Nothing else in the request can.
  const found = await resolveDesigner(c.env, enquiry.siteKey);
  if (!found) return c.json({ error: 'unknown_designer', message: 'This designer is not set up.' }, 404);
  const db = companyDb(c.env, found.companyId);

  // A hidden field no person can see or fill. Answer as if it worked, so a
  // script learns nothing, and keep none of it.
  if (enquiry.honeypot.length > 0) {
    console.warn(JSON.stringify({ message: 'enquiry dropped', reason: 'honeypot', company: found.companyId }));
    return c.json({ ok: true, reference: null }, 201);
  }

  const botCheck: BotCheck = await checkBot(
    c.env.TURNSTILE_SECRET_KEY,
    enquiry.turnstileToken,
    c.req.header('cf-connecting-ip') ?? null
  );
  if (botCheck === 'failed') {
    return c.json(
      { error: 'bot_check_failed', message: 'The security check did not pass. Please reload the page and try again.' },
      403
    );
  }

  // The design, checked field by field, then worked out here with this
  // company's rules. Anything the browser calculated was never sent.
  let document;
  try {
    document = upgradeDocument(enquiry.document);
  } catch (error) {
    if (error instanceof DocumentError) {
      return c.json({ error: 'invalid_design', message: `We could not read that design: ${error.message}` }, 422);
    }
    throw error;
  }
  // Sliding doors are offered only where the company has turned them on: their
  // sizes are not confirmed yet, so a design with one is not taken otherwise.
  if (document.design.sliding) {
    const designer = await db.get('designers', found.designerId);
    if (!slidingOf((designer?.config ?? {}) as DesignerSettings)) {
      return c.json({ error: 'sliding_not_offered', message: 'This designer does not offer sliding doors. Choose another layout.' }, 422);
    }
  }
  const { context, rulesetVersion } = await db.engineContext();
  const computed = buildSpec(document.design, context);

  const { customer } = enquiry;
  const sentQuickly = enquiry.elapsedMs !== null && enquiry.elapsedMs < SUSPICIOUS_ELAPSED_MS;
  const mail: MailSettings = { apiKey: c.env.RESEND_API_KEY, from: c.env.EMAIL_FROM };
  const [existing] = await db.find('customers', { where: { email: customer.email }, limit: 1 });
  const reference = await db.allocateJobReference();

  let jobId = '';
  let revisionId = '';
  await db.batch((batch) => {
    const customerId =
      existing?.id ??
      batch.insert('customers', {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || null,
        postcode: customer.postcode || null,
      });
    jobId = batch.insert('jobs', {
      reference,
      customer_id: customerId,
      designer_id: found.designerId,
      source: 'designer',
      site_postcode: customer.postcode || null,
    });
    const designId = batch.insert('designs', { job_id: jobId, current_revision: 1 });
    revisionId = batch.insert('design_revisions', {
      design_id: designId,
      number: 1,
      document,
      format_version: DOCUMENT_FORMAT,
      engine_version: ENGINE_VERSION,
      ruleset_version: rulesetVersion,
      computed,
      author_kind: 'customer',
    });
    batch.insert('job_events', {
      job_id: jobId,
      type: 'received',
      actor_kind: 'customer',
      data: {
        template: enquiry.templateId,
        notes: customer.notes,
        name: customer.name,
        phone: customer.phone,
        botCheck,
        sentQuickly,
        // Whether anyone will be emailed. What happened to each email is
        // added to the timeline as it is sent.
        email: mailIsSetUp(mail) ? 'sending' : 'not_set_up',
        warnings: computed.warnings.length,
        blockingIssues: computed.blockingIssues.length,
        files: enquiry.files.length,
      },
    });
  });
  await db.usage.add('enquiries');

  // The measurements are safe. Now the drawings and photos.
  const stored: { key: string; file: (typeof enquiry.files)[number] }[] = [];
  let failed = 0;
  for (const file of enquiry.files) {
    const key = `${found.companyId}/jobs/${jobId}/${crypto.randomUUID()}-${file.filename}`;
    try {
      await c.env.FILES.put(key, file.bytes, { httpMetadata: { contentType: file.contentType } });
      stored.push({ key, file });
    } catch (error) {
      failed++;
      console.error(
        JSON.stringify({
          message: 'file not stored',
          job: jobId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }
  if (stored.length > 0 || failed > 0) {
    await db.batch((batch) => {
      for (const { key, file } of stored) {
        batch.insert('files', {
          job_id: jobId,
          revision_id: file.kind === 'drawing' ? revisionId : null,
          kind: file.kind,
          storage_key: key,
          content_type: file.contentType,
          size_bytes: file.bytes.length,
        });
      }
      if (failed > 0) {
        batch.insert('job_events', {
          job_id: jobId,
          type: 'files_not_stored',
          actor_kind: 'system',
          data: { count: failed },
        });
      }
    });
  }

  // The customer has their answer now. The emails follow, and whatever
  // happens to them is written on the job's timeline.
  const emails = notifyEnquiry({
    db,
    mail,
    designerId: found.designerId,
    jobId,
    companyName: context.companyName,
    reference,
    customer,
    design: document.design,
    spec: computed,
    files: stored.map((s) => s.file),
    botCheck,
    sentQuicklyMs: sentQuickly ? enquiry.elapsedMs : null,
    defaultDisclaimer: DEFAULT_SETTINGS.measurementDisclaimer,
  }).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        message: 'notification failed',
        job: jobId,
        error: error instanceof Error ? error.message : String(error),
      })
    );
  });
  try {
    c.executionCtx.waitUntil(emails);
  } catch {
    // No way to carry on after the response here, so finish before it.
    await emails;
  }

  console.log(
    JSON.stringify({
      message: 'enquiry received',
      company: found.companyId,
      job: jobId,
      reference,
      botCheck,
      files: stored.length,
      filesFailed: failed,
    })
  );
  return c.json({ ok: true, reference }, 201);
});
