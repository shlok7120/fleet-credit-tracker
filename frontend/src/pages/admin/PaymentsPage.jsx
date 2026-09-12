import { useEffect, useState } from 'react';
import {
  Wallet, Undo2, Filter, Banknote, CircleAlert, TrendingUp, Landmark,
} from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { money, num, dateOnly, dateTime } from '../../lib/utils';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, Table, Th, Td, Tr,
  Button, Input, Label, Select, Badge, PageLoader, Alert, EmptyState, Modal, StatCard,
} from '../../components/ui';

const METHOD_LABEL = {
  cash: 'Cash', cheque: 'Cheque', neft: 'NEFT',
  rtgs: 'RTGS', upi: 'UPI', other: 'Other',
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState(null);
  const [totals, setTotals] = useState(null);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [filterClient, setFilterClient] = useState('');
  const [filterMethod, setFilterMethod] = useState('');
  const [reversing, setReversing] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get('/payments', {
        params: {
          ...(filterClient ? { client_id: filterClient } : {}),
          ...(filterMethod ? { method: filterMethod } : {}),
        },
      });
      setPayments(data.payments);
      setTotals(data.totals);
    } catch (e) { setError(errorMessage(e)); }
  };

  useEffect(() => {
    api.get('/clients').then(({ data }) => setClients(data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [filterClient, filterMethod]);

  const flash = (m) => { setNotice(m); setError(''); setTimeout(() => setNotice(''), 6000); };

  const doReverse = async (e) => {
    e.preventDefault();
    const reason = new FormData(e.target).get('reason');
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/payments/${reversing.payment_id}/reverse`, { reason });
      flash(data.message);
      setReversing(null);
      load();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  if (!payments) return <PageLoader label="Loading payments…" />;

  const outstanding = clients.reduce((s, c) => s + Number(c.current_balance), 0);

  return (
    <div>
      <PageHeader
        title="Payments received"
        description="Money coming in. Every entry is permanent — a mistake is reversed, never deleted."
      />

      <div className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        {notice && <Alert tone="green">{notice}</Alert>}

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={TrendingUp} tone="green" label="Received"
                    value={money(totals?.amount || 0)}
                    sub={`${num(totals?.count || 0)} payments in view`} />
          <StatCard icon={Wallet} tone="amber" label="Still outstanding"
                    value={money(outstanding)}
                    sub="across every active client" />
          <StatCard icon={CircleAlert} tone={totals?.reversed ? 'red' : 'violet'}
                    label="Reversed" value={num(totals?.reversed || 0)}
                    sub={totals?.reversed ? 'excluded from the total' : 'none'} />
        </div>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Payment ledger</CardTitle>
              <CardDescription>
                Record a payment from the Clients screen. Reversed entries stay visible
                but do not count toward the total.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="size-3.5 text-ink-3" />
              <Select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
                      className="w-44 py-1.5 text-xs">
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>{c.company_name}</option>
                ))}
              </Select>
              <Select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)}
                      className="w-32 py-1.5 text-xs">
                <option value="">All methods</option>
                {Object.entries(METHOD_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <EmptyState icon={Banknote} title="No payments recorded yet"
                          hint="Go to Clients and use the Payment button against a company." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Received</Th>
                    <Th>Company</Th>
                    <Th>Method</Th>
                    <Th>Reference</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Recorded by</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <Tr key={p.payment_id} className={p.reversed_at ? 'opacity-60' : ''}>
                      <Td className="whitespace-nowrap">{dateOnly(p.received_on)}</Td>
                      <Td>
                        <p className="font-medium text-ink">{p.company_name}</p>
                        {p.note && <p className="text-[11px] text-ink-3">{p.note}</p>}
                      </Td>
                      <Td>
                        <Badge tone={p.method === 'cash' ? 'amber' : 'violet'}>
                          <Landmark className="size-3" /> {METHOD_LABEL[p.method] || p.method}
                        </Badge>
                      </Td>
                      <Td className="font-mono text-[12px] text-ink-3">{p.reference || '—'}</Td>
                      <Td className={`tnum text-right font-semibold ${
                        p.reversed_at ? 'text-ink-3 line-through' : 'text-ink'}`}>
                        {money(p.amount)}
                      </Td>
                      <Td className="text-[12px] text-ink-3">
                        {p.recorded_by || '—'}
                        <span className="block text-[11px]">{dateTime(p.created_at)}</span>
                      </Td>
                      <Td>
                        <div className="flex justify-end">
                          {p.reversed_at ? (
                            <div className="text-right">
                              <Badge tone="red">reversed</Badge>
                              <p className="mt-1 max-w-[20ch] text-[11px] leading-snug text-ink-3">
                                {p.reversal_reason}
                              </p>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" title="Reverse this payment"
                                    onClick={() => setReversing(p)}>
                              <Undo2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {reversing && (
        <Modal
          title="Reverse this payment?"
          description={`${money(reversing.amount)} from ${reversing.company_name}`}
          onClose={() => setReversing(null)}
        >
          <Alert tone="amber" className="mb-4">
            The debt goes back onto {reversing.company_name}’s account. Both this payment
            and the reversal stay on the ledger — nothing is erased, because a bank
            statement will still show the original entry.
          </Alert>
          <form onSubmit={doReverse} className="space-y-3.5">
            <div>
              <Label>Why is it being reversed?</Label>
              <Input name="reason" required autoFocus
                     placeholder="Cheque bounced / entered against the wrong client" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReversing(null)}>Cancel</Button>
              <Button type="submit" variant="danger" loading={busy}>
                <Undo2 className="size-4" /> Reverse payment
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
