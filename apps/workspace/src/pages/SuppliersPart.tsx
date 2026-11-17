/**
 * The company's suppliers and the markup a new quote uses to turn a cost
 * into a selling price. The remembered prices in the price book are still
 * the fallback when a list has no row for a line.
 */

import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  MARKUP_CATEGORIES,
  type MarkupCategory,
  type PriceListStatus,
  type PricingSettings,
  type Supplier,
  type SupplierKind,
  type SupplierPriceItem,
  type SupplierPriceList,
} from '../lib/api';
import { Section } from './parts';

const KIND_LABEL: Record<SupplierKind, string> = { glass: 'Glass', hardware: 'Hardware', other: 'Other' };
const CATEGORY_LABEL: Record<MarkupCategory, string> = {
  glass: 'Glass',
  coating: 'Coatings',
  process: 'Cutting and polishing',
  hardware: 'Hardware',
  job: 'Fitting and delivery',
};
const UNIT_LABEL: Record<string, string> = { m2: 'm²', m: 'm', each: 'each', set: 'a set', job: 'a job' };

const money = (pence: number) => `£${(pence / 100).toFixed(2)}`;
const asPercent = (bp: number) => (bp / 100).toString();
const parsePercent = (text: string): number | null | typeof NaN => {
  const typed = text.trim().replace(/%/g, '');
  if (typed === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(typed)) return NaN;
  const bp = Math.round(Number(typed) * 100);
  return bp >= 0 && bp <= 100_000 ? bp : NaN;
};

export function SuppliersPart({
  pricing: pricingFromSettings,
  owner,
  justSaved,
  onSaved,
  onReload,
}: {
  pricing?: PricingSettings;
  owner: boolean;
  justSaved: boolean;
  onSaved: () => void;
  onReload: () => void;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [pricing, setPricing] = useState<PricingSettings | undefined>(pricingFromSettings);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setError(null);
    void api
      .suppliers()
      .then((data) => {
        setSuppliers(data.suppliers);
        setPricing(data.pricing);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'The suppliers could not be loaded.'));
  };
  useEffect(load, []);

  return (
    <>
      <MarkupSection pricing={pricing} owner={owner} justSaved={justSaved} onSaved={onSaved} onReload={onReload} onPricing={setPricing} />
      <Section title="Suppliers">
        <p className="text-sm text-quiet">
          A company can have more than one supplier of glass, and more than one of hardware. A new quote takes its costs
          from the active list of the supplier chosen for the job, or the default of that kind, and sells at cost plus
          the markup above. Remembered prices in the price book are used when a list has no row for a line. Switching a
          list or a cost later does not change a quote already written.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}{' '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={load}>
              Try again
            </button>
          </p>
        )}
        {suppliers && (
          <div className="mt-4 space-y-6">
            {(['glass', 'hardware', 'other'] as const).map((kind) => {
              const ofKind = suppliers.filter((s) => s.kind === kind);
              if (kind === 'other' && ofKind.length === 0 && !owner) return null;
              return (
                <div key={kind}>
                  <h3 className="text-sm font-bold">{KIND_LABEL[kind]}</h3>
                  {ofKind.length === 0 ? (
                    <p className="mt-1 text-sm text-quiet">None yet.</p>
                  ) : (
                    <div className="mt-2 space-y-3">
                      {ofKind.map((supplier) => (
                        <SupplierCard key={supplier.id} supplier={supplier} owner={owner} onChanged={load} />
                      ))}
                    </div>
                  )}
                  {owner && <AddSupplierForm kind={kind} onAdded={load} />}
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

function MarkupSection({
  pricing,
  owner,
  justSaved,
  onSaved,
  onReload,
  onPricing,
}: {
  pricing?: PricingSettings;
  owner: boolean;
  justSaved: boolean;
  onSaved: () => void;
  onReload: () => void;
  onPricing: (pricing: PricingSettings) => void;
}) {
  const current = pricing ?? { markupBp: 10_000, categoryMarkupBp: {} };
  const [markup, setMarkup] = useState(asPercent(current.markupBp));
  const [categories, setCategories] = useState<Record<string, string>>(() =>
    Object.fromEntries(MARKUP_CATEGORIES.map((c) => [c, current.categoryMarkupBp[c] === undefined ? '' : asPercent(current.categoryMarkupBp[c]!)]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(justSaved);
  useEffect(() => {
    setMarkup(asPercent(current.markupBp));
    setCategories(Object.fromEntries(MARKUP_CATEGORIES.map((c) => [c, current.categoryMarkupBp[c] === undefined ? '' : asPercent(current.categoryMarkupBp[c]!)])));
  }, [pricing]);
  const typed = parsePercent(markup);
  const typedCats = Object.fromEntries(MARKUP_CATEGORIES.map((c) => [c, parsePercent(categories[c] ?? '')]));
  const valid = typed !== null && !Number.isNaN(typed) && MARKUP_CATEGORIES.every((c) => !Number.isNaN(typedCats[c]));
  const dirty =
    typed !== current.markupBp ||
    MARKUP_CATEGORIES.some((c) => (typedCats[c] ?? undefined) !== current.categoryMarkupBp[c]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || typed === null || Number.isNaN(typed)) return;
    setBusy(true);
    setError(null);
    const categoryMarkupBp = Object.fromEntries(
      MARKUP_CATEGORIES.flatMap((c) => {
        const value = typedCats[c];
        return typeof value === 'number' && !Number.isNaN(value) ? [[c, value]] : [];
      })
    );
    void api
      .savePricing({ markupBp: typed, categoryMarkupBp })
      .then((res) => {
        onPricing(res.pricing);
        setSaved(true);
        onSaved();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'The markup could not be saved. Please try again.'))
      .finally(() => setBusy(false));
  };
  return (
    <Section title="Markup">
      <p className="text-sm text-quiet">
        A new quote sells at the supplier’s cost plus this markup, unless a line has a selling price of its own. 100%
        means the selling price is twice the cost. Leave a kind blank to use the usual markup.
      </p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Usual markup</span>
          <PercentField value={markup} invalid={Number.isNaN(typed) || typed === null} onChange={setMarkup} disabled={!owner} label="Usual markup" />
        </label>
        {MARKUP_CATEGORIES.map((category) => (
          <label key={category} className="flex items-center justify-between gap-4 text-sm">
            <span>{CATEGORY_LABEL[category]}</span>
            <PercentField
              value={categories[category] ?? ''}
              invalid={Number.isNaN(typedCats[category])}
              onChange={(value) => setCategories((now) => ({ ...now, [category]: value }))}
              disabled={!owner}
              label={`${CATEGORY_LABEL[category]} markup`}
              optional
            />
          </label>
        ))}
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}{' '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={onReload}>
              Show the saved markup
            </button>
          </p>
        )}
        {saved && !dirty && !error && (
          <p role="status" className="text-sm text-good">
            The markup has been saved.
          </p>
        )}
        {owner && (
          <button type="submit" disabled={!dirty || !valid || busy} className="h-10 rounded-md bg-accent px-4 font-semibold text-accent-ink disabled:opacity-50">
            {busy ? 'Saving' : 'Save markup'}
          </button>
        )}
      </form>
    </Section>
  );
}

function PercentField({
  value,
  invalid,
  onChange,
  disabled,
  label,
  optional,
}: {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  disabled: boolean;
  label: string;
  optional?: boolean;
}) {
  return (
    <span className={`flex h-10 w-40 shrink-0 items-center rounded-md border bg-ground px-3 ${invalid ? 'border-bad/60' : 'border-rule'}`}>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        disabled={disabled}
        placeholder={optional ? 'Usual' : undefined}
        className="w-full min-w-0 bg-transparent text-base tabular-nums outline-none disabled:text-quiet"
      />
      <span className="pl-1 text-xs text-quiet">%</span>
    </span>
  );
}

function SupplierCard({ supplier, owner, onChanged }: { supplier: Supplier; owner: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = (work: () => Promise<unknown>, otherwise: string) => {
    setError(null);
    void work()
      .then(onChanged)
      .catch((err) => setError(err instanceof ApiError ? err.message : otherwise));
  };
  return (
    <div className="rounded-lg border border-rule p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-semibold">{supplier.name}</p>
          <p className="text-xs text-quiet">
            {supplier.isDefault ? 'Default' : 'Not the default'}
            {supplier.active ? '' : ' · switched off'}
            {supplier.lists.some((l) => l.status === 'active') ? ' · has an active list' : ' · no active list'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide lists' : 'Price lists'}
          </button>
          {owner && !supplier.isDefault && supplier.active && (
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => act(() => api.saveSupplier(supplier.id, { isDefault: true }), 'That could not be made the default.')}>
              Make default
            </button>
          )}
          {owner && (
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => act(() => api.saveSupplier(supplier.id, { active: !supplier.active }), 'That could not be changed.')}
            >
              {supplier.active ? 'Switch off' : 'Switch on'}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      {open && (
        <div className="mt-3 space-y-3 border-t border-rule pt-3">
          {supplier.lists.map((list) => (
            <ListCard key={list.id} supplier={supplier} list={list} owner={owner} onChanged={onChanged} />
          ))}
          {owner && <AddListForm supplier={supplier} onAdded={onChanged} />}
        </div>
      )}
    </div>
  );
}

function ListCard({
  supplier,
  list,
  owner,
  onChanged,
}: {
  supplier: Supplier;
  list: SupplierPriceList;
  owner: boolean;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<SupplierPriceItem[] | null>(list.items ?? null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setError(null);
    void api
      .priceList(supplier.id, list.id)
      .then((data) => setItems(data.list.items ?? []))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'The list could not be loaded.'));
  };
  useEffect(() => {
    if (open && items === null) load();
  }, [open]);
  const act = (work: () => Promise<unknown>, otherwise: string) => {
    setError(null);
    void work()
      .then(onChanged)
      .catch((err) => setError(err instanceof ApiError ? err.message : otherwise));
  };
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <div>
          <span className="font-semibold">{list.name}</span>
          <span className="pl-2 text-xs text-quiet">
            {list.status}
            {list.effectiveFrom ? ` from ${list.effectiveFrom}` : ''}
            {` · ${list.itemCount} ${list.itemCount === 1 ? 'item' : 'items'}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide items' : 'Items'}
          </button>
          {owner && list.status !== 'active' && (
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => act(() => api.savePriceList(supplier.id, list.id, { status: 'active' }), 'The list could not be made active.')}>
              Make active
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
      {open && items && (
        <div className="mt-2 overflow-x-auto text-sm">
          <table className="w-full text-left">
            <thead>
              <tr className="text-xs text-quiet">
                <th className="py-1 pr-3 font-normal">Item</th>
                <th className="py-1 pr-3 font-normal">Key or SKU</th>
                <th className="py-1 pr-3 font-normal">Cost</th>
                <th className="py-1 font-normal">Sell</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-1 pr-3">{item.description}</td>
                  <td className="py-1 pr-3 tabular-nums text-quiet">{item.key ?? item.sku ?? '—'}</td>
                  <td className="py-1 pr-3 tabular-nums">
                    {money(item.costPence)} / {UNIT_LABEL[item.unit] ?? item.unit}
                  </td>
                  <td className="py-1 tabular-nums">{item.sellPence === null ? 'Markup' : money(item.sellPence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {owner && <ImportForm supplierId={supplier.id} listId={list.id} onImported={onChanged} />}
        </div>
      )}
    </div>
  );
}

function AddSupplierForm({ kind, onAdded }: { kind: SupplierKind; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    void api
      .addSupplier({ name: name.trim(), kind })
      .then(() => {
        setName('');
        onAdded();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'The supplier could not be added.'))
      .finally(() => setBusy(false));
  };
  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={`${KIND_LABEL[kind]} supplier`}
        aria-label={`Name of a new ${KIND_LABEL[kind].toLowerCase()} supplier`}
        className="h-10 min-w-[12rem] flex-1 rounded-md border border-rule bg-ground px-3 outline-none"
      />
      <button type="submit" disabled={!name.trim() || busy} className="h-10 rounded-md border border-rule px-3 font-semibold disabled:opacity-50">
        {busy ? 'Adding' : 'Add supplier'}
      </button>
      {error && <p className="w-full text-bad">{error}</p>}
    </form>
  );
}

function AddListForm({ supplier, onAdded }: { supplier: Supplier; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<PriceListStatus>('draft');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    void api
      .addPriceList(supplier.id, { name: name.trim(), status })
      .then(() => {
        setName('');
        setStatus('draft');
        onAdded();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'The list could not be added.'))
      .finally(() => setBusy(false));
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 text-sm">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New price list"
        aria-label="Name of a new price list"
        className="h-10 min-w-[12rem] flex-1 rounded-md border border-rule bg-ground px-3 outline-none"
      />
      <select value={status} onChange={(e) => setStatus(e.target.value as PriceListStatus)} className="h-10 rounded-md border border-rule bg-ground px-2" aria-label="Status of the new list">
        <option value="draft">Draft</option>
        <option value="active">Active</option>
      </select>
      <button type="submit" disabled={!name.trim() || busy} className="h-10 rounded-md border border-rule px-3 font-semibold disabled:opacity-50">
        {busy ? 'Adding' : 'Add list'}
      </button>
      {error && <p className="w-full text-bad">{error}</p>}
    </form>
  );
}

function ImportForm({ supplierId, listId, onImported }: { supplierId: string; listId: string; replace?: boolean; onImported: () => void }) {
  const [csv, setCsv] = useState('');
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!csv.trim()) return;
    setBusy(true);
    setError(null);
    setNote(null);
    void api
      .importPriceList(supplierId, listId, csv, replace)
      .then((res) => {
        setCsv('');
        setNote(`${res.imported} ${res.imported === 1 ? 'item' : 'items'} imported.`);
        onImported();
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'The file could not be imported.'))
      .finally(() => setBusy(false));
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <p className="text-xs text-quiet">
        Import a CSV with columns key, sku, description, unit, and cost (in pounds) or cost_pence. A CRL catalogue can
        use sku and leave the SetOut key empty until it is matched. Tick replace to take the place of the items already
        on this list.
      </p>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={4}
        spellCheck={false}
        aria-label="CSV of price-list items"
        placeholder={'key,sku,description,unit,cost\nglass:10:clear,,10mm clear toughened,m2,50.00'}
        className="w-full rounded-md border border-rule bg-ground p-2 font-mono text-xs outline-none"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace the items already on this list
      </label>
      <button type="submit" disabled={!csv.trim() || busy} className="h-10 rounded-md border border-rule px-3 font-semibold disabled:opacity-50">
        {busy ? 'Importing' : 'Import CSV'}
      </button>
      {note && <p className="text-sm text-good">{note}</p>}
      {error && <p className="text-sm text-bad">{error}</p>}
    </form>
  );
}
