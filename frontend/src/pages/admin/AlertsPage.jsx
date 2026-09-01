import { useEffect, useState } from 'react';
import { TriangleAlert, CircleCheck, ShieldCheck, Filter } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { money, litres, dateTime } from '../../lib/utils';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardContent, Button, Badge, PageLoader, Alert, EmptyState, Select,
} from '../../components/ui';

export default function AlertsPage() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('true');   // 'true' = only flagged
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(null);

  const load = (flagged) =>
    api.get('/transactions', { params: { flagged, limit: 200 } })
      .then(({ data }) => setRows(data))
      .catch((e) => setError(errorMessage(e)));

  useEffect(() => { setRows(null); load(filter); }, [filter]);

  const clearFlag = async (txnId) => {
    setClearing(txnId);
    try {
      await api.patch(`/transactions/${txnId}/resolve`);
      setRows((r) => r.filter((t) => t.txn_id !== txnId));
    } catch (err) { setError(errorMessage(err)); }
    setClearing(null);
  };

  return (
    <div>
      <PageHeader
        title="Fraud alerts"
        description="Transactions the anomaly model considered suspicious. Clearing an alert marks it reviewed."
        actions={
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-slate-400" />
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44 py-1.5 text-xs">
              <option value="true">Flagged only</option>
              <option value="">All transactions</option>
            </Select>
          </div>
        }
      />

      <div className="space-y-4 p-6">
        {error && <Alert tone="red">{error}</Alert>}

        {!rows ? (
          <PageLoader label="Loading alerts…" />
        ) : rows.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={ShieldCheck}
                title="Nothing flagged"
                hint="Every transaction has passed both the rule checks and the anomaly model."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {rows.map((t) => (
              <Card key={t.txn_id} className={t.is_flagged ? 'border-rose-200' : ''}>
                <CardContent className="flex flex-wrap items-start gap-4 p-4">
                  <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    t.is_flagged ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {t.is_flagged ? <TriangleAlert className="size-4" /> : <CircleCheck className="size-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {t.license_plate}
                      </span>
                      <span className="text-sm text-slate-500">{t.company_name}</span>
                      {t.is_flagged && (
                        <Badge tone={Number(t.fraud_score) >= 0.9 ? 'red' : 'amber'}>
                          risk {Number(t.fraud_score).toFixed(2)}
                        </Badge>
                      )}
                      <Badge tone="slate">#{t.txn_id}</Badge>
                    </div>

                    {t.flag_reason && (
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{t.flag_reason}</p>
                    )}

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                      <span className="tnum">{litres(t.volume_liters)}</span>
                      <span className="tnum">{money(t.total_cost)}</span>
                      <span>{dateTime(t.txn_timestamp)}</span>
                      {t.attendant_name && <span>logged by {t.attendant_name}</span>}
                    </div>
                  </div>

                  {t.is_flagged && (
                    <Button
                      variant="secondary" size="sm"
                      loading={clearing === t.txn_id}
                      onClick={() => clearFlag(t.txn_id)}
                    >
                      <CircleCheck className="size-3.5" /> Mark reviewed
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
