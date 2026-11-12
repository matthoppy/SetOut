/**
 * A company's settings: seen by everyone on its team, changed by its owners
 * alone, every change checked first and written to the audit log, and none of
 * it reaching another company.
 *
 * The tests run in order, each building on the settings the last one left.
 */
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember } from '../src/db/auth';
import { readSettings, saveSettings } from '../src/db/settings';
import { DEFAULT_SETTINGS } from '../src/lib/designer-config';
import { optionId } from '../src/lib/settings';
import { api, company, DESIGNER, enquire, json, post, signIn, type Company } from './helpers';

interface Finish {
  id: string;
  label: string;
  swatch: string;
  code?: string;
}
interface Handle {
  id: string;
  label: string;
  description: string;
  code?: string;
}
interface DesignerBody {
  id: string;
  name: string;
  active: boolean;
  finishes: Finish[];
  handles: Handle[];
  glass: { offered: number[]; standard: number };
  hinges: Hinges;
  notifyEmails: string[];
  inUse: { finishes: Record<string, number>; handles: Record<string, number> };
  versions: { finishes: string; handles: string; glass: string; hinges: string; notifyEmails: string };
}
interface Hinges {
  wall: { offered: string[]; standard: string };
  inLine: { offered: string[]; standard: string };
}
interface Change {
  id: string;
  by: { email: string } | null;
  data: { designer?: { id: string; name: string }; changes: Record<string, unknown>[] };
  at: string;
}
interface SettingsBody {
  canChange: boolean;
  company: {
    name: string;
    branding: { primary: string; primaryForeground: string; logoUrl: string | null };
    quotes: { vatRateBp: number; validDays: number };
    versions: { name: string; branding: string; quotes: string };
  };
  designers: DesignerBody[];
  limits: Record<string, number>;
  changes?: Change[];
}
interface PublicConfig {
  brand: { name: string; primary: string; primaryForeground: string; logoUrl?: string };
  finishes: Finish[];
  handles: Handle[];
  glassThicknessMm: number;
  glassThicknesses: number[];
  hinges: Hinges;
  intro?: string;
}

let shop: Company;
let other: Company;
let owner: string;
let staff: string;
let rival: string;

const read = async (cookie = owner) => json<SettingsBody>(await api('/settings', { cookie }));
const ours = async () => (await read()).designers[0];
const patch = (path: string, body: unknown, cookie = owner) => api(path, { cookie, method: 'PATCH', body: JSON.stringify(body) });
/** Change our designer, from its settings as they now stand. */
const changeDesigner = async (changes: Record<string, unknown>, cookie = owner) => {
  const designer = await ours();
  return patch(`/settings/designers/${designer.id}`, { ...changes, basedOn: designer.versions }, cookie);
};
/** Change the company, from its settings as they now stand. */
const changeCompany = async (changes: Record<string, unknown>, cookie = owner) => {
  const { company: now } = await read();
  return patch('/settings/company', { ...changes, basedOn: now.versions }, cookie);
};
const saved = async (response: Response) => {
  expect(response.status).toBe(200);
  return json<{ ok: true; changed: boolean; designer: DesignerBody }>(response);
};
const errorOf = async (response: Response) => [response.status, (await json<{ error: string }>(response)).error];
/** What the public designer is sent for its site key. */
const publicConfig = async (c: Company) =>
  json<PublicConfig>(await exports.default.fetch(`${DESIGNER}/api/designer/config?key=${c.siteKey}`));
const firstJob = async () => {
  const { jobs } = await json<{ jobs: { id: string }[] }>(await api('/jobs', { cookie: owner }));
  return jobs[0].id;
};
type Label = { id: string; label: string; code?: string };
const labelsOnJob = async () =>
  (
    await json<{ labels: { finishes: Label[]; handles: Label[]; hinges: { wall: string; inLine: string } } }>(
      await api(`/jobs/${await firstJob()}`, { cookie: owner })
    )
  ).labels;

beforeAll(async () => {
  shop = await company('Settings Showers', 'SS');
  other = await company('Other Glass', 'OG');
  await addMember(env, shop.id, 'owner@ss.example', 'owner');
  await addMember(env, shop.id, 'staff@ss.example', 'staff');
  await addMember(env, other.id, 'owner@og.example', 'owner');
  // Wording the company has, which this page does not change.
  const [designer] = await shop.db.find('designers');
  await shop.db.update('designers', designer.id, { config: { intro: 'Design yours.', glassThicknessMm: 10 } });
  await enquire(shop, 'Sita Settings', 'sita@example.test', 'SS1 1AA');
  owner = await signIn('owner@ss.example');
  staff = await signIn('staff@ss.example');
  rival = await signIn('owner@og.example');
});

describe('seeing the settings', () => {
  test('everyone on the team sees them as they stand, with SetOut’s own until they are changed', async () => {
    const seen = await read(staff);
    expect(seen.canChange).toBe(false);
    expect(seen.changes).toBeUndefined();
    expect(seen.company).toMatchObject({
      name: 'Settings Showers',
      branding: { primary: '#1e293b', primaryForeground: '#ffffff', logoUrl: null },
      quotes: { vatRateBp: 2000, validDays: 30 },
    });
    expect(seen.designers).toHaveLength(1);
    expect(seen.designers[0]).toMatchObject({
      name: 'Settings Showers website',
      active: true,
      finishes: DEFAULT_SETTINGS.finishes,
      handles: DEFAULT_SETTINGS.handles,
      notifyEmails: [],
    });
    // The shower already sent counts against what it uses.
    expect(seen.designers[0].inUse).toEqual({ finishes: { chrome: 1 }, handles: { pull: 1 } });

    const mine = await read(owner);
    expect(mine.canChange).toBe(true);
    expect(mine.changes).toEqual([]);
  });

  test('signed out, there is nothing; from another website or the designer’s address, nothing changes', async () => {
    expect((await api('/settings')).status).toBe(401);
    const designer = await ours();
    const body = JSON.stringify({ notifyEmails: ['sales@ss.example'], basedOn: designer.versions });
    const foreign = await api(`/settings/designers/${designer.id}`, { cookie: owner, method: 'PATCH', origin: 'https://evil.example', body });
    expect(foreign.status).toBe(403);
    expect((await api(`/settings/designers/${designer.id}`, { cookie: owner, method: 'PATCH', body }, DESIGNER)).status).toBe(404);
    expect((await ours()).notifyEmails).toEqual([]);
  });
});

describe('only an owner changes them', () => {
  test('staff are told so, and nothing changes', async () => {
    const before = await read();
    for (const response of [await changeCompany({ name: 'Staff Showers' }, staff), await changeDesigner({ notifyEmails: ['staff@ss.example'] }, staff)]) {
      expect(response.status).toBe(403);
      expect(await json(response)).toEqual({ error: 'owners_only', message: 'Only an owner can change the company’s settings.' });
    }
    expect(await read()).toEqual(before);
  });
});

describe('finishes and handles', () => {
  test('an owner renames, recolours, adds and removes finishes, and those kept keep their ids', async () => {
    const { designer } = await saved(
      await changeDesigner({
        finishes: [
          { id: 'chrome', label: '  Bright   chrome ', swatch: '#D0D4D8' },
          { id: 'matte-black', label: 'Matte black', swatch: '#1c1c1c' },
          { label: 'Gunmetal grey', swatch: '#4a4f54' },
        ],
      })
    );
    expect(designer.finishes).toEqual([
      { id: 'chrome', label: 'Bright chrome', swatch: '#d0d4d8' },
      { id: 'matte-black', label: 'Matte black', swatch: '#1c1c1c' },
      { id: 'gunmetal-grey', label: 'Gunmetal grey', swatch: '#4a4f54' },
    ]);
    // The designer offers them at once, and keeps its own wording.
    const config = await publicConfig(shop);
    expect(config.finishes).toEqual(designer.finishes);
    expect(config.handles).toEqual(DEFAULT_SETTINGS.handles);
    expect(config.intro).toBe('Design yours.');
    // The job and its sheets call the finish by its new name.
    expect((await labelsOnJob()).finishes[0]).toEqual({ id: 'chrome', label: 'Bright chrome' });
  });

  test('a new option’s id is made from its name, and is never one already taken', async () => {
    const none = new Set<string>();
    expect(optionId('Gunmetal grey', none, 'finish')).toBe('gunmetal-grey');
    expect(optionId('  Crème brûlée  ', none, 'finish')).toBe('creme-brulee');
    expect(optionId('Black & gold', none, 'finish')).toBe('black-and-gold');
    expect(optionId('10mm bar, 300mm centres', none, 'handle')).toBe('10mm-bar-300mm-centres');
    expect(optionId('黒', none, 'finish')).toBe('finish');
    expect(optionId('Chrome', new Set(['chrome', 'chrome-2']), 'finish')).toBe('chrome-3');
    expect(optionId('x'.repeat(80), none, 'handle')).toBe('x'.repeat(37));

    const before = await ours();
    const { designer } = await saved(await changeDesigner({ finishes: [...before.finishes, { label: 'Chrome', swatch: '#cccccc' }] }));
    expect(designer.finishes.map((f) => f.id)).toEqual(['chrome', 'matte-black', 'gunmetal-grey', 'chrome-2']);
  });

  test('handles are changed the same way', async () => {
    const { designer } = await saved(
      await changeDesigner({
        handles: [
          { id: 'pull', label: 'Pull handle', description: 'Back-to-back bar, 203mm centres, in the finish you choose.' },
          { id: 'knob', label: 'Round knob', description: 'Single round knob.' },
          { label: 'Long bar handle' },
        ],
      })
    );
    expect(designer.handles).toEqual([
      { id: 'pull', label: 'Pull handle', description: 'Back-to-back bar, 203mm centres, in the finish you choose.' },
      { id: 'knob', label: 'Round knob', description: 'Single round knob.' },
      { id: 'long-bar-handle', label: 'Long bar handle', description: '' },
    ]);
    expect((await publicConfig(shop)).handles).toEqual(designer.handles);
  });

  test('a designer always offers at least one finish and one handle', async () => {
    const before = await ours();
    expect(await errorOf(await changeDesigner({ finishes: [] }))).toEqual([400, 'invalid_finishes']);
    expect(await errorOf(await changeDesigner({ handles: [] }))).toEqual([400, 'invalid_handles']);
    expect(await ours()).toEqual(before);
  });

  const finish = (label: string, swatch = '#cccccc', id?: string) => ({ ...(id ? { id } : {}), label, swatch });
  test.each([
    ['not a list', 'chrome'],
    ['something that is not a finish', ['chrome']],
    ['a colour that is not one', [finish('Chrome', 'silver', 'chrome')]],
    ['a colour written short', [finish('Chrome', '#ccc', 'chrome')]],
    ['a colour without its #', [finish('Chrome', 'cccccc', 'chrome')]],
    ['a finish with no name', [finish('   ')]],
    ['a name too long', [finish('x'.repeat(61))]],
    ['two finishes of the same name', [finish('Shiny', '#cccccc', 'chrome'), finish('SHINY')]],
    ['an id the designer does not offer', [finish('Satin brass', '#b5a26a', 'satin-brass')]],
    ['an id that is not text', [{ id: 7, label: 'Seven', swatch: '#777777' }]],
    ['the same finish twice', [finish('Chrome', '#cccccc', 'chrome'), finish('Other chrome', '#dddddd', 'chrome')]],
    ['too many', Array.from({ length: 31 }, (_, i) => finish(`Finish ${i}`))],
  ])('finishes: %s are refused, and nothing changes', async (_, finishes) => {
    const before = await ours();
    expect(await errorOf(await changeDesigner({ finishes }))).toEqual([400, 'invalid_finishes']);
    expect(await ours()).toEqual(before);
  });

  test.each([
    ['a description too long', [{ id: 'pull', label: 'Pull', description: 'x'.repeat(201) }]],
    ['a description that is not words', [{ id: 'pull', label: 'Pull', description: 42 }]],
    ['a handle with no name', [{ id: 'pull', label: '', description: 'Bar' }]],
  ])('handles: %s are refused, and nothing changes', async (_, handles) => {
    const before = await ours();
    expect(await errorOf(await changeDesigner({ handles }))).toEqual([400, 'invalid_handles']);
    expect(await ours()).toEqual(before);
  });

  test('a request with one thing wrong changes nothing at all', async () => {
    const before = await ours();
    const response = await changeDesigner({
      finishes: [finish('Changed', '#000000', 'chrome')],
      handles: [{ id: 'pull', label: '', description: '' }],
      notifyEmails: ['sales@ss.example'],
    });
    expect(await errorOf(response)).toEqual([400, 'invalid_handles']);
    expect(await ours()).toEqual(before);
  });

  test('an option that showers use can be removed, and the settings say how many use it', async () => {
    const before = await ours();
    expect(before.inUse.handles.pull).toBe(1);
    await saved(await changeDesigner({ handles: before.handles.filter((h) => h.id !== 'pull') }));
    const after = await ours();
    expect(after.handles.map((h) => h.id)).toEqual(['knob', 'long-bar-handle']);
    // The shower keeps it. Its job no longer has a name for it, so its sheets fall back to the id.
    expect(after.inUse.handles.pull).toBe(1);
    expect((await labelsOnJob()).handles.map((h) => h.id)).toEqual(['knob', 'long-bar-handle']);
  });
});

describe('who is emailed when a design arrives', () => {
  test('addresses are saved tidied, each once', async () => {
    const { designer } = await saved(await changeDesigner({ notifyEmails: [' Sales@SS.example ', 'office@ss.example', 'sales@ss.example'] }));
    expect(designer.notifyEmails).toEqual(['sales@ss.example', 'office@ss.example']);
    const [row] = await shop.db.find('designers');
    expect(row.notify_emails).toEqual(['sales@ss.example', 'office@ss.example']);
  });

  test.each([
    ['an address that is not one', ['sales@ss.example', 'not an address']],
    ['a blank one', ['sales@ss.example', '']],
    ['something that is not text', [42]],
    ['nobody at all', []],
    ['too many', ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => `${n}@ss.example`)],
    ['not a list', 'sales@ss.example'],
  ])('%s is refused, and nothing changes', async (_, notifyEmails) => {
    const before = await ours();
    expect(await errorOf(await changeDesigner({ notifyEmails }))).toEqual([400, 'invalid_emails']);
    expect(await ours()).toEqual(before);
  });

  test('which websites may show the designer, and whether it is on, are not changed here', async () => {
    const [before] = await shop.db.find('designers');
    expect(await errorOf(await changeDesigner({ allowedOrigins: ['https://evil.example'], allowed_origins: ['https://evil.example'] }))).toEqual([
      400,
      'invalid_request',
    ]);
    await saved(await changeDesigner({ notifyEmails: ['sales@ss.example'], allowed_origins: ['https://evil.example'], status: 'paused' }));
    const [after] = await shop.db.find('designers');
    expect(after.allowed_origins).toEqual(before.allowed_origins);
    expect(after.status).toBe('active');
    expect(after.notify_emails).toEqual(['sales@ss.example']);
  });
});

describe('colours and logo', () => {
  test('are saved, and the designer uses them at once', async () => {
    await saved(await changeCompany({ branding: { primary: '#0F766E', primaryForeground: '#FFFFFF', logoUrl: ' https://cdn.example.com/logo.png ' } }));
    expect((await read()).company.branding).toEqual({ primary: '#0f766e', primaryForeground: '#ffffff', logoUrl: 'https://cdn.example.com/logo.png' });
    expect((await publicConfig(shop)).brand).toEqual({
      name: 'Settings Showers',
      primary: '#0f766e',
      primaryForeground: '#ffffff',
      logoUrl: 'https://cdn.example.com/logo.png',
    });
  });

  test('the logo can be taken off again', async () => {
    await saved(await changeCompany({ branding: { logoUrl: null } }));
    expect((await read()).company.branding).toEqual({ primary: '#0f766e', primaryForeground: '#ffffff', logoUrl: null });
    expect((await publicConfig(shop)).brand.logoUrl).toBeUndefined();
  });

  test.each([
    ['a colour by name', { primary: 'teal' }],
    ['a colour written short', { primary: '#fff' }],
    ['a colour without its #', { primary: '0f766e' }],
    ['a colour that is not hex', { primary: '#0f766g' }],
    ['words in a colour that is not one', { primaryForeground: 'rgb(0, 0, 0)' }],
    ['a logo not sent securely', { logoUrl: 'http://cdn.example.com/logo.png' }],
    ['a logo that is a script', { logoUrl: 'javascript:alert(1)' }],
    ['a logo pasted in whole', { logoUrl: 'data:image/png;base64,iVBORw0KGgo=' }],
    ['a logo behind a password', { logoUrl: 'https://user:secret@cdn.example.com/logo.png' }],
    ['a logo on a machine of its own', { logoUrl: 'https://localhost/logo.png' }],
    ['a logo that is not a link', { logoUrl: 'our logo' }],
    ['a logo with too long a link', { logoUrl: `https://cdn.example.com/${'x'.repeat(500)}.png` }],
    ['a logo that is not text', { logoUrl: 42 }],
    ['branding that is not a set of colours', 'blue'],
  ])('%s is refused, and nothing changes', async (_, branding) => {
    const before = await read();
    expect(await errorOf(await changeCompany({ branding }))).toEqual([400, 'invalid_branding']);
    expect((await read()).company).toEqual(before.company);
  });
});

describe('how a quote starts', () => {
  const newQuote = async () => {
    const jobId = await firstJob();
    const made = await json<{ id: string }>(await post(`/jobs/${jobId}/quotes`, {}, { cookie: owner }));
    const { quote } = await json<{ quote: { vat_rate_bp: number; valid_days: number } }>(await api(`/jobs/${jobId}/quotes/${made.id}`, { cookie: owner }));
    expect((await api(`/jobs/${jobId}/quotes/${made.id}`, { cookie: owner, method: 'DELETE' })).status).toBe(200);
    return quote;
  };

  test('a new quote starts with the company’s VAT and how long it stands', async () => {
    expect(await newQuote()).toMatchObject({ vat_rate_bp: 2000, valid_days: 30 });
    await saved(await changeCompany({ quotes: { vatRateBp: 1750, validDays: 14 } }));
    expect((await read()).company.quotes).toEqual({ vatRateBp: 1750, validDays: 14 });
    expect(await newQuote()).toMatchObject({ vat_rate_bp: 1750, valid_days: 14 });
    const stored = await shop.db.company();
    expect(stored?.settings).toEqual({ vatRateBp: 1750, quoteValidDays: 14 });
  });

  test.each([
    ['VAT to more than two places', { vatRateBp: 1750.5 }, 'invalid_vat'],
    ['VAT below nothing', { vatRateBp: -1 }, 'invalid_vat'],
    ['VAT over 100%', { vatRateBp: 10_001 }, 'invalid_vat'],
    ['VAT as words', { vatRateBp: '2000' }, 'invalid_vat'],
    ['a quote that stands for no days', { validDays: 0 }, 'invalid_validity'],
    ['a quote that stands for over a year', { validDays: 366 }, 'invalid_validity'],
    ['part of a day', { validDays: 1.5 }, 'invalid_validity'],
    ['days as words', { validDays: '30' }, 'invalid_validity'],
    ['something that is not a setting', 'twenty', 'invalid_request'],
  ])('%s is refused, and nothing changes', async (_, quotes, code) => {
    const before = await read();
    expect(await errorOf(await changeCompany({ quotes }))).toEqual([400, code]);
    expect((await read()).company).toEqual(before.company);
  });
});

describe('the company’s name', () => {
  test('is saved tidied, and used everywhere at once', async () => {
    await saved(await changeCompany({ name: '  Settings   Showers Ltd ' }));
    expect((await read()).company.name).toBe('Settings Showers Ltd');
    expect(await json(await api('/me', { cookie: staff }))).toMatchObject({ company: { name: 'Settings Showers Ltd' } });
    expect((await publicConfig(shop)).brand.name).toBe('Settings Showers Ltd');
    expect((await shop.db.engineContext()).context.companyName).toBe('Settings Showers Ltd');
  });

  test.each([['nothing', ''], ['only spaces', '   '], ['too long a name', 'x'.repeat(101)], ['something that is not a name', 42]])(
    '%s is refused',
    async (_, name) => {
      expect(await errorOf(await changeCompany({ name }))).toEqual([400, 'invalid_name']);
      expect((await read()).company.name).toBe('Settings Showers Ltd');
    }
  );

  test('a request with one thing wrong changes nothing at all', async () => {
    const before = await read();
    const response = await changeCompany({ name: 'Another Name', branding: { primary: '#000000' }, quotes: { vatRateBp: 999_999 } });
    expect(await errorOf(response)).toEqual([400, 'invalid_vat']);
    expect((await read()).company).toEqual(before.company);
  });
});

describe('a change made from an older copy', () => {
  test('is refused, not saved over the newer one, and holds up nothing else', async () => {
    const old = await ours();
    await saved(await changeDesigner({ notifyEmails: ['first@ss.example'] }));
    const stale = await patch(`/settings/designers/${old.id}`, { notifyEmails: ['second@ss.example'], basedOn: old.versions });
    expect(await errorOf(stale)).toEqual([409, 'stale']);
    expect((await ours()).notifyEmails).toEqual(['first@ss.example']);
    // The handles have not changed since, so a change to them still goes in.
    const handles = old.handles.map((h) => (h.id === 'knob' ? { ...h, label: 'Knob' } : h));
    await saved(await patch(`/settings/designers/${old.id}`, { handles, basedOn: old.versions }));
    expect((await ours()).handles.find((h) => h.id === 'knob')?.label).toBe('Knob');
    // Saying nothing about what it was made from is no better.
    expect(await errorOf(await patch(`/settings/designers/${old.id}`, { notifyEmails: ['third@ss.example'] }))).toEqual([409, 'stale']);
  });

  test('of the company’s settings is refused the same way', async () => {
    const { company: old } = await read();
    await saved(await changeCompany({ quotes: { validDays: 21 } }));
    expect(await errorOf(await patch('/settings/company', { quotes: { validDays: 7 }, basedOn: old.versions }))).toEqual([409, 'stale']);
    expect((await read()).company.quotes.validDays).toBe(21);
    await saved(await patch('/settings/company', { branding: { primary: '#1d4ed8' }, basedOn: old.versions }));
    expect((await read()).company.branding.primary).toBe('#1d4ed8');
  });

  test('two parts saved at the same moment both go in', async () => {
    const designer = await ours();
    const finishes = designer.finishes.map((f, i) => (i === 0 ? { ...f, label: 'Brightest chrome' } : f));
    const handles = designer.handles.map((h, i) => (i === 0 ? { ...h, description: 'Saved at the same moment.' } : h));
    const answers = await Promise.all([
      patch(`/settings/designers/${designer.id}`, { finishes, basedOn: designer.versions }),
      patch(`/settings/designers/${designer.id}`, { handles, basedOn: designer.versions }),
    ]);
    expect(answers.map((a) => a.status)).toEqual([200, 200]);
    const after = await ours();
    expect(after.finishes[0].label).toBe('Brightest chrome');
    expect(after.handles[0].description).toBe('Saved at the same moment.');
  });

  test('read before someone else’s change lands, is not written, and nor is its record', async () => {
    const stored = await readSettings(env, shop.id);
    if (!stored) throw new Error('no settings');
    const [designer] = stored.designers;
    await saved(await changeDesigner({ notifyEmails: ['meanwhile@ss.example'] }));
    const count = async () =>
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE company_id = ? AND action = 'settings_changed'").bind(shop.id).first<{ n: number }>())?.n;
    const before = await count();
    const written = await saveSettings(
      env,
      shop.id,
      'usr_x',
      { table: 'designers', id: designer.id, columns: { notify_emails: { was: designer.notify_emails, now: '["late@ss.example"]' } } },
      { changes: [] }
    );
    expect(written).toBe(false);
    expect((await ours()).notifyEmails).toEqual(['meanwhile@ss.example']);
    expect(await count()).toBe(before);
  });
});

describe('another company', () => {
  test('sees only its own settings, and cannot change ours', async () => {
    const theirs = await read(rival);
    expect(theirs.company.name).toBe('Other Glass');
    expect(theirs.designers.map((d) => d.name)).toEqual(['Other Glass website']);
    expect(theirs.changes).toEqual([]);

    const before = await read();
    const mine = before.designers[0];
    const response = await patch(`/settings/designers/${mine.id}`, { notifyEmails: ['attacker@evil.example'], basedOn: mine.versions }, rival);
    expect(await errorOf(response)).toEqual([404, 'not_found']);

    // Their own changes touch only theirs.
    const t = theirs.designers[0];
    await saved(await patch(`/settings/designers/${t.id}`, { notifyEmails: ['owner@og.example'], basedOn: t.versions }, rival));
    await saved(await patch('/settings/company', { name: 'Other Glass Ltd', basedOn: theirs.company.versions }, rival));
    expect(await read()).toEqual(before);
    expect((await read(rival)).company.name).toBe('Other Glass Ltd');
    expect((await publicConfig(other)).brand.name).toBe('Other Glass Ltd');
  });
});

describe('the record of changes', () => {
  test('each change is on record, newest first, with who made it and what changed', async () => {
    const { changes } = await read();
    expect(changes?.[0]).toMatchObject({ by: { email: 'owner@ss.example' }, data: { changes: [{ field: 'notifyEmails', added: ['meanwhile@ss.example'] }] } });
    const finishes = changes?.find((c) => c.data.changes.some((ch) => ch.id === 'gunmetal-grey' && ch.change === 'added'));
    expect(finishes?.data.designer).toMatchObject({ name: 'Settings Showers website' });
    expect(finishes?.data.changes).toEqual(
      expect.arrayContaining([
        { field: 'finish', change: 'renamed', id: 'chrome', label: 'Bright chrome', from: 'Polished chrome', to: 'Bright chrome' },
        { field: 'finish', change: 'recoloured', id: 'chrome', label: 'Bright chrome', from: '#d4d8db', to: '#d0d4d8' },
        { field: 'finish', change: 'removed', id: 'brushed-nickel', label: 'Brushed nickel' },
        { field: 'finish', change: 'removed', id: 'satin-brass', label: 'Satin brass' },
        { field: 'finish', change: 'added', id: 'gunmetal-grey', label: 'Gunmetal grey' },
      ])
    );
    const named = changes?.find((c) => c.data.changes.some((ch) => ch.field === 'name'));
    expect(named?.data.changes).toEqual([{ field: 'name', from: 'Settings Showers', to: 'Settings Showers Ltd' }]);
    const quotes = changes?.find((c) => c.data.changes.some((ch) => ch.field === 'vatRateBp'));
    expect(quotes?.data.changes).toEqual([
      { field: 'vatRateBp', from: 2000, to: 1750 },
      { field: 'quoteValidDays', from: 30, to: 14 },
    ]);
    // Nothing of another company's.
    expect(changes?.some((c) => JSON.stringify(c).includes('Other Glass'))).toBe(false);
  });

  test('a save that changes nothing, or is refused, is not on record', async () => {
    const count = async () =>
      (await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE company_id = ? AND action = 'settings_changed'").bind(shop.id).first<{ n: number }>())?.n;
    const before = await count();
    const designer = await ours();
    const unchanged = await saved(await changeDesigner({ finishes: designer.finishes, handles: designer.handles, notifyEmails: designer.notifyEmails }));
    expect(unchanged.changed).toBe(false);
    expect((await saved(await changeCompany({ quotes: { vatRateBp: 1750 } }))).changed).toBe(false);
    expect((await changeDesigner({ finishes: [] })).status).toBe(400);
    expect((await changeCompany({ name: 'Staff Showers' }, staff)).status).toBe(403);
    expect(await count()).toBe(before);
    expect((await saved(await changeCompany({ quotes: { validDays: 28 } }))).changed).toBe(true);
    expect(await count()).toBe((before ?? 0) + 1);
  });

  test('the team’s own record does not list them', async () => {
    const team = await json<{ changes: { action: string }[] }>(await api('/team', { cookie: owner }));
    expect(team.changes.every((c) => c.action !== 'settings_changed')).toBe(true);
  });
});

describe('CRL codes for the sheets', () => {
  test('are saved tidied and reach the job, and the public designer is not sent them', async () => {
    const before = await ours();
    const [finish] = before.finishes;
    const [handle] = before.handles;
    const { designer } = await saved(
      await changeDesigner({
        finishes: before.finishes.map((f) => (f.id === finish.id ? { ...f, code: ' bsc ' } : f)),
        handles: before.handles.map((h) => (h.id === handle.id ? { ...h, code: 'sq 8x8' } : h)),
      })
    );
    expect(designer.finishes[0]).toEqual({ ...finish, code: 'BSC' });
    expect(designer.handles[0]).toEqual({ ...handle, code: 'SQ8X8' });
    // They are for the company's own sheets, not its customers.
    const config = await publicConfig(shop);
    expect(config.finishes[0]).toEqual(finish);
    expect(config.handles[0]).toEqual(handle);
    expect(JSON.stringify(config)).not.toContain('SQ8X8');
    const labels = await labelsOnJob();
    expect(labels.finishes[0]).toEqual({ id: finish.id, label: finish.label, code: 'BSC' });
    expect(labels.handles[0]).toEqual({ id: handle.id, label: handle.label, code: 'SQ8X8' });
    // On record, as a change of code.
    const { changes } = await read();
    expect(changes?.[0].data.changes).toEqual([
      { field: 'finish', change: 'coded', id: finish.id, label: finish.label, to: 'BSC' },
      { field: 'handle', change: 'coded', id: handle.id, label: handle.label, to: 'SQ8X8' },
    ]);
  });

  test.each([
    ['a code with other marks in it', 'M-BL'],
    ['a code too long', 'A'.repeat(13)],
    ['a code that is not text', 7],
  ])('%s is refused, and nothing changes', async (_, code) => {
    const before = await ours();
    const finishes = before.finishes.map((f, i) => (i === 0 ? { ...f, code } : f));
    expect(await errorOf(await changeDesigner({ finishes }))).toEqual([400, 'invalid_finishes']);
    const handles = before.handles.map((h, i) => (i === 0 ? { ...h, code } : h));
    expect(await errorOf(await changeDesigner({ handles }))).toEqual([400, 'invalid_handles']);
    expect(await ours()).toEqual(before);
  });

  test('a code taken out leaves none', async () => {
    const before = await ours();
    const { designer } = await saved(await changeDesigner({ finishes: before.finishes.map((f) => ({ ...f, code: '' })) }));
    expect(designer.finishes.some((f) => 'code' in f)).toBe(false);
    const { changes } = await read();
    expect(changes?.[0].data.changes).toEqual([{ field: 'finish', change: 'coded', id: before.finishes[0].id, label: before.finishes[0].label, from: 'BSC' }]);
  });
});

describe('the glass a designer offers', () => {
  test('is 10mm alone until an owner offers more, and a new design starts at 10mm', async () => {
    expect((await ours()).glass).toEqual({ offered: [10], standard: 10 });
    const config = await publicConfig(shop);
    expect(config.glassThicknesses).toEqual([10]);
    expect(config.glassThicknessMm).toBe(10);
  });

  test('an owner offers 8, 10 and 12mm, new designs still starting at 10mm, and the designer offers them at once', async () => {
    const { designer } = await saved(await changeDesigner({ glass: { offered: [12, 8, 10, 10], standard: 10 } }));
    expect(designer.glass).toEqual({ offered: [8, 10, 12], standard: 10 });
    const config = await publicConfig(shop);
    expect(config.glassThicknesses).toEqual([8, 10, 12]);
    expect(config.glassThicknessMm).toBe(10);
    // The rest of the designer's own settings are kept.
    expect(config.intro).toBe('Design yours.');
    const { changes } = await read();
    expect(changes?.[0].data.changes).toEqual([{ field: 'glassOffered', from: [10], to: [8, 10, 12] }]);
  });

  test('new designs can start at another thickness on offer', async () => {
    await saved(await changeDesigner({ glass: { offered: [8, 10, 12], standard: 12 } }));
    expect((await publicConfig(shop)).glassThicknessMm).toBe(12);
    const { changes } = await read();
    expect(changes?.[0].data.changes).toEqual([{ field: 'glassStandard', from: 10, to: 12 }]);
  });

  test.each([
    ['not a choice at all', 10],
    ['a thickness SetOut does not make', { offered: [6, 10], standard: 10 }],
    ['a thickness that is not a number', { offered: ['10mm'], standard: 10 }],
    ['none offered', { offered: [], standard: 10 }],
    ['new designs starting at one not offered', { offered: [8, 10], standard: 12 }],
  ])('%s is refused, and nothing changes', async (_, glass) => {
    const before = await ours();
    expect(await errorOf(await changeDesigner({ glass }))).toEqual([400, 'invalid_glass']);
    expect(await ours()).toEqual(before);
  });

  test('staff changing a shower may choose any thickness SetOut makes, whatever customers are offered', async () => {
    await saved(await changeDesigner({ glass: { offered: [10], standard: 10 } }));
    expect((await publicConfig(shop)).glassThicknesses).toEqual([10]);
    const job = await firstJob();
    const { designs } = await json<{ designs: { id: string }[] }>(await api(`/jobs/${job}`, { cookie: staff }));
    const editor = await json<{ config: { glassThicknesses: number[]; glassThicknessMm: number } }>(
      await api(`/jobs/${job}/designs/${designs[0].id}/editor`, { cookie: staff })
    );
    expect(editor.config.glassThicknesses).toEqual([8, 10, 12]);
    expect(editor.config.glassThicknessMm).toBe(10);
  });
});

describe('the hinges a designer offers', () => {
  test('are the offset back plate and the standard in-line hinge until an owner offers more', async () => {
    const standard = { wall: { offered: ['offset'], standard: 'offset' }, inLine: { offered: ['standard'], standard: 'standard' } };
    expect((await ours()).hinges).toEqual(standard);
    expect((await publicConfig(shop)).hinges).toEqual(standard);
    expect((await labelsOnJob()).hinges).toEqual({ wall: 'offset', inLine: 'standard' });
  });

  test('an owner offers more, sets the standard, and the designer, the job and the record follow', async () => {
    const hinges = {
      wall: { offered: ['short', 'full', 'offset', 'full'], standard: 'full' },
      inLine: { offered: ['adjustable', 'standard'], standard: 'standard' },
    };
    const { designer } = await saved(await changeDesigner({ hinges }));
    const tidied = { wall: { offered: ['offset', 'full', 'short'], standard: 'full' }, inLine: { offered: ['standard', 'adjustable'], standard: 'standard' } };
    expect(designer.hinges).toEqual(tidied);
    expect((await publicConfig(shop)).hinges).toEqual(tidied);
    expect((await labelsOnJob()).hinges).toEqual({ wall: 'full', inLine: 'standard' });
    const { changes } = await read();
    expect(changes?.[0].data.changes).toEqual([
      { field: 'wallHingesOffered', from: ['offset'], to: ['offset', 'full', 'short'] },
      { field: 'wallHingeStandard', from: 'offset', to: 'full' },
      { field: 'inLineHingesOffered', from: ['standard'], to: ['standard', 'adjustable'] },
    ]);
  });

  test.each([
    ['not a choice at all', 'full'],
    ['a hinge CRL does not make', { wall: { offered: ['glued'], standard: 'glued' }, inLine: { offered: ['standard'], standard: 'standard' } }],
    ['no wall hinge at all', { wall: { offered: [], standard: 'offset' }, inLine: { offered: ['standard'], standard: 'standard' } }],
    ['a standard not offered', { wall: { offered: ['offset'], standard: 'full' }, inLine: { offered: ['standard'], standard: 'standard' } }],
    ['the in-line hinges left out', { wall: { offered: ['offset'], standard: 'offset' } }],
  ])('%s is refused, and nothing changes', async (_, hinges) => {
    const before = await ours();
    expect(await errorOf(await changeDesigner({ hinges }))).toEqual([400, 'invalid_hinges']);
    expect(await ours()).toEqual(before);
  });

  test('staff changing a shower may choose any hinge, starting from the company standard', async () => {
    const job = await firstJob();
    const { designs } = await json<{ designs: { id: string }[] }>(await api(`/jobs/${job}`, { cookie: staff }));
    const editor = await json<{ config: { hinges: Hinges } }>(await api(`/jobs/${job}/designs/${designs[0].id}/editor`, { cookie: staff }));
    expect(editor.config.hinges.wall.offered).toHaveLength(9);
    expect(editor.config.hinges.wall.standard).toBe('full');
    expect(editor.config.hinges.inLine.offered).toEqual(['standard', 'adjustable', 'positive-close']);
  });
});
