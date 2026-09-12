import { useEffect, useState } from 'react';
import {
  Receipt, Send, CalendarClock, CircleCheck, CircleAlert, CircleSlash,
  Mail, Play, TriangleAlert, Archive, FileText, Lock, Filter,
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

  // The permanent archive: every invoice ever issued, for every client.
  const [archive, setArchive] = useState(null);
  const [totals, setTotals] = useState(null);
  const [allPeriods, setAllPeriods] = useState([]);
  const [filterClient, setFilterClient] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [viewing, setViewing] = useState(null);

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

  const loadArchive = async () => {
    try {
      const { data } = await api.get('/invoices', {
        params: {
          ...(filterClient ? { client_id: filterClient } : {}),
          ...(filterPeriod ? { period: filterPeriod } : {}),
        },
      });
      setArchive(data.invoices);
      setTotals(data.totals);
      setAllPeriods(data.periods);
    } catch (e) { setError(errorMessage(e)); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadArchive(); }, [filterClient, filterPeriod]);

  const openInvoice = async (row) => {
    try {
      const { data } = await api.get(`/invoices/${row.dispatch_id}`);
      setViewing(data);
    } catch (e) { setError(errorMessage(e)); }
  };

  const flash = (m) => { setNotice(m); setError(''); setTimeout(() => setNotice(''), 6000); };

  const sendOne = async (client) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/clients/${client.client_id}/invoice/send`, { period });
      flash(data.message);
      load(); loadArchive();
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
      load(); loadArchive();
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
              <CardTitle className="flex items-center gap-2">
                <Archive className="size-4 text-ink-3" />
                Invoice archive
              </CardTitle>
              <CardDescription>
                Every invoice ever issued, for every client. Each one keeps a frozen
                copy of its own line items — a past invoice never changes, whatever
                happens to the data afterwards.
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
              <Select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}
                      className="w-44 py-1.5 text-xs">
                <option value="">All cycles</option>
                {allPeriods.map((p) => (
                  <option key={p.period} value={p.period}>{p.label}</option>
                ))}
              </Select>
            </div>
          </CardHeader>

          {totals && totals.count > 0 && (
            <CardContent className="pb-3 pt-0">
              <div className="glass-quiet flex flex-wrap gap-x-10 gap-y-3 px-4 py-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">Invoices</p>
                  <p className="tnum mt-0.5 text-lg font-semibold text-ink">{num(totals.count)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">Volume billed</p>
                  <p className="tnum mt-0.5 text-lg font-semibold text-ink">{litres(totals.liters)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-3">Value billed</p>
                  <p className="tnum mt-0.5 text-lg font-semibold text-ink">{money(totals.value)}</p>
                </div>
              </div>
            </CardContent>
          )}

          <CardContent className="p-0">
            {!archive ? (
              <PageLoader label="Loading archive…" />
            ) : archive.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No invoices issued yet"
                          hint="They appear here as each cycle closes, or when you send one manually." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Issued</Th>
                    <Th>Company</Th>
                    <Th>Cycle</Th>
                    <Th className="text-right">Volume</Th>
                    <Th className="text-right">Amount</Th>
                    <Th>Delivery</Th>
                  </tr>
                </thead>
                <tbody>
                  {archive.map((d) => {
                    const meta = STATUS[d.status] ?? STATUS.queued;
                    return (
                      <Tr key={d.dispatch_id} className="cursor-pointer"
                          onClick={() => openInvoice(d)}>
                        <Td className="font-mono text-[12px] font-medium text-ink">
                          {d.invoice_no || '—'}
                        </Td>
                        <Td className="whitespace-nowrap text-ink-3">{dateTime(d.issued_at)}</Td>
                        <Td className="font-medium text-ink">{d.company_name}</Td>
                        <Td className="text-ink-3">{d.period}</Td>
                        <Td className="tnum text-right">{litres(d.total_liters)}</Td>
                        <Td className="tnum text-right font-semibold text-ink">{money(d.subtotal)}</Td>
                        <Td>
                          <Badge tone={meta.tone}><meta.icon className="size-3" /> {d.status}</Badge>
                          {d.legacy && <Badge tone="slate" className="ml-1">no detail</Badge>}
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
          retried or duplicated run can never issue the same fortnight twice. Click any
          row above to open the invoice exactly as it was issued.
        </p>
      </div>

      {viewing && (
        <Modal
          title={viewing.invoice_no || 'Invoice'}
          description={`${viewing.company_name} · ${viewing.period_label}`}
          size="xl"
          onClose={() => setViewing(null)}
        >
          {viewing.legacy ? (
            <Alert tone="amber">
              This invoice was issued before line detail was archived, so only its
              totals survive: {litres(viewing.total_liters)} across {viewing.line_count}{' '}
              vehicles, {money(viewing.subtotal)}.
            </Alert>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                <div>
                  <p className="text-[15px] font-semibold text-ink">
                    {viewing.snapshot?.pump?.pump_name || 'Invoice'}
                  </p>
                  {viewing.snapshot?.pump?.oil_company && (
                    <p className="text-[11.5px] text-ink-3">
                      Authorised dealer · {viewing.snapshot.pump.oil_company}
                    </p>
                  )}
                  {viewing.snapshot?.pump?.gstin && (
                    <p className="font-mono text-[11px] text-ink-3">
                      GSTIN {viewing.snapshot.pump.gstin}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wider text-ink-3">Issued</p>
                  <p className="text-[13px] font-medium text-ink">{dateTime(viewing.issued_at)}</p>
                  {viewing.issued_by && (
                    <p className="text-[11px] text-ink-3">by {viewing.issued_by}</p>
                  )}
                </div>
              </div>

              <Table>
                <thead>
                  <tr>
                    <Th>Vehicle</Th><Th>Fuel</Th>
                    <Th className="text-right">Fills</Th>
                    <Th className="text-right">Volume</Th>
                    <Th className="text-right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {(viewing.snapshot?.lines || []).map((l) => (
                    <Tr key={l.license_plate}>
                      <Td className="font-mono font-medium text-ink">{l.license_plate}</Td>
                      <Td className="capitalize text-ink-3">{l.fuel}</Td>
                      <Td className="tnum text-right">{num(l.fills)}</Td>
                      <Td className="tnum text-right">{litres(l.liters)}</Td>
                      <Td className="tnum text-right font-medium text-ink">{money(l.amount)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>

              <div className="mt-4 flex justify-end">
                <div className="w-full max-w-xs space-y-1.5">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-ink-3">Total volume</span>
                    <span className="tnum text-ink-2">{litres(viewing.total_liters)}</span>
                  </div>
                  <div className="flex justify-between border-t border-line pt-2">
                    <span className="font-semibold text-ink">Amount due</span>
                    <span className="tnum text-lg font-semibold text-ink">{money(viewing.subtotal)}</span>
                  </div>
                </div>
              </div>

              <div className="glass-quiet mt-4 p-3 text-[11.5px] leading-relaxed text-ink-3">
                <p className="flex items-start gap-1.5">
                  <Lock className="mt-0.5 size-3 shrink-0" />
                  <span>
                    Frozen at issue. Balance then was{' '}
                    {money(viewing.snapshot?.balance_at_issue ?? 0)} against a limit of{' '}
                    {money(viewing.snapshot?.credit_limit_at_issue ?? 0)}. These figures do
                    not change if the underlying records are later edited.
                  </span>
                </p>
                <p className="mt-2">
                  Delivery: <strong className="text-ink">{viewing.status}</strong>
                  {viewing.recipient && <> to {viewing.recipient}</>}
                  {viewing.error && <> — {viewing.error}</>}
                </p>
              </div>
            </>
          )}

          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={() => setViewing(null)}>Close</Button>
          </div>
        </Modal>
      )}

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
