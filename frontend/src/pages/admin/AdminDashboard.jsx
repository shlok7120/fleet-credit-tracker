import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  IndianRupee, Building2, Truck, TriangleAlert, Droplets,
  Receipt, ArrowRight, Cpu, CircleCheck,
} from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { useChartTheme, axisProps } from '../../lib/chartTheme';
import { money, litres, num, dateTime, utilisationTone } from '../../lib/utils';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  StatCard, Badge, PageLoader, Alert, ProgressBar, EmptyState, Button, Spinner,
} from '../../components/ui';

/**
 * The ML service is hosted on a free tier that sleeps after ~15 minutes idle
 * and takes about a minute to wake. The health probe deliberately gives up
 * after 2s so it never delays this dashboard — but that means a sleeping
 * service is indistinguishable from a dead one, and the badge read "offline",
 * which looks broken to anyone being shown the app.
 *
 * The probe itself is what starts the wake-up (Render begins spinning the
 * instance up even though our request times out), so polling a few times
 * turns "offline" into a state that heals itself.
 */
const WAKE_POLL_MS = 8000;
const WAKE_MAX_ATTEMPTS = 9;   // ~72s, comfortably longer than a cold start

export default function AdminDashboard() {
  const chart = useChartTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mlState, setMlState] = useState('unknown'); // unknown | up | waking | down

  useEffect(() => {
    api.get('/dashboard/admin')
      .then(({ data }) => {
        setData(data);
        setMlState(data.ml_service.reachable ? 'up' : 'waking');
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  // Poll until the sleeping ML service answers, then flip the badge.
  useEffect(() => {
    if (mlState !== 'waking') return;

    let cancelled = false;
    let attempts = 0;
    let timer;

    const poll = async () => {
      attempts += 1;
      try {
        const { data: health } = await api.get('/health');
        if (cancelled) return;
        if (health.ml_service === 'up') { setMlState('up'); return; }
      } catch { /* keep trying */ }

      if (cancelled) return;
      if (attempts >= WAKE_MAX_ATTEMPTS) setMlState('down');
      else timer = setTimeout(poll, WAKE_POLL_MS);
    };

    timer = setTimeout(poll, WAKE_POLL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mlState]);

  if (error) return <div><Alert tone="red" title="Could not load the dashboard">{error}</Alert></div>;
  if (!data) return <PageLoader label="Loading pump overview…" />;

  const { kpis, top_clients, fraud_alerts, revenue_trend } = data;
  const exposurePct = kpis.total_credit_extended > 0
    ? (kpis.total_outstanding / kpis.total_credit_extended) * 100 : 0;

  const chartData = revenue_trend.map((d) => ({
    day: new Date(d.day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    revenue: Number(d.revenue),
    liters: Number(d.liters),
  }));

  return (
    <div>
      <PageHeader
        title="Pump overview"
        description="Credit exposure, today's throughput and open fraud alerts."
        actions={
          <Badge tone={mlState === 'up' ? 'green' : mlState === 'waking' ? 'amber' : 'red'}>
            {mlState === 'waking'
              ? <Spinner className="size-3" />
              : <Cpu className="size-3" />}
            {mlState === 'up' && 'ML service online'}
            {mlState === 'waking' && 'ML service waking…'}
            {mlState === 'down' && 'ML service offline'}
            {mlState === 'unknown' && 'ML service'}
          </Badge>
        }
      />

      <div className="space-y-5">
        {/* ------------------------------- KPIs ------------------------------ */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={IndianRupee} tone="amber" label="Total outstanding"
            value={money(kpis.total_outstanding)}
            sub={`${exposurePct.toFixed(0)}% of ${money(kpis.total_credit_extended)} extended`}
          />
          <StatCard
            icon={Receipt} tone="green" label="Revenue today"
            value={money(kpis.revenue_today)}
            sub={`${num(kpis.txns_today)} fills · ${litres(kpis.liters_today)}`}
          />
          <StatCard
            icon={Building2} tone="brand" label="Active clients"
            value={num(kpis.total_clients)}
            sub={`${num(kpis.total_vehicles)} vehicles on credit`}
          />
          <StatCard
            icon={TriangleAlert} tone={Number(kpis.open_alerts) > 0 ? 'red' : 'green'}
            label="Open fraud alerts"
            value={num(kpis.open_alerts)}
            sub={Number(kpis.open_alerts) > 0 ? 'Needs review' : 'All clear'}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* --------------------------- Revenue chart --------------------- */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div>
                <CardTitle>Revenue, last 30 days</CardTitle>
                <CardDescription>Daily credit sales across every fleet</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stopColor={chart.brand} stopOpacity={0.34} />
                        <stop offset="100%" stopColor={chart.brand} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                    <XAxis dataKey="day" {...axisProps(chart)} interval={4} />
                    <YAxis {...axisProps(chart)}
                           tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={chart.tooltip}
                      formatter={(v, n) => (n === 'revenue' ? [money(v), 'Revenue'] : [litres(v), 'Volume'])}
                    />
                    <Area type="monotone" dataKey="revenue" stroke={chart.brand}
                          strokeWidth={2.25} fill="url(#rev)"
                          activeDot={{ r: 4, strokeWidth: 2, stroke: chart.brand }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* -------------------------- Credit exposure -------------------- */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Credit exposure</CardTitle>
                <CardDescription>Who owes the most right now</CardDescription>
              </div>
              <Link to="/admin/clients">
                <Button variant="ghost" size="sm">
                  All <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3.5">
              {top_clients.slice(0, 6).map((c) => {
                const tone = utilisationTone(Number(c.utilisation_pct));
                return (
                  <div key={c.client_id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium text-ink">{c.company_name}</p>
                      <p className="shrink-0 text-sm font-semibold text-ink tnum">
                        {money(c.current_balance)}
                      </p>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ProgressBar value={Number(c.utilisation_pct)} tone={tone.bar} />
                      <span className={`shrink-0 text-[11px] font-medium tnum ${tone.text}`}>
                        {c.utilisation_pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* --------------------------- Fraud alerts ------------------------ */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <TriangleAlert className="size-4 text-rose-500" />
                Recent fraud alerts
              </CardTitle>
              <CardDescription>
                Flagged automatically by the anomaly model at the moment of dispensing
              </CardDescription>
            </div>
            <Link to="/admin/alerts">
              <Button variant="secondary" size="sm">Review all</Button>
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {fraud_alerts.length === 0 ? (
              <EmptyState
                icon={CircleCheck}
                title="No open alerts"
                hint="Every transaction has passed the fraud checks."
              />
            ) : (
              <div className="space-y-2">
                {fraud_alerts.slice(0, 5).map((a) => (
                  <div key={a.txn_id}
                       className="flex flex-wrap items-start gap-3 rounded-lg border border-rose-500/25 bg-rose-500/8 p-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-300">
                      <Droplets className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-ink">
                          {a.license_plate}
                        </span>
                        <span className="text-xs text-ink-3">{a.company_name}</span>
                        <Badge tone="red">score {Number(a.fraud_score).toFixed(2)}</Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-ink-2">{a.flag_reason}</p>
                      <p className="mt-1 text-[11px] text-ink-3">
                        {litres(a.volume_liters)} · {money(a.total_cost)} · {dateTime(a.txn_timestamp)}
                        {a.attendant_name && ` · logged by ${a.attendant_name}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
