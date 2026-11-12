/**
 * Signing up: a shower company opens its own workspace.
 *
 * Three things are asked for, and a link is emailed. Nothing is made until
 * the link is used. The link opens this page with its token, and the person
 * presses a button to use it, because mail scanners open links: if opening
 * the link were enough, a scanner would use it up first.
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, type SignUpConfig } from '../lib/api';
import { useLoad } from '../lib/load';
import { Link } from '../lib/router';
import { loadTurnstile } from '../lib/turnstile';
import { Problem } from './parts';

const FIELD = 'mt-1.5 h-12 w-full rounded-md border border-rule bg-surface px-3 text-base';
const wrong = (error: unknown) => (error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');

export function SignUp() {
  const token = new URLSearchParams(window.location.search).get('token');
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-quiet">SetOut</p>
      {token ? <UseLink token={token} /> : <Ask />}
    </main>
  );
}

function Ask() {
  const config = useLoad<SignUpConfig>('sign-up', (signal) => api.signUpConfig(signal));
  if (config.error && !config.data) return <Problem error={config.error} retry={config.reload} />;
  if (!config.data) {
    return (
      <p className="mt-6 text-quiet" role="status">
        Loading
      </p>
    );
  }
  if (!config.data.open) {
    return (
      <section>
        <h1 className="mt-2 text-2xl font-bold">New accounts are not open yet</h1>
        <p className="mt-3 text-quiet">SetOut is being set up with its first companies. If your company already has a workspace, sign in.</p>
        <Link to="/sign-in" className="mt-6 flex h-12 w-full items-center justify-center rounded-md border border-rule bg-surface font-semibold">
          Sign in
        </Link>
      </section>
    );
  }
  return <Form config={config.data} />;
}

type Asked = { state: 'idle' } | { state: 'sending' } | { state: 'sent'; email: string; link?: string } | { state: 'failed'; message: string };

function Form({ config }: { config: SignUpConfig }) {
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // A field no person sees. A script that fills in every field fills this one.
  const [website, setWebsite] = useState('');
  const [asked, setAsked] = useState<Asked>({ state: 'idle' });
  const { setBox, token: checkToken, failed: checkFailed, reset: resetCheck } = useBotCheck(config.turnstileSiteKey);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAsked({ state: 'sending' });
    try {
      const answer = await api.signUp({ companyName, name, email, turnstileToken: checkToken, website });
      setAsked({ state: 'sent', email: email.trim(), link: answer.link });
    } catch (error) {
      // A check is good for one try.
      resetCheck();
      setAsked({ state: 'failed', message: wrong(error) });
    }
  };

  if (asked.state === 'sent') {
    return (
      <section aria-live="polite">
        <h1 className="mt-2 text-2xl font-bold">Check your email</h1>
        <p className="mt-3 text-quiet">
          We have sent a link to <span className="font-medium text-ink">{asked.email}</span>. Open it to confirm the address and set up your workspace. It works once, for{' '}
          {config.linkHours} hours, on any device.
        </p>
        <p className="mt-3 text-sm text-quiet">Nothing is set up until you use the link. If it has not arrived in a few minutes, look in your junk folder.</p>
        {asked.link && (
          <p className="mt-4 rounded-md border border-dashed border-rule p-3 text-sm">
            This machine has no mail, so here is the link:{' '}
            <a className="break-all font-medium text-accent underline" href={asked.link}>
              confirm and set up
            </a>
          </p>
        )}
        <button type="button" className="mt-6 text-sm font-medium text-accent underline underline-offset-2" onClick={() => setAsked({ state: 'idle' })}>
          Use another address
        </button>
      </section>
    );
  }

  const waitingForCheck = Boolean(config.turnstileSiteKey) && !checkToken && !checkFailed;
  return (
    <form onSubmit={submit}>
      <h1 className="mt-2 text-2xl font-bold">Set up your company on SetOut</h1>
      <p className="mt-2 text-quiet">Your customers design and measure their shower on your website. You quote and make it from the same design.</p>

      <label htmlFor="company" className="mt-6 block text-sm font-medium">
        Your company’s name
      </label>
      <input id="company" required maxLength={100} autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={FIELD} />
      <p className="mt-1 text-xs text-quiet">As your customers know it. You can change it later.</p>

      <label htmlFor="name" className="mt-4 block text-sm font-medium">
        Your name
      </label>
      <input id="name" required maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />

      <label htmlFor="email" className="mt-4 block text-sm font-medium">
        Your email address
      </label>
      <input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={FIELD} />
      <p className="mt-1 text-xs text-quiet">We will email you a link to confirm it. There is no password.</p>

      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this empty
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {config.turnstileSiteKey && <div ref={setBox} className="mt-4 min-h-[65px]" />}
      {checkFailed && (
        <p role="alert" className="mt-2 text-sm text-bad">
          The security check could not be loaded. Check your connection, or turn off anything that blocks scripts on this page, and reload.
        </p>
      )}
      {asked.state === 'failed' && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {asked.message}
        </p>
      )}
      <button
        type="submit"
        disabled={asked.state === 'sending' || waitingForCheck || checkFailed}
        className="mt-4 h-12 w-full rounded-md bg-accent font-semibold text-accent-ink disabled:opacity-60"
      >
        {asked.state === 'sending' ? 'Sending' : 'Email me a link'}
      </button>
      <p className="mt-6 text-sm text-quiet">
        Already have a workspace?{' '}
        <Link to="/sign-in" className="font-medium text-accent underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}

/** The bot check's widget, where the check is set up: its box, its token once passed, and a way to ask again. */
function useBotCheck(siteKey: string | undefined) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Counting the tries: each one draws the widget afresh, for a new token.
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!siteKey || !box) return;
    let gone = false;
    let widget: string | null = null;
    loadTurnstile().then(
      (turnstile) => {
        if (gone) return;
        widget = turnstile.render(box, {
          sitekey: siteKey,
          theme: 'auto',
          callback: (passed) => setToken(passed),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
      },
      () => {
        if (!gone) setFailed(true);
      }
    );
    return () => {
      gone = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, box, tries]);

  const reset = useCallback(() => {
    setToken(null);
    setTries((n) => n + 1);
  }, []);
  return { setBox, token, failed, reset };
}

function UseLink({ token }: { token: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const use = async () => {
    setState({ busy: true, error: null });
    try {
      await api.useSignUpLink(token);
      // The token is spent: replacing the page keeps it out of the history,
      // and the workspace starts from nothing, as the new owner.
      window.location.replace('/set-up');
    } catch (error) {
      setState({ busy: false, error: wrong(error) });
    }
  };

  return (
    <section>
      <h1 className="mt-2 text-2xl font-bold">Open your workspace</h1>
      <p className="mt-2 text-quiet">This confirms your email address, opens your company’s workspace and signs this browser in for 30 days.</p>
      {state.error ? (
        <>
          <p role="alert" className="mt-6 text-bad">
            {state.error}
          </p>
          <div className="mt-4 grid gap-2">
            <Link to="/sign-in" className="flex h-12 items-center justify-center rounded-md border border-rule bg-surface font-semibold">
              Sign in
            </Link>
            <Link to="/sign-up" className="flex h-12 items-center justify-center rounded-md border border-rule bg-surface font-semibold">
              Start again
            </Link>
          </div>
        </>
      ) : (
        <button type="button" disabled={state.busy} onClick={use} className="mt-6 h-12 w-full rounded-md bg-accent font-semibold text-accent-ink disabled:opacity-60">
          {state.busy ? 'Setting up' : 'Open my workspace'}
        </button>
      )}
    </section>
  );
}
