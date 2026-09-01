import { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { Wallet, Droplets, Truck, Receipt, TrendingUp, Sparkles } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { money, litres, num, dateTime, utilisationTone } from '../../lib/utils';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  StatCard, Badge, PageLoader, Alert, ProgressBar, Table, Th, Td, EmptyState,
} from '../../components/ui';

export default function ManagerDashboard() {
  const [data, setData] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/manager')
      .then(({ data }) => {
        setData(data);
        // Chain the forecast: we only know the client_id after the dashboard loads.
        return api.get(`/clients/${data.client.client_id}/forecast`, { params: { periods: 14 } });
      })
      .then((res) => res && setForecast(res.data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <div className="p-6"><Alert tone="red" title="Could not load your fleet">{error}</Alert></div>;
  if (!data) return <PageLoader label="Loading your fleet…" />;

  const { client, summary, by_vehicle, monthly, recent_transactions } = data;
  const tone = utilisationTone(Number(client.utilisation_pct));

  const monthlyData = monthly.map((m) => ({
    month: m.month.split(' ')[0],
    spend: Number(m.spend),
    liters: Number(m.liters),
  }));

  // Stitch history and prediction into one continuous series for the chart.
  // The final historical point carries BOTH keys, so the dashed prediction
  // line starts exactly where the solid actual line ends instead of floating
  // detached from it.
  const forecastData = (() => {
    if (!forecast?.forecast?.length) return [];

    const past = forecast.history.slice(-21).map((h) => ({
      date: new Date(h.day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      actual: Number(h.liters),
    }));

    if (past.length) past[past.length - 1].predicted = past[past.length - 1].actual;

    const future = forecast.forecast.map((f) => ({
      date: new Date(f.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      predicted: f.predicted,
    }));

    return [...past, ...future];
  })();

  return (
    <div>
      <PageHeader
        title={client.company_name}
        description="Your fleet's fuel consumption, credit position and monthly billing."
        actions={<Badge tone={tone.label === 'Healthy' ? 'green' : tone.label === 'Critical' ? 'red' : 'amber'}>
          Credit {tone.label.toLowerCase()}
        </Badge>}
      />

      <div className="space-y-5 p-6">
        {/* ------------------------------- KPIs ----------------------------- */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Wallet} tone="amber" label="Outstanding balance"
                    value={money(client.current_balance)}
                    sub={`${money(client.available_credit)} still available`} />
          <StatCard icon={Receipt} tone="brand" label="Spend, last 30 days"
                    value={money(summary.spend_30d)}
                    sub={`${num(summary.txns_30d)} fills`} />
          <StatCard icon={Droplets} tone="green" label="Fuel, last 30 days"
                    value={litres(summary.liters_30d)}
                    sub="across the whole fleet" />
          <StatCard icon={Truck} tone="violet" label="Vehicles"
                    value={num(summary.vehicles)} sub="active on credit" />
        </div>

        {/* -------------------------- Credit position ----------------------- */}
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">Credit utilisation</p>
              <p className="text-sm text-slate-500 tnum">
                {money(client.current_balance)} of {money(client.credit_limit)}
              </p>
            </div>
            <div className="mt-2.5 flex items-center gap-3">
              <ProgressBar value={Number(client.utilisation_pct)} tone={tone.bar} className="h-2.5" />
              <span className={`shrink-0 text-sm font-semibold tnum ${tone.text}`}>
                {client.utilisation_pct}%
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* -------------------------- Monthly spend ---------------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Monthly fuel spend</CardTitle>
                <CardDescription>Last six months</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }}
                           axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                           tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(v) => [money(v), 'Spend']}
                    />
                    <Bar dataKey="spend" fill="#1d66f1" radius={[5, 5, 0, 0]} maxBarSize={44} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* --------------------------- ARIMA forecast -------------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4 text-violet-500" />
                  Consumption forecast
                </CardTitle>
                <CardDescription>
                  {forecast?.model
                    ? `${forecast.model} · next ${forecast.periods} days`
                    : 'Predicting your next fortnight of demand'}
                </CardDescription>
              </div>
              {forecast?.total_predicted != null && (
                <Badge tone="violet">{litres(forecast.total_predicted)} expected</Badge>
              )}
            </CardHeader>
            <CardContent>
              {forecastData.length === 0 ? (
                <EmptyState icon={TrendingUp} title="Not enough history yet"
                            hint="A few more weeks of fuelling and the model can project demand." />
              ) : (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecastData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }}
                             axisLine={false} tickLine={false} interval={4} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                        formatter={(v, n) => [litres(v), n === 'actual' ? 'Actual' : 'Predicted']}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="actual" name="Actual" stroke="#64748b"
                            strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#8b5cf6"
                            strokeWidth={2} strokeDasharray="5 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ------------------------ Consumption by vehicle ------------------ */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Consumption by vehicle</CardTitle>
              <CardDescription>Lifetime totals, highest spend first</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Vehicle</Th>
                  <Th>Fuel</Th>
                  <Th className="text-right">Tank</Th>
                  <Th className="text-right">Fills</Th>
                  <Th className="text-right">Volume</Th>
                  <Th className="text-right">Spend</Th>
                </tr>
              </thead>
              <tbody>
                {by_vehicle.map((v) => (
                  <tr key={v.vehicle_id} className="transition-colors hover:bg-slate-50">
                    <Td className="font-mono font-medium text-slate-900">{v.license_plate}</Td>
                    <Td><Badge tone={v.fuel === 'diesel' ? 'amber' : v.fuel === 'cng' ? 'green' : 'brand'}>
                      {v.fuel}
                    </Badge></Td>
                    <Td className="text-right tnum text-slate-500">{v.tank_capacity} L</Td>
                    <Td className="text-right tnum">{num(v.fills)}</Td>
                    <Td className="text-right tnum">{litres(v.liters)}</Td>
                    <Td className="text-right font-semibold tnum text-slate-900">{money(v.spend)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>

        {/* --------------------------- Recent activity ---------------------- */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent fuelling</CardTitle>
              <CardDescription>Last 20 transactions on your fleet</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Vehicle</Th>
                  <Th className="text-right">Volume</Th>
                  <Th className="text-right">Cost</Th>
                  <Th>Attendant</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {recent_transactions.map((t) => (
                  <tr key={t.txn_id} className="transition-colors hover:bg-slate-50">
                    <Td className="whitespace-nowrap text-slate-500">{dateTime(t.txn_timestamp)}</Td>
                    <Td className="font-mono font-medium text-slate-900">{t.license_plate}</Td>
                    <Td className="text-right tnum">{litres(t.volume_liters)}</Td>
                    <Td className="text-right tnum font-medium">{money(t.total_cost)}</Td>
                    <Td className="text-slate-500">{t.attendant_name || '—'}</Td>
                    <Td>{t.is_flagged && <Badge tone="red">flagged</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
