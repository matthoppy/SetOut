/**
 * The workspace's session cookie.
 *
 * Only the workspace's address is sent it, only over HTTPS, no script on the
 * page can read it, and another website cannot make the browser send it with
 * a change. It is set in two places: using a sign-in link, and using a
 * sign-up link.
 */

import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { SESSION_DAYS } from '../db/auth';

export const SESSION_COOKIE = '__Host-setout_session';

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: SESSION_DAYS * 86_400,
  });
}
