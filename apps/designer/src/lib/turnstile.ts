/**
 * Loads Cloudflare Turnstile when a form needs it, rather than with every
 * page. The script tag matches the one @marsidev/react-turnstile makes (same
 * id, same address), so whichever of the two asks first wins and the other
 * finds it already there.
 */

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit';

declare global {
  interface Window {
    onloadTurnstileCallback?: () => void;
  }
}

let pending: Promise<void> | null = null;

/** Resolves once window.turnstile exists; rejects if the script cannot load. */
export function ensureTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (pending) return pending;
  pending = new Promise<void>((resolve, reject) => {
    if (typeof window.onloadTurnstileCallback !== 'function') window.onloadTurnstileCallback = () => undefined;
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener(
        'error',
        () => {
          pending = null;
          reject(new Error('The security check could not be loaded.'));
        },
        { once: true }
      );
      document.head.appendChild(script);
    }
    const started = Date.now();
    const poll = () => {
      if (window.turnstile) resolve();
      else if (Date.now() - started > 15000) {
        pending = null;
        reject(new Error('The security check took too long to load.'));
      } else setTimeout(poll, 50);
    };
    poll();
  });
  return pending;
}
