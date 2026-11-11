/**
 * The workspace's own few addresses, without a router library: the path is
 * read from the browser and changed with the history API, so the back button
 * and a reload both do what they should.
 */

import { createElement, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const EVENT = 'setout:navigate';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** The current path and query, such as /jobs?stage=new. */
export function useLocation(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
}

export function go(to: string, options: { replace?: boolean } = {}) {
  if (to === window.location.pathname + window.location.search) return;
  window.history[options.replace ? 'replaceState' : 'pushState'](null, '', to);
  window.dispatchEvent(new Event(EVENT));
  if (!options.replace) window.scrollTo(0, 0);
}

/** A link that stays in the app, and still opens in a new tab when asked to. */
export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return createElement('a', {
    ...rest,
    href: to,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      go(to);
    },
  });
}
