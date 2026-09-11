import { useEffect, useState } from 'react';
import {
  Receipt, Send, CalendarClock, CircleCheck, CircleAlert, CircleSlash,
  Mail, Play, TriangleAlert,
} from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { money, litres, num, dateTime } from '../../lib/utils';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, Table, Th, Td, Tr,
  Button, Select, Badge, PageLoader, Alert, EmptyState, Modal, Label, Input,
} from '../../components/ui';

const STATUS = {
  sent:    { tone: 'green', icon: CircleCheck },
  failed:  { tone: 'red',   icon: CircleAlert },
  skipped: { tone: 'amber', icon: CircleSlash },
  queued:  { tone: 'slate', icon: CalendarClock },
};

export default function BillingPage() {
  const [clients, setClients] = useState(null);
  const [dispatches, setDispatches] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState('');
  const [emailOn, setEmailOn] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [runResult, setRunResult] = useState(null);

  const load = async () => {
    try {
      const [c, b] = await Promise.all([api.get('/clients'), api.get('/billing/dispatches')]);
      setClients(c.data);
      setDispatches(b.data.dispatches);
      setPeriods(b.data.periods);
      setEmailOn(b.data.email_configured);
      setPeriod((p) => p || b.data.current_period);
    } catch (e) { setError(errorMessage(e)); }
  };

  useEffect(() => { load(); }, []);

  const flash = (m) => { setNotice(m); setError(''); setTimeout(() => setNotice(''), 6000); };

  const sendOne = async (client) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/clients/${client.client_id}/invoice/send`, { period });
      flash(data.message);
      load();
    } catch (e) {
      // A skip is a legitimate outcome, not a crash — surface its reason.
      setError(e?.response?.data?.message || errorMessage(e));
      load();
    }
    setBusy(false);
  };

  const runAll = async () => {
    setBusy(true); setError(''); setRunResult(null);
    try {
      const { data } = await api.get('/billing/run', { params: { period } });
      setRunResult(data);
      load();
    } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };

  const saveBillingEmail = async (e) => {
    e.preventDefault();
    const email = new FormData(e.target).get('billing_email');
    setBusy(true); setError('');
    try {
      await api.put(`/clients/${editing.client_id}`, { billing_email: email });
      setEditing(null);
      flash('Billing email updated.');
      load();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  if (!clients) return <PageLoader label="Loading billing…" />;

  const sentThisPeriod = new Set(
    dispatches.filter((d) => d.period === period && d.status === 'sent').map((d) => d.client_id)
  );

  return (
    <div>
      <PageHeader
        title="Billing"
        description="Invoices run twice a month — the 1st to the 15th, and the 16th to month end."
        actions={
          <div className="flex items-center gap-2">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}
                    className="w-48 py-1.5 text-xs">
              {periods.map((p) => <option key={p.period} value={p.period}>{p.label}</option>)}
            </Select>
            <Button size="sm" onClick={runAll} loading={busy}>
              <Play className="size-3.5" /> Send all
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        {notice && <Alert tone="green">{notice}</Alert>}

        {!emailOn && (
          <Alert tone="amber" title="Email delivery is switched off">
            Invoices are built and recorded, but nothing is actually sent. Add a
            <code className="mx-1">RESEND_API_KEY</code> and a from-address to the API
            project to turn delivery on — no code change needed.
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Clients for this cycle</CardTitle>
              <CardDescription>
                Invoices go to the billing address below. If it is blank, the fleet
                manager’s own email is used; if there is neither, the client is skipped.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {clients.length === 0 ? (
              <EmptyState icon={Receipt} title="No clients yet" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Company</Th>
                    <Th>Invoice goes to</Th>
                    <Th className="text-right">Outstanding</Th>
                    <Th>This cycle</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const done = sentThisPeriod.has(c.client_id);
                    return (
                      <Tr key={c.client_id}>
                        <Td>
                          <p className="font-medium text-ink">{c.company_name}</p>
                          {c.manager_name && (
                            <p className="text-[11px] text-ink-3">{c.manager_name}</p>
                          )}
                        </Td>
                        <Td className="text-[12.5px] text-ink-3">
                          {c.billing_email || <span className="italic">manager’s email</span>}
                        </Td>
                        <Td className="tnum text-right font-medium">{money(c.current_balance)}</Td>
                        <Td>
                          {done
                            ? <Badge tone="green"><CircleCheck className="size-3" /> sent</Badge>
                            : <Badge tone="slate">not sent</Badge>}
                        </Td>
                        <Td>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" title="Set billing email"
                                    onClick={() => setEditing(c)}>
                              <Mail className="size-3.5" />
                            </Button>
                            <Button variant="secondary" size="sm" disabled={done}
                                    onClick={() => sendOne(c)} loading={busy}>
                              <Send className="size-3.5" /> {done ? 'Sent' : 'Send'}
                            </Button>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        {runResult && (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Run for {runResult.period_label}</CardTitle>
                <CardDescription>
                  {runResult.ran
                    ? `${runResult.clients} clients processed`
                    : runResult.reason}
                </CardDescription>
              </div>
            </CardHeader>
            {runResult.results && (
              <CardContent className="space-y-1.5">
                {runResult.results.map((r, i) => {
                  const meta = STATUS[r.status] ?? STATUS.queued;
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Badge tone={meta.tone}><meta.icon className="size-3" /> {r.status}</Badge>
                      <span className="font-medium text-ink">{r.company}</span>
                      {r.subtotal != null && (
                        <span className="tnum text-ink-2">{money(r.subtotal)}</span>
                      )}
                      {r.error && <span className="text-ink-3">— {r.error}</span>}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        )}

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Dispatch history</CardTitle>
              <CardDescription>
                Every invoice the system has recorded, whether or not it was delivered.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {dispatches.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nothing sent yet"
                          hint="Invoices appear here as each cycle closes." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Company</Th>
                    <Th>Period</Th>
                    <Th className="text-right">Volume</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>To</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map((d) => {
                    const meta = STATUS[d.status] ?? STATUS.queued;
                    return (
                      <Tr key={d.dispatch_id}>
                        <Td className="whitespace-nowrap text-ink-3">{dateTime(d.created_at)}</Td>
                        <Td className="font-medium text-ink">{d.company_name}</Td>
                        <Td className="text-ink-3">{d.period}</Td>
                        <Td className="tnum text-right">{litres(d.total_liters)}</Td>
                        <Td className="tnum text-right font-medium">{money(d.subtotal)}</Td>
                        <Td className="text-[12px] text-ink-3">{d.recipient || '—'}</Td>
                        <Td>
                          <Badge tone={meta.tone}><meta.icon className="size-3" /> {d.status}</Badge>
                          {d.error && (
                            <p className="mt-1 max-w-[22ch] text-[11px] leading-snug text-ink-3">
                              {d.error}
                            </p>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        <p className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-ink-3">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          A client can only be invoiced once per cycle — the database enforces it, so a
          retried or duplicated run can never send the same fortnight twice.
        </p>
      </div>

      {editing && (
        <Modal
          title={`Billing email — ${editing.company_name}`}
          description="Where this client's invoices are sent. Leave blank to use their fleet manager's email."
          onClose={() => setEditing(null)}
        >
          <form onSubmit={saveBillingEmail} className="space-y-3.5">
            <div>
              <Label>Billing email</Label>
              <Input name="billing_email" type="email" autoFocus
                     defaultValue={editing.billing_email || ''}
                     placeholder="accounts@company.com" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button type="submit" loading={busy}>Save</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
