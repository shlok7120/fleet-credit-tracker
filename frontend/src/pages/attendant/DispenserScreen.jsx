import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Fuel, CircleCheck, TriangleAlert, Gauge, Building2,
  Droplets, IndianRupee, X, Ban,
} from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { money, moneyExact, litres, num, dateTime } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Button, Input, Label, Badge, PageLoader, Alert, EmptyState, StatCard,
} from '../../components/ui';

const DEFAULT_PRICE = { diesel: 92.3, petrol: 104.5, cng: 76.0 };

/** Preset quantities so the common cases are one tap, not eight keystrokes. */
const QUICK_LITRES = [20, 40, 50, 100, 200];

export default function DispenserScreen() {
  const { user } = useAuth();

  const [vehicles, setVehicles] = useState(null);
  const [shift, setShift] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [volume, setVolume] = useState('');
  const [price, setPrice] = useState('');
  const [odometer, setOdometer] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const searchRef = useRef(null);
  const volumeRef = useRef(null);

  const loadShift = () =>
    api.get('/dashboard/attendant').then(({ data }) => setShift(data)).catch(() => {});

  useEffect(() => {
    api.get('/vehicles/lookup')
      .then(({ data }) => setVehicles(data))
      .catch((e) => setError(errorMessage(e)));
    loadShift();
  }, []);

  const matches = useMemo(() => {
    if (!vehicles) return [];
    const q = search.trim().toUpperCase().replace(/\s+/g, '');
    if (!q) return vehicles.slice(0, 8);
    return vehicles
      .filter((v) =>
        v.license_plate.includes(q) ||
        v.company_name.toUpperCase().includes(search.trim().toUpperCase()))
      .slice(0, 8);
  }, [vehicles, search]);

  const choose = (v) => {
    setSelected(v);
    setSearch('');
    setPrice(String(DEFAULT_PRICE[v.fuel] ?? 100));
    setResult(null);
    setError('');
    setTimeout(() => volumeRef.current?.focus(), 50);
  };

  const reset = () => {
    setSelected(null); setVolume(''); setPrice(''); setOdometer('');
    setResult(null); setError('');
    setTimeout(() => searchRef.current?.focus(), 50);
  };

  const total = Number(volume || 0) * Number(price || 0);
  const overLimit = selected && total > Number(selected.available_credit);
  const overTank = selected && Number(volume) > Number(selected.tank_capacity);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      const { data } = await api.post('/transactions', {
        vehicle_id: selected.vehicle_id,
        volume_liters: Number(volume),
        price_per_liter: Number(price),
        odometer_km: odometer ? Number(odometer) : null,
      });
      setResult(data);
      setVolume(''); setOdometer('');
      loadShift();
      // Refresh the credit figure shown on the selected vehicle card.
      setSelected((s) => ({ ...s, available_credit: data.credit_remaining }));
    } catch (err) {
      const d = err?.response?.data;
      setError(d?.detail || d?.error || errorMessage(err));
    }
    setBusy(false);
  };

  if (!vehicles) return <PageLoader label="Loading dispenser…" />;

  return (
    <div>
      <PageHeader
        title="Dispenser"
        description={`Signed in as ${user.full_name}. Log each fill as it happens.`}
      />

      <div className="p-6">
        {/* --------------------------- Shift totals -------------------------- */}
        {shift && (
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <StatCard icon={Gauge} tone="brand" label="Fills logged today"
                      value={num(shift.today.txns_today)} />
            <StatCard icon={Droplets} tone="green" label="Volume dispensed"
                      value={litres(shift.today.liters_today)} />
            <StatCard icon={IndianRupee} tone="amber" label="Value on credit"
                      value={money(shift.today.value_today)} />
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-5">
          {/* ------------------------- Entry panel ------------------------- */}
          <div className="lg:col-span-3 space-y-4">
            {!selected ? (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Step 1 — Find the vehicle</CardTitle>
                    <CardDescription>Type a licence plate or company name</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                    <Input
                      ref={searchRef}
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="MH12AB1234"
                      className="h-14 pl-11 font-mono text-lg uppercase tracking-wide"
                    />
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {matches.length === 0 ? (
                      <EmptyState icon={Search} title="No vehicle matches that"
                                  hint="Check the plate, or ask the admin to register the vehicle." />
                    ) : (
                      matches.map((v) => (
                        <button
                          key={v.vehicle_id}
                          onClick={() => choose(v)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-base font-semibold text-slate-900">
                              {v.license_plate}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {v.company_name} · {v.make_model || v.fuel}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Badge tone={v.fuel === 'diesel' ? 'amber' : v.fuel === 'cng' ? 'green' : 'brand'}>
                              {v.fuel}
                            </Badge>
                            <p className="mt-1 text-[11px] text-slate-400 tnum">
                              {money(v.available_credit)} left
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Selected vehicle summary */}
                <Card className="border-brand-200 bg-brand-50/40">
                  <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-11 place-items-center rounded-lg bg-brand-600 text-white">
                        <Fuel className="size-5" />
                      </div>
                      <div>
                        <p className="font-mono text-lg font-semibold leading-tight text-slate-900">
                          {selected.license_plate}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Building2 className="size-3" />
                          {selected.company_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[11px] text-slate-500">Credit available</p>
                        <p className="font-semibold tnum text-slate-900">
                          {money(selected.available_credit)}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={reset}>
                        <X className="size-4" /> Change
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Fill entry */}
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Step 2 — Enter the fill</CardTitle>
                      <CardDescription>
                        Tank capacity {selected.tank_capacity} L · {selected.fuel}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={submit} className="space-y-4">
                      <div>
                        <Label>Volume dispensed (litres)</Label>
                        <Input
                          ref={volumeRef}
                          type="number" step="0.01" min="0.01" required
                          value={volume}
                          onChange={(e) => setVolume(e.target.value)}
                          placeholder="0.00"
                          className="h-16 text-3xl font-semibold tnum"
                          error={overTank}
                        />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {QUICK_LITRES.map((q) => (
                            <button
                              key={q} type="button"
                              onClick={() => setVolume(String(q))}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                            >
                              {q} L
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setVolume(String(selected.tank_capacity))}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                          >
                            Full tank
                          </button>
                        </div>
                        {overTank && (
                          <p className="mt-1.5 text-xs text-rose-600">
                            That is more than the {selected.tank_capacity} L tank holds — this will be flagged.
                          </p>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <Label>Price per litre (₹)</Label>
                          <Input type="number" step="0.01" min="0.01" required
                                 value={price} onChange={(e) => setPrice(e.target.value)}
                                 className="tnum" />
                        </div>
                        <div>
                          <Label>Odometer (km) <span className="font-normal text-slate-400">optional</span></Label>
                          <Input type="number" min="0" value={odometer}
                                 onChange={(e) => setOdometer(e.target.value)}
                                 placeholder="184320" className="tnum" />
                        </div>
                      </div>

                      {/* Live total */}
                      <div className={`rounded-xl border p-4 ${
                        overLimit ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-baseline justify-between">
                          <span className="text-sm font-medium text-slate-600">Total to charge</span>
                          <span className={`text-3xl font-semibold tnum ${
                            overLimit ? 'text-rose-600' : 'text-slate-900'}`}>
                            {moneyExact(total)}
                          </span>
                        </div>
                        {overLimit && (
                          <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-700">
                            <Ban className="mt-0.5 size-3.5 shrink-0" />
                            Exceeds the {money(selected.available_credit)} of credit
                            {' '}{selected.company_name} has left. The server will reject this.
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button type="button" variant="secondary" size="lg" onClick={reset}>
                          Cancel
                        </Button>
                        <Button
                          type="submit" size="lg" className="flex-1"
                          loading={busy}
                          disabled={!volume || Number(volume) <= 0 || overLimit}
                        >
                          <CircleCheck className="size-5" />
                          {busy ? 'Recording…' : 'Record fill'}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </>
            )}

            {error && <Alert tone="red" title="Transaction rejected">{error}</Alert>}

            {/* --------------------------- Receipt --------------------------- */}
            {result && (
              <Card className={result.ml.is_flagged ? 'border-amber-300' : 'border-emerald-300'}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className={`grid size-10 shrink-0 place-items-center rounded-lg ${
                      result.ml.is_flagged ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                      {result.ml.is_flagged
                        ? <TriangleAlert className="size-5" />
                        : <CircleCheck className="size-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">
                        Recorded — {litres(result.transaction.volume_liters)} to {result.vehicle.license_plate}
                      </p>
                      <p className="text-sm text-slate-500">
                        {moneyExact(result.transaction.total_cost)} billed to {result.vehicle.company_name}.
                        {' '}{money(result.credit_remaining)} credit remaining.
                      </p>

                      {result.ml.is_flagged ? (
                        <Alert tone="amber" className="mt-3">
                          <p className="font-semibold">Flagged for review</p>
                          <p className="mt-0.5">{result.ml.reason}</p>
                          <p className="mt-1.5 text-[11px] opacity-80">
                            The fill was still recorded. The pump admin will review it.
                          </p>
                        </Alert>
                      ) : (
                        <Badge tone="green" className="mt-2">
                          <CircleCheck className="size-3" /> Passed fraud checks
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* -------------------------- Recent fills ------------------------ */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Your recent fills</CardTitle>
                  <CardDescription>Logged by you, newest first</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!shift?.recent?.length ? (
                  <EmptyState icon={Fuel} title="Nothing logged yet"
                              hint="Your fills will appear here as you record them." />
                ) : (
                  <div className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto scroll-thin">
                    {shift.recent.map((t) => (
                      <div key={t.txn_id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-medium text-slate-900">
                            {t.license_plate}
                          </p>
                          <p className="truncate text-xs text-slate-400">{t.company_name}</p>
                          <p className="text-[11px] text-slate-400">{dateTime(t.txn_timestamp)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tnum text-slate-900">
                            {money(t.total_cost)}
                          </p>
                          <p className="text-xs tnum text-slate-400">{litres(t.volume_liters)}</p>
                          {t.is_flagged && <Badge tone="red" className="mt-0.5">flagged</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
