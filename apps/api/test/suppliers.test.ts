/**
 * A company can have several suppliers of glass and of hardware, import a
 * price list, set a markup, and have a new quote start from those costs.
 * A change to a list afterwards does not change a quote already written.
 */
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, test } from 'vitest';
import { addMember } from '../src/db/auth';
import { api, company, enquire, json, post, signIn, type Company } from './helpers';

interface Line {
  key: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPricePence: number;
  costPence?: number;
  supplierId?: string;
  priceListId?: string;
}
interface SupplierBody {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
  active: boolean;
  lists: { id: string; name: string; status: string; itemCount: number }[];
}
interface ItemBody {
  id: string;
  key: string | null;
  sku: string | null;
  description: string;
  unit: string;
  costPence: number;
  sellPence: number | null;
}

let shop: Company;
let owner: string;
let staff: string;
let rival: string;
let jobId = '';

const errorOf = async (response: Response) => {
  const body = (await response.json()) as { error?: string };
  return [response.status, body.error] as const;
};

beforeAll(async () => {
  shop = await company('Supplier Showers', 'SU');
  const other = await company('Other Suppliers', 'OS');
  await addMember(env, shop.id, 'owner@su.example', 'owner');
  await addMember(env, shop.id, 'staff@su.example', 'staff');
  await addMember(env, other.id, 'owner@os.example', 'owner');
  owner = await signIn('owner@su.example');
  staff = await signIn('staff@su.example');
  rival = await signIn('owner@os.example');
  await enquire(shop, 'Sam Customer', 'sam@example.test', 'SU1 1AA');
  const { jobs } = await json<{ jobs: { id: string }[] }>(await api('/jobs', { cookie: owner }));
  jobId = jobs[0].id;
});

describe('suppliers and markups', () => {
  let glassId = '';
  let hardwareId = '';
  let listId = '';
  let itemId = '';

  test('GET /settings includes the default 100% markup', async () => {
    const body = await json<{ pricing: { markupBp: number; categoryMarkupBp: Record<string, number> } }>(await api('/settings', { cookie: staff }));
    expect(body.pricing).toEqual({ markupBp: 10_000, categoryMarkupBp: {} });
  });

  test('an owner adds a glass supplier and a hardware supplier, and the first of each kind is the default', async () => {
    const glass = await post('/settings/suppliers', { name: 'ESG Group Ltd', kind: 'glass' }, { cookie: owner });
    expect(glass.status).toBe(201);
    const created = (await json<{ supplier: SupplierBody }>(glass)).supplier;
    glassId = created.id;
    expect(created.isDefault).toBe(true);
    expect(created.kind).toBe('glass');

    const second = await json<{ supplier: SupplierBody }>(await post('/settings/suppliers', { name: 'Another toughener', kind: 'glass' }, { cookie: owner }));
    expect(second.supplier.isDefault).toBe(false);

    const hardware = await json<{ supplier: SupplierBody }>(
      await post('/settings/suppliers', { name: 'C.R. Laurence', kind: 'hardware' }, { cookie: owner })
    );
    hardwareId = hardware.supplier.id;
    expect(hardware.supplier.isDefault).toBe(true);

    const listed = await json<{ suppliers: SupplierBody[] }>(await api('/settings/suppliers', { cookie: staff }));
    expect(listed.suppliers.map((s) => s.name)).toEqual(['ESG Group Ltd', 'Another toughener', 'C.R. Laurence']);
    expect(listed.suppliers.filter((s) => s.isDefault && s.kind === 'glass')).toHaveLength(1);
  });

  test('staff may see suppliers but cannot add one, and another company cannot see them', async () => {
    expect(await errorOf(await post('/settings/suppliers', { name: 'Nope', kind: 'glass' }, { cookie: staff }))).toEqual([403, 'owners_only']);
    const theirs = await json<{ suppliers: SupplierBody[] }>(await api('/settings/suppliers', { cookie: rival }));
    expect(theirs.suppliers.some((s) => s.id === glassId)).toBe(false);
    expect((await api(`/settings/suppliers/${glassId}/lists`, { cookie: rival, method: 'POST', body: JSON.stringify({ name: 'Taken' }) })).status).toBe(404);
  });

  test('an owner adds a list, imports a CSV, and making it active supersedes the previous active list', async () => {
    const made = await post(`/settings/suppliers/${glassId}/lists`, { name: 'Brennan Glass 03.03.2026', status: 'active' }, { cookie: owner });
    expect(made.status).toBe(201);
    listId = (await json<{ list: { id: string } }>(made)).list.id;

    const csv =
      'key,sku,description,unit,cost,min_area_m2\n' +
      'glass:10:clear,ESG-10,10mm Clear Toughened,m2,50.00,0.30\n' +
      'polish:edge,ESG-POLISH,Polishing,m,3.21,\n' +
      'cutout:hole,ESG-HOLE,Holes,each,2.50,\n' +
      ',CRL-BLANK,A CRL part not yet matched,each,12.00,\n';
    const imported = await post(`/settings/suppliers/${glassId}/lists/${listId}/import`, { csv }, { cookie: owner });
    expect(imported.status).toBe(200);
    const body = await json<{ imported: number; list: { items: ItemBody[] } }>(imported);
    expect(body.imported).toBe(4);
    const glass = body.list.items.find((i) => i.key === 'glass:10:clear');
    expect(glass).toMatchObject({ costPence: 5000, sku: 'ESG-10', unit: 'm2' });
    itemId = glass!.id;
    expect(body.list.items.some((i) => i.key === null && i.sku === 'CRL-BLANK')).toBe(true);

    const next = await json<{ list: { id: string; status: string } }>(
      await post(`/settings/suppliers/${glassId}/lists`, { name: 'A later list', status: 'active' }, { cookie: owner })
    );
    expect(next.list.status).toBe('active');
    const previous = await json<{ list: { status: string } }>(await api(`/settings/suppliers/${glassId}/lists/${listId}`, { cookie: owner }));
    expect(previous.list.status).toBe('superseded');
    // Put the priced list back as the active one, so the quote tests use it.
    const restored = await api(`/settings/suppliers/${glassId}/lists/${listId}`, {
      cookie: owner,
      method: 'PATCH',
      body: JSON.stringify({ status: 'active' }),
    });
    expect(restored.status).toBe(200);
    const after = await json<{ list: { status: string } }>(await api(`/settings/suppliers/${glassId}/lists/${next.list.id}`, { cookie: owner }));
    expect(after.list.status).toBe('superseded');
  });

  test('an owner can change the markup, and a category can be different', async () => {
    const saved = await api('/settings/pricing', {
      cookie: owner,
      method: 'PATCH',
      body: JSON.stringify({ markupBp: 10_000, categoryMarkupBp: { process: 0 } }),
    });
    expect(saved.status).toBe(200);
    const body = await json<{ pricing: { markupBp: number; categoryMarkupBp: { process: number } } }>(saved);
    expect(body.pricing).toEqual({ markupBp: 10_000, categoryMarkupBp: { process: 0 } });
    expect(await errorOf(await api('/settings/pricing', { cookie: staff, method: 'PATCH', body: JSON.stringify({ markupBp: 0 }) }))).toEqual([
      403,
      'owners_only',
    ]);
  });

  test('a new quote is costed from the default glass supplier’s active list, at cost plus markup', async () => {
    const made = await post(`/jobs/${jobId}/quotes`, {}, { cookie: owner });
    expect(made.status).toBe(201);
    const { id } = await json<{ id: string }>(made);
    const { quote } = await json<{ quote: { glass_supplier_id: string | null; hardware_supplier_id: string | null; lines: Line[] } }>(
      await api(`/jobs/${jobId}/quotes/${id}`, { cookie: owner })
    );
    expect(quote.glass_supplier_id).toBe(glassId);
    expect(quote.hardware_supplier_id).toBe(hardwareId);
    const glass = quote.lines.find((l) => l.key === 'glass:10:clear');
    expect(glass).toMatchObject({ unitPricePence: 10_000, costPence: 5000, supplierId: glassId, priceListId: listId });
    const polish = quote.lines.find((l) => l.key === 'polish:edge');
    expect(polish).toMatchObject({ unit: 'm', unitPricePence: 321, costPence: 321, supplierId: glassId });
    const hole = quote.lines.find((l) => l.key === 'cutout:hole');
    expect(hole?.unitPricePence).toBe(250);
    expect(hole?.costPence).toBe(250);
    // Hardware is still the remembered price book (empty), because CRL has no prices.
    expect(quote.lines.find((l) => l.key?.startsWith('hinge:'))?.unitPricePence).toBe(0);
    expect(quote.lines.find((l) => l.key?.startsWith('hinge:'))?.costPence).toBeUndefined();

    // Changing the list afterwards does not change the quote already written.
    const changed = await api(`/settings/suppliers/${glassId}/lists/${listId}/items/${itemId}`, {
      cookie: owner,
      method: 'PATCH',
      body: JSON.stringify({ costPence: 9000 }),
    });
    expect(changed.status).toBe(200);
    const again = await json<{ quote: { lines: Line[] } }>(await api(`/jobs/${jobId}/quotes/${id}`, { cookie: owner }));
    expect(again.quote.lines.find((l) => l.key === 'glass:10:clear')).toMatchObject({ unitPricePence: 10_000, costPence: 5000 });
  });

  test('a job can be pointed at one of the company’s glass suppliers, and not at another company’s', async () => {
    const ok = await api(`/jobs/${jobId}/suppliers`, {
      cookie: owner,
      method: 'PATCH',
      body: JSON.stringify({ glassSupplierId: glassId, hardwareSupplierId: hardwareId }),
    });
    expect(ok.status).toBe(200);
    const foreign = await post('/settings/suppliers', { name: 'Foreign glass', kind: 'glass' }, { cookie: rival });
    const foreignId = (await json<{ supplier: { id: string } }>(foreign)).supplier.id;
    expect(
      await errorOf(
        await api(`/jobs/${jobId}/suppliers`, {
          cookie: owner,
          method: 'PATCH',
          body: JSON.stringify({ glassSupplierId: foreignId }),
        })
      )
    ).toEqual([400, 'invalid_request']);
  });

  test('an owner cannot remove a supplier that still has a list or is used on a quote', async () => {
    expect(await errorOf(await api(`/settings/suppliers/${glassId}`, { cookie: owner, method: 'DELETE' }))).toEqual([409, 'in_use']);
  });
});
