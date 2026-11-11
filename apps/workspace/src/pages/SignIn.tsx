/**
 * Signing in: ask for a link, then use it.
 *
 * The link opens this page with its token, and the person presses a button
 * to use it. Mail scanners open links to check them; if opening the link were
 * enough, a scanner would use it up before the person ever saw it.
 */

import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import { go } from '../lib/router';

type Asked = { state: 'idle' } | { state: 'sending' } | { state: 'sent'; email: string; link?: string } | { state: 'failed'; message: string };

export function SignIn() {
  const token = new URLSearchParams(window.location.search).get('token');
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-quiet">SetOut</p>
      {token ? <UseLink token={token} /> : <AskForLink />}
    </main>
  );
}

function AskForLink() {
  const [email, setEmail] = useState('');
  const [asked, setAsked] = useState<Asked>({ state: 'idle' });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAsked({ state: 'sending' });
    try {
      const answer = await api.askForLink(email);
      setAsked({ state: 'sent', email: email.trim(), link: answer.link });
    } catch (error) {
      setAsked({ state: 'failed', message: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.' });
    }
  };

  if (asked.state === 'sent') {
    return (
      <section aria-live="polite">
        <h1 className="mt-2 text-2xl font-bold">Check your email</h1>
        <p className="mt-3 text-quiet">
          If <span className="font-medium text-ink">{asked.email}</span> is on a team, a link to sign in is on its way. It works once, for 15 minutes, on any device.
        </p>
        {asked.link && (
          <p className="mt-4 rounded-md border border-dashed border-rule p-3 text-sm">
            This machine has no mail, so here is the link:{' '}
            <a className="break-all font-medium text-accent underline" href={asked.link}>
              sign in
            </a>
          </p>
        )}
        <button type="button" className="mt-6 text-sm font-medium text-accent underline underline-offset-2" onClick={() => setAsked({ state: 'idle' })}>
          Use another address
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit}>
      <h1 className="mt-2 text-2xl font-bold">Sign in to your workspace</h1>
      <p className="mt-2 text-quiet">We will email you a link. There is no password.</p>
      <label htmlFor="email" className="mt-6 block text-sm font-medium">
        Your email address
      </label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1.5 h-12 w-full rounded-md border border-rule bg-surface px-3 text-base"
      />
      {asked.state === 'failed' && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {asked.message}
        </p>
      )}
      <button
        type="submit"
        disabled={asked.state === 'sending'}
        className="mt-4 h-12 w-full rounded-md bg-accent font-semibold text-accent-ink disabled:opacity-60"
      >
        {asked.state === 'sending' ? 'Sending' : 'Email me a link'}
      </button>
    </form>
  );
}

function UseLink({ token }: { token: string }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const use = async () => {
    setState({ busy: true, error: null });
    try {
      await api.useLink(token);
      // The token is spent: replacing the page keeps it out of the history,
      // and the inbox starts from nothing, as the person now signed in.
      window.location.replace('/jobs');
    } catch (error) {
      setState({ busy: false, error: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.' });
    }
  };

  return (
    <section>
      <h1 className="mt-2 text-2xl font-bold">Sign in to SetOut</h1>
      <p className="mt-2 text-quiet">This browser stays signed in for 30 days.</p>
      {state.error ? (
        <>
          <p role="alert" className="mt-6 text-bad">
            {state.error}
          </p>
          <button type="button" className="mt-4 h-12 w-full rounded-md border border-rule bg-surface font-semibold" onClick={() => go('/sign-in', { replace: true })}>
            Ask for a new link
          </button>
        </>
      ) : (
        <button type="button" disabled={state.busy} onClick={use} className="mt-6 h-12 w-full rounded-md bg-accent font-semibold text-accent-ink disabled:opacity-60">
          {state.busy ? 'Signing in' : 'Sign in'}
        </button>
      )}
    </section>
  );
}
