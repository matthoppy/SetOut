/**
 * Secrets are set with `wrangler secret put`, per environment, and are never
 * in wrangler.jsonc, so `wrangler types` cannot know about them. They are
 * declared here, all optional: the code says what it does without each one.
 */
interface SetOutSecrets {
  /** Checks the bot check's token. Without it, designs and enquiries are flagged as unchecked. */
  TURNSTILE_SECRET_KEY?: string;
  /** Sends email. Without it, nothing is emailed and the job says so. */
  RESEND_API_KEY?: string;
}

interface Env extends SetOutSecrets {}

declare namespace Cloudflare {
  interface Env extends SetOutSecrets {}
}
