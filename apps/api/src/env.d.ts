/**
 * Secrets are set with `wrangler secret put`, per environment, and are never
 * in wrangler.jsonc, so `wrangler types` cannot know about them. They are
 * declared here, all optional: the code says what it does without each one.
 */
interface SetOutSecrets {
  /** Checks the bot check's token. Without it, enquiries are flagged as unchecked. */
  TURNSTILE_SECRET_KEY?: string;
  /** Sends email. Without it, nothing is emailed and the job says so. */
  RESEND_API_KEY?: string;
  /**
   * The bot check widget's public key. Not a secret, but set like one so it
   * is not in the repository. With it and the key above, sign-up asks for the
   * bot check, and each new company's designer is given it.
   */
  TURNSTILE_SITE_KEY?: string;
  /**
   * The email addresses of SetOut's own staff, separated by commas. They may
   * use the platform admin. Without it, nobody may.
   */
  PLATFORM_ADMINS?: string;
  /** Stripe's API key. Only used with BILLING on. */
  STRIPE_SECRET_KEY?: string;
  /** Checks that a webhook came from Stripe. Only used with BILLING on. */
  STRIPE_WEBHOOK_SECRET?: string;
}

interface Env extends SetOutSecrets {}

declare namespace Cloudflare {
  interface Env extends SetOutSecrets {}
}
