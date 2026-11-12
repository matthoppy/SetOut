/**
 * Cloudflare's bot check, loaded only by the one page that needs it:
 * signing up. The workspace's other pages never load anything from outside.
 */

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface Turnstile {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      theme?: 'auto' | 'light' | 'dark';
    }
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let pending: Promise<Turnstile> | null = null;

/** The bot check, once its script has loaded. Rejects if it cannot be. */
export function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (pending) return pending;
  pending = new Promise<Turnstile>((resolve, reject) => {
    const fail = () => {
      pending = null;
      reject(new Error('The security check could not be loaded.'));
    };
    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.addEventListener('error', fail, { once: true });
      document.head.appendChild(script);
    }
    const started = Date.now();
    const poll = () => {
      if (window.turnstile) resolve(window.turnstile);
      else if (Date.now() - started > 15_000) fail();
      else setTimeout(poll, 50);
    };
    poll();
  });
  return pending;
}
