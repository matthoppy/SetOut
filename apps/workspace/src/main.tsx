/**
 * The workspace: where a company's staff work the designs their customers
 * send.
 *
 * It asks the server who is signed in. Signed out, it shows the sign-in page,
 * or the page a new company signs up on; signed in, the inbox and each job. /status still shows whether the engine
 * here and the engine on the server agree.
 *
 * Signing in, signing out and moving to another company each load the page
 * afresh, so nothing one person or company could see is left in memory for
 * the next.
 */

import '@setout/ui/styles.css';
import './index.css';
import { SystemStatus } from '@setout/ui';
import { Component, StrictMode, useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { api, ApiError, signInAgain, SignedOut, type Me } from './lib/api';
import { Billing, standingWords } from './pages/Billing';
import { Platform } from './pages/Platform';
import { SetUp } from './pages/SetUp';
import { SignUp } from './pages/SignUp';
import { useLoad } from './lib/load';
import { go, Link, useLocation } from './lib/router';
import { Inbox } from './pages/Inbox';
import { Job } from './pages/Job';
import { SignIn } from './pages/SignIn';
import { GlassOrder } from './pages/GlassOrder';
import { InstallationSheet } from './pages/InstallationSheet';
import { MakingSheet } from './pages/MakingSheet';
import { QuotePage } from './pages/QuotePage';
import { Settings } from './pages/Settings';
import { Team } from './pages/Team';
import { Problem } from './pages/parts';

function App() {
  const location = useLocation();
  const [path, search = ''] = location.split('?');
  const query = new URLSearchParams(search);
  const me = useLoad<Me>('me', () => api.me());
  const signedOut = me.error instanceof SignedOut;
  const signingIn = path === '/sign-in';
  const signingUp = path === '/sign-up';
  const hasToken = query.has('token');
  // An owner who has not been through setting up is taken to it when they
  // arrive, once. After that the inbox offers it and never insists.
  const toSetUp = me.data?.role === 'owner' && me.data.setUp?.done === false && !me.data.billing?.locked;
  const locked = me.data?.billing?.locked === true;

  useEffect(() => {
    // Signed out: the sign-in page, or signing up. Signed in: never the bare
    // address, and the sign-in page only to use a new link.
    if (signedOut && !signingIn && !signingUp) go('/sign-in', { replace: true });
    if (me.data && (path === '/' || (signingIn && !hasToken))) go(toSetUp ? '/set-up' : '/jobs', { replace: true });
    // A locked company's staff can reach billing and nothing else.
    if (locked && path !== '/billing' && path !== '/platform' && !signingUp && !signingIn) go('/billing', { replace: true });
  }, [signedOut, signingIn, signingUp, hasToken, me.data, path, toSetUp, locked]);

  if (path === '/status') {
    return (
      <SystemStatus app="workspace">
        The trade workspace. This page shows that the engine in your browser and the engine on the server give the same answer.
      </SystemStatus>
    );
  }
  if (signingIn && (signedOut || hasToken)) return <SignIn />;
  // Someone already signed in can still open another company, with a link.
  if (signingUp && (signedOut || hasToken || me.data)) return <SignUp />;
  if (me.error && !signedOut) {
    return (
      <div className="mx-auto max-w-md px-5 pt-16">
        <Problem error={me.error} retry={me.reload} />
      </div>
    );
  }
  if (!me.data) {
    return (
      <p className="px-5 pt-16 text-center text-quiet" role="status">
        Loading your workspace
      </p>
    );
  }

  const jobMatch = /^\/jobs\/([A-Za-z0-9_]+)$/.exec(path);
  const quoteMatch = /^\/jobs\/([A-Za-z0-9_]+)\/quotes\/([A-Za-z0-9_]+)$/.exec(path);
  const makingMatch = /^\/jobs\/([A-Za-z0-9_]+)\/making$/.exec(path);
  const installMatch = /^\/jobs\/([A-Za-z0-9_]+)\/installation$/.exec(path);
  const page =
    path === '/team' ? (
      <Team me={me.data} />
    ) : path === '/set-up' ? (
      <SetUp me={me.data} onChanged={me.reload} />
    ) : path === '/billing' ? (
      <Billing me={me.data} />
    ) : path === '/platform' ? (
      <Platform />
    ) : path === '/settings' ? (
      <Settings me={me.data} onRenamed={me.reload} />
    ) : path === '/glass' ? (
      <GlassOrder query={query} companyName={me.data.company?.name ?? ''} />
    ) : makingMatch ? (
      <MakingSheet id={makingMatch[1]} />
    ) : installMatch ? (
      <InstallationSheet id={installMatch[1]} companyName={me.data.company?.name ?? ''} />
    ) : quoteMatch ? (
      <QuotePage jobId={quoteMatch[1]} quoteId={quoteMatch[2]} />
    ) : jobMatch ? (
      <Job id={jobMatch[1]} />
    ) : (
      <Inbox query={query} />
    );
  return (
    <Shell me={me.data}>
      <Notices me={me.data} path={path} />
      <Boundary key={path}>{page}</Boundary>
    </Shell>
  );
}

/**
 * One line under the header when there is something the company should know:
 * its trial is running out, a payment failed, or setting up is not finished.
 * Billing's line shows only where billing is switched on.
 */
function Notices({ me, path }: { me: Me; path: string }) {
  const billing = me.billing;
  const showBilling = billing && path !== '/billing' && (billing.locked || billing.state === 'past_due' || (billing.state === 'trial' && (billing.trialDaysLeft ?? 0) <= 7));
  const showSetUp = me.role === 'owner' && me.setUp?.done === false && path === '/jobs';
  if (!showBilling && !showSetUp) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-2 px-4 pt-3 sm:px-6 print:hidden">
      {showBilling && billing && (
        <p className={`rounded-lg border p-3 text-sm ${billing.state === 'trial' ? 'border-rule bg-surface' : 'border-warn/50 bg-warn/10'}`}>
          {standingWords(billing)}{' '}
          <Link to="/billing" className="font-semibold underline underline-offset-2">
            {billing.state === 'past_due' ? 'Update the card' : 'Choose a plan'}
          </Link>
        </p>
      )}
      {showSetUp && (
        <p className="rounded-lg border border-rule bg-surface p-3 text-sm">
          Your designer is not on your website yet.{' '}
          <Link to="/set-up" className="font-semibold underline underline-offset-2">
            Carry on setting up
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * A screen that finds the session has ended goes back to sign in. One that
 * breaks says so, and the rest of the workspace keeps working.
 */
class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  override state: { error: unknown } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  override componentDidCatch(error: unknown) {
    if (error instanceof SignedOut) signInAgain();
  }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (error instanceof SignedOut) return null;
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Problem error={new ApiError('This screen could not be shown. Reloading the page may help.', 0, 'render')} retry={() => window.location.reload()} />
      </div>
    );
  }
}

function Shell({ me, children }: { me: Me; children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // The menu closes on a tap outside it, or Escape.
  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setMenu(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);

  const signOut = async () => {
    await api.signOut().catch(() => undefined);
    signInAgain();
  };
  const switchTo = async (companyId: string) => {
    setProblem(null);
    try {
      await api.switchCompany(companyId);
      window.location.replace('/jobs');
    } catch (error) {
      if (error instanceof SignedOut) return signInAgain();
      setProblem(error instanceof ApiError ? error.message : 'That company could not be opened.');
    }
  };

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-10 border-b border-rule bg-surface/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/jobs" className="min-w-0 truncate font-bold">
            {me.company?.name ?? 'SetOut'}
          </Link>
          <div className="relative" ref={box}>
            <button
              type="button"
              aria-expanded={menu}
              aria-haspopup="true"
              onClick={() => setMenu((m) => !m)}
              className="max-w-[12rem] truncate rounded-md border border-rule px-3 py-1.5 text-sm"
            >
              {me.user.name ?? me.user.email}
            </button>
            {menu && (
              <div className="absolute right-0 mt-2 w-64 rounded-lg border border-rule bg-surface p-2 text-sm shadow-lg">
                <p className="truncate px-2 py-1 text-quiet">{me.user.email}</p>
                <Link to="/glass" onClick={() => setMenu(false)} className="mt-1 block rounded border-t border-rule px-2 py-2 hover:bg-ground">
                  Glass order
                </Link>
                <Link to="/team" onClick={() => setMenu(false)} className="block rounded px-2 py-2 hover:bg-ground">
                  Team
                </Link>
                <Link to="/settings" onClick={() => setMenu(false)} className="block rounded px-2 py-2 hover:bg-ground">
                  Settings
                </Link>
                {me.billing && (
                  <Link to="/billing" onClick={() => setMenu(false)} className="block rounded px-2 py-2 hover:bg-ground">
                    Billing
                  </Link>
                )}
                {me.platformAdmin && (
                  <Link to="/platform" onClick={() => setMenu(false)} className="mt-1 block rounded border-t border-rule px-2 py-2 hover:bg-ground">
                    Platform admin
                  </Link>
                )}
                {me.companies.length > 1 && (
                  <div className="mt-1 border-t border-rule pt-1">
                    <p className="px-2 py-1 text-xs uppercase tracking-wide text-quiet">Companies</p>
                    {me.companies.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => switchTo(c.id)}
                        aria-current={c.id === me.company?.id ? 'true' : undefined}
                        className={`block w-full rounded px-2 py-1.5 text-left hover:bg-ground ${c.id === me.company?.id ? 'font-semibold' : ''}`}
                      >
                        {c.name}
                      </button>
                    ))}
                    {problem && (
                      <p role="alert" className="px-2 py-1 text-bad">
                        {problem}
                      </p>
                    )}
                  </div>
                )}
                <button type="button" onClick={signOut} className="mt-1 block w-full rounded border-t border-rule px-2 py-2 text-left hover:bg-ground">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
