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
import { money, litres, num, dateTime, utilisationTone } from '../../lib/utils';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  StatCard, Badge, PageLoader, Alert, ProgressBar, EmptyState, Button,
} from '../../components/ui';

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/admin')
      .then(({ data }) => setData(data))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <div className="p-6"><Alert tone="red" title="Could not load the dashboard">{error}</Alert></div>;
  if (!data) return <PageLoader label="Loading pump overview…" />;

  const { kpis, top_clients, fraud_alerts, revenue_trend, ml_service } = data;
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
          <Badge tone={ml_service.reachable ? 'green' : 'amber'}>
            <Cpu className="size-3" />
            ML service {ml_service.reachable ? 'online' : 'offline'}
          </Badge>
        }
      />

      <div className="space-y-5 p-6">
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
                        <stop offset="0%"   stopColor="#1d66f1" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#1d66f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }}
                           axisLine={false} tickLine={false} interval={4} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                           tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 10, border: '1px solid #e2e8f0',
                        fontSize: 12, boxShadow: '0 4px 12px rgb(0 0 0 / 0.06)',
                      }}
                      formatter={(v, n) => (n === 'revenue' ? [money(v), 'Revenue'] : [litres(v), 'Volume'])}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#1d66f1"
                          strokeWidth={2} fill="url(#rev)" />
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
                      <p className="truncate text-sm font-medium text-slate-800">{c.company_name}</p>
                      <p className="shrink-0 text-sm font-semibold text-slate-900 tnum">
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
                       className="flex flex-wrap items-start gap-3 rounded-lg border border-rose-100 bg-rose-50/50 p-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose-100 text-rose-600">
                      <Droplets className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">
                          {a.license_plate}
                        </span>
                        <span className="text-xs text-slate-500">{a.company_name}</span>
                        <Badge tone="red">score {Number(a.fraud_score).toFixed(2)}</Badge>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{a.flag_reason}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
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
