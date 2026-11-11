/**
 * The team: who can sign in to this company's workspace.
 *
 * Everyone on the team can see who is on it. An owner can add people, make
 * them owners or staff, and take them off, and sees a record of each change.
 * A company always keeps at least one owner; the server says so if asked to
 * leave it without one.
 */

import { useState, type FormEvent } from 'react';
import { api, ApiError, signInAgain, SignedOut, type Me, type Role, type Team as TeamData, type TeamChange, type TeamMember } from '../lib/api';
import { when, whenExactly } from '../lib/format';
import { useLoad } from '../lib/load';
import { Problem, Section } from './parts';

const ROLE_NAMES: Record<Role, string> = { owner: 'Owner', staff: 'Staff' };

/** What went wrong, in words, or a fresh sign-in if the session has ended. */
function failure(error: unknown, otherwise: string): string {
  if (error instanceof SignedOut) {
    signInAgain();
    return '';
  }
  return error instanceof ApiError ? error.message : otherwise;
}

export function Team({ me }: { me: Me }) {
  const team = useLoad<TeamData>('team', (signal) => api.team(signal));
  const owner = me.role === 'owner';

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-4 sm:px-6">
      <h1 className="text-2xl font-bold">Team</h1>
      <p className="mt-1 text-quiet">
        {owner
          ? 'Everyone here can sign in to this workspace. Owners can also change the team.'
          : 'Everyone here can sign in to this workspace. Only an owner can change the team.'}
      </p>

      {owner && <AddPerson onAdded={team.reload} />}

      {team.error && !team.data ? <Problem error={team.error} retry={team.reload} /> : null}
      {team.data && (
        <Section title={team.data.members.length === 1 ? '1 person' : `${team.data.members.length} people`}>
          <ul className="divide-y divide-rule rounded-lg border border-rule bg-surface">
            {team.data.members.map((member) => (
              <MemberRow key={member.id} member={member} you={member.userId === me.user.id} owner={owner} onChanged={team.reload} />
            ))}
          </ul>
        </Section>
      )}

      {owner && team.data?.changes && team.data.changes.length > 0 && (
        <Section title="Recent changes">
          <ol className="space-y-2 rounded-lg border border-rule bg-surface p-4 text-sm">
            {team.data.changes.map((change) => (
              <li key={change.id} className="flex justify-between gap-3">
                <span className="min-w-0">{describe(change, me)}</span>
                <span className="shrink-0 text-xs text-quiet" title={whenExactly(change.at)}>
                  {when(change.at)}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

function AddPerson({ onAdded }: { onAdded: () => void }) {
  const [person, setPerson] = useState<{ email: string; name: string; role: Role }>({ email: '', name: '', role: 'staff' });
  const [state, setState] = useState<{ busy: boolean; error: string | null; done: string | null }>({ busy: false, error: null, done: null });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setState({ busy: true, error: null, done: null });
    try {
      const added = await api.addToTeam(person);
      const who = added.member.name ?? added.member.email;
      setState({
        busy: false,
        error: null,
        done: added.emailed
          ? `${who} is on the team. We have emailed ${added.member.email} to say so, with a button to sign in.`
          : `${who} is on the team. Tell them to sign in at ${window.location.host} with ${added.member.email}.`,
      });
      setPerson({ email: '', name: '', role: 'staff' });
      onAdded();
    } catch (error) {
      setState({ busy: false, error: failure(error, 'They could not be added. Please try again.'), done: null });
    }
  };

  return (
    <Section title="Add someone">
      <form onSubmit={submit} className="rounded-lg border border-rule bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Email address</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              value={person.email}
              onChange={(e) => setPerson({ ...person, email: e.target.value })}
              className="mt-1 h-11 w-full rounded-md border border-rule bg-ground px-3 text-base"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Name</span> <span className="text-quiet">(if you like)</span>
            <input
              type="text"
              autoComplete="off"
              maxLength={100}
              value={person.name}
              onChange={(e) => setPerson({ ...person, name: e.target.value })}
              className="mt-1 h-11 w-full rounded-md border border-rule bg-ground px-3 text-base"
            />
          </label>
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium">As</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {(['staff', 'owner'] as const).map((role) => (
              <label key={role} className="flex items-center gap-2">
                <input type="radio" name="role" value={role} checked={person.role === role} onChange={() => setPerson({ ...person, role })} />
                {role === 'staff' ? 'Staff: works the jobs' : 'Owner: also changes the team'}
              </label>
            ))}
          </div>
        </fieldset>
        {state.error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {state.error}
          </p>
        )}
        {state.done && (
          <p role="status" className="mt-3 text-sm text-good">
            {state.done}
          </p>
        )}
        <button type="submit" disabled={state.busy} className="mt-4 h-11 rounded-md bg-accent px-5 font-semibold text-accent-ink disabled:opacity-60">
          {state.busy ? 'Adding' : 'Add to the team'}
        </button>
      </form>
    </Section>
  );
}

function MemberRow({ member, you, owner, onChanged }: { member: TeamMember; you: boolean; owner: boolean; onChanged: () => void }) {
  const [state, setState] = useState<{ busy: boolean; error: string | null; confirming: boolean }>({ busy: false, error: null, confirming: false });
  const name = member.name ?? member.email;

  const setRole = async (role: Role) => {
    setState({ busy: true, error: null, confirming: false });
    try {
      await api.setRole(member.id, role);
      // Your own role decides what this page offers, so it starts again.
      if (you) return window.location.reload();
      setState({ busy: false, error: null, confirming: false });
      onChanged();
    } catch (error) {
      setState({ busy: false, error: failure(error, 'That could not be changed. Please try again.'), confirming: false });
    }
  };

  const remove = async () => {
    setState({ busy: true, error: null, confirming: true });
    try {
      await api.removeFromTeam(member.id);
      if (you) return signInAgain();
      onChanged();
    } catch (error) {
      setState({ busy: false, error: failure(error, 'They could not be taken off. Please try again.'), confirming: false });
    }
  };

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {name}
            {you && <span className="ml-2 rounded bg-ground px-1.5 py-0.5 text-xs font-medium text-quiet">You</span>}
          </p>
          {member.name && <p className="truncate text-sm text-quiet">{member.email}</p>}
          <p className="text-xs text-quiet">
            {member.lastSignedInAt ? `Last signed in ${lastSeen(member.lastSignedInAt)}` : 'Not signed in yet'}
          </p>
        </div>
        {owner ? (
          <label className="shrink-0">
            <span className="sr-only">Role for {name}</span>
            <select
              value={member.role}
              disabled={state.busy}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 rounded-md border border-rule bg-surface px-2 text-sm font-medium disabled:opacity-60"
            >
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </label>
        ) : (
          <span className="shrink-0 text-sm font-medium text-quiet">{ROLE_NAMES[member.role]}</span>
        )}
      </div>

      {owner &&
        (state.confirming ? (
          <div className="mt-2 rounded-md border border-bad/40 bg-bad/10 p-3 text-sm">
            <p>
              {you
                ? 'Take yourself off the team? You will be signed out at once.'
                : `Take ${name} off the team? They are signed out at once and can no longer sign in here.`}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={remove} disabled={state.busy} className="h-9 rounded-md bg-bad px-3 font-semibold text-white disabled:opacity-60">
                {state.busy ? 'Taking off' : 'Take off the team'}
              </button>
              <button
                type="button"
                onClick={() => setState({ busy: false, error: null, confirming: false })}
                className="h-9 rounded-md border border-rule bg-surface px-3 font-medium"
              >
                Keep
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setState({ busy: false, error: null, confirming: true })}
            className="mt-1 text-sm font-medium text-bad underline underline-offset-2"
          >
            Take off the team
          </button>
        ))}

      {state.error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {state.error}
        </p>
      )}
    </li>
  );
}

/** "today at 14:32", "yesterday" or "on 9 Nov". */
function lastSeen(iso: string): string {
  const said = when(iso);
  if (said.includes(':')) return `today at ${said}`;
  return said === 'Yesterday' ? 'yesterday' : `on ${said}`;
}

/** A change to the team, in words. */
function describe(change: TeamChange, me: Me): string {
  const by = !change.by ? 'SetOut' : change.by.email === me.user.email ? 'You' : (change.by.name ?? change.by.email);
  const who = change.data.email ?? 'someone';
  switch (change.action) {
    case 'member_added':
      return `${by} added ${who} as ${change.data.role === 'owner' ? 'an owner' : 'staff'}.`;
    case 'member_removed':
      return `${by} took ${who} off the team.`;
    case 'role_changed':
      return change.data.to === 'owner' ? `${by} made ${who} an owner.` : `${by} made ${who} staff.`;
    default:
      return `${by} changed the team.`;
  }
}
