import { useEffect, useState } from 'react';
import { Building2, Plus, TrendingUp, Wallet, Trash2, TriangleAlert, UserPlus } from 'lucide-react';

const PAYMENT_METHODS = [
  ['cash', 'Cash'], ['cheque', 'Cheque'], ['neft', 'NEFT'],
  ['rtgs', 'RTGS'], ['upi', 'UPI'], ['other', 'Other'],
];

import api, { errorMessage } from '../../lib/api';
import { money, num, utilisationTone } from '../../lib/utils';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardContent, Table, Th, Td, Tr, Button, Input, Label, Select,
  Badge, PageLoader, Alert, ProgressBar, EmptyState, Modal, FieldRow,
} from '../../components/ui';

export default function ClientsPage() {
  const [clients, setClients] = useState(null);
  const [managers, setManagers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  // Whether the "add client" form creates a fresh manager login or picks an
  // existing one. A brand-new corporate account nearly always needs a new
  // sign-in, so that is the default.
  const [managerMode, setManagerMode] = useState('new');

  const load = () =>
    api.get('/clients').then(({ data }) => setClients(data)).catch((e) => setError(errorMessage(e)));

  const loadManagers = () =>
    api.get('/users')
      .then(({ data }) => setManagers(data.filter((u) => u.role === 'manager' && u.is_active)))
      .catch(() => {});

  useEffect(() => { load(); loadManagers(); }, []);

  const flash = (m) => { setNotice(m); setError(''); setTimeout(() => setNotice(''), 6000); };

  const addClient = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true); setError('');
    try {
      const body = {
        company_name: f.get('company_name'),
        contact_person: f.get('contact_person'),
        contact_phone: f.get('contact_phone'),
        credit_limit: Number(f.get('credit_limit')),
      };

      if (managerMode === 'new') {
        body.new_manager = {
          username: f.get('m_username'),
          password: f.get('m_password'),
          full_name: f.get('m_full_name') || f.get('contact_person'),
          email: f.get('m_email'),
          phone: f.get('contact_phone'),
        };
      } else if (f.get('manager_user_id')) {
        body.manager_user_id = Number(f.get('manager_user_id'));
      }

      await api.post('/clients', body);
      setShowAdd(false);
      flash(managerMode === 'new'
        ? `${body.company_name} added. Their manager can sign in as “${body.new_manager.username}”.`
        : `${body.company_name} added.`);
      load(); loadManagers();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/clients/${payFor.client_id}/payments`, {
        amount: Number(f.get('amount')),
        method: f.get('method'),
        reference: f.get('reference'),
        received_on: f.get('received_on'),
        note: f.get('note'),
      });
      flash(`${data.message} — ${payFor.company_name}.`);
      setPayFor(null);
      load();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  const removeClient = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.delete(`/clients/${removing.client_id}`);
      flash(
        Number(data.outstanding) > 0
          ? `${data.message} Note: ${money(data.outstanding)} was still outstanding — that debt is not cancelled.`
          : data.message
      );
      setRemoving(null);
      load();
    } catch (err) { setError(errorMessage(err)); setRemoving(null); }
    setBusy(false);
  };

  if (!clients) return <PageLoader label="Loading clients…" />;

  const totalOutstanding = clients.reduce((s, c) => s + Number(c.current_balance), 0);

  return (
    <div>
      <PageHeader
        title="Corporate clients"
        description={`${clients.length} fleets · ${money(totalOutstanding)} outstanding`}
        actions={
          <Button size="sm" onClick={() => { setManagerMode('new'); setShowAdd(true); }}>
            <Plus className="size-4" /> Add client
          </Button>
        }
      />

      <div className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        {notice && <Alert tone="green">{notice}</Alert>}

        <Card>
          <CardContent className="p-0">
            {clients.length === 0 ? (
              <EmptyState icon={Building2} title="No clients yet"
                          hint="Add your first corporate fleet to start tracking credit." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Company</Th>
                    <Th>Manager</Th>
                    <Th className="text-right">Vehicles</Th>
                    <Th className="text-right">Credit limit</Th>
                    <Th className="text-right">Outstanding</Th>
                    <Th className="w-44">Utilisation</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const pct = Number(c.utilisation_pct);
                    const tone = utilisationTone(pct);
                    return (
                      <Tr key={c.client_id}>
                        <Td>
                          <p className="font-medium text-ink">{c.company_name}</p>
                          {c.contact_person && (
                            <p className="text-[11px] text-ink-3">{c.contact_person}</p>
                          )}
                        </Td>
                        <Td className="text-ink-3">{c.manager_name || '—'}</Td>
                        <Td className="tnum text-right">{num(c.vehicle_count)}</Td>
                        <Td className="tnum text-right">{money(c.credit_limit)}</Td>
                        <Td className="tnum text-right font-semibold text-ink">
                          {money(c.current_balance)}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={pct} tone={tone.bar} />
                            <span className={`tnum shrink-0 text-[11px] font-medium ${tone.text}`}>
                              {pct}%
                            </span>
                          </div>
                          <Badge tone={pct >= 90 ? 'red' : pct >= 75 ? 'amber' : pct >= 50 ? 'violet' : 'green'}
                                 className="mt-1.5">
                            {tone.label}
                          </Badge>
                        </Td>
                        <Td>
                          <div className="flex justify-end gap-1">
                            <Button variant="secondary" size="sm" onClick={() => setPayFor(c)}>
                              <Wallet className="size-3.5" /> Payment
                            </Button>
                            <Button variant="ghost" size="sm" title="Remove client"
                                    onClick={() => setRemoving(c)}>
                              <Trash2 className="size-3.5 text-rose-600 dark:text-rose-300" />
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
      </div>

      {/* ------------------------------ Add client ------------------------- */}
      {showAdd && (
        <Modal
          title="Add corporate client"
          description="Set their credit limit and give their fleet manager a way in."
          size="lg"
          onClose={() => setShowAdd(false)}
        >
          <form onSubmit={addClient} className="space-y-4">
            <div>
              <Label>Company name</Label>
              <Input name="company_name" required autoFocus placeholder="Gujarat Roadlines" />
            </div>

            <FieldRow>
              <div>
                <Label>Contact person</Label>
                <Input name="contact_person" placeholder="Jayesh Shah" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input name="contact_phone" placeholder="+91 98250 11223" />
              </div>
            </FieldRow>

            <div>
              <Label>Credit limit (₹)</Label>
              <Input name="credit_limit" type="number" min="0" step="1000" required
                     placeholder="500000" className="tnum" />
            </div>

            {/* ---------------------- Manager access --------------------- */}
            <div className="glass-quiet space-y-3 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] font-medium text-ink">Fleet manager access</p>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setManagerMode('new')}
                          className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                            managerMode === 'new'
                              ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                              : 'text-ink-3 hover:text-ink'}`}>
                    Create login
                  </button>
                  <button type="button" onClick={() => setManagerMode('existing')}
                          className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                            managerMode === 'existing'
                              ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                              : 'text-ink-3 hover:text-ink'}`}>
                    Use existing
                  </button>
                </div>
              </div>

              {managerMode === 'new' ? (
                <>
                  <FieldRow>
                    <div>
                      <Label>Manager’s name</Label>
                      <Input name="m_full_name" placeholder="Same as contact person" />
                    </div>
                    <div>
                      <Label>Manager’s email <span className="font-normal text-ink-3">optional</span></Label>
                      <Input name="m_email" type="email" placeholder="jayesh@example.com" />
                    </div>
                  </FieldRow>
                  <FieldRow>
                    <div>
                      <Label>Username</Label>
                      <Input name="m_username" required placeholder="mgr_gujarat"
                             className="font-mono lowercase" />
                    </div>
                    <div>
                      <Label>Password</Label>
                      <Input name="m_password" type="password" required minLength={8}
                             placeholder="At least 8 characters" autoComplete="new-password" />
                    </div>
                  </FieldRow>
                  <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-3">
                    <UserPlus className="mt-0.5 size-3 shrink-0" />
                    Creates a fleet manager account linked to this client. Share these
                    credentials with them — they can change the password afterwards.
                  </p>
                </>
              ) : (
                <div>
                  <Label>Assign an existing manager</Label>
                  <Select name="manager_user_id" defaultValue="">
                    <option value="">— none for now —</option>
                    {managers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.full_name} ({m.username})
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-[11px] text-ink-3">
                    A client with no manager is still tracked here, but nobody from that
                    company can sign in to see it.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" loading={busy}>Add client</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------------------------- Record payment ----------------------- */}
      {payFor && (
        <Modal
          title={`Record payment — ${payFor.company_name}`}
          description="Kept as a permanent record. A mistake is reversed later, never deleted."
          size="lg"
          onClose={() => setPayFor(null)}
        >
          <div className="glass-quiet mb-4 flex flex-wrap gap-x-8 gap-y-2 p-3 text-sm">
            <div>
              <span className="block text-[11px] text-ink-3">Currently owed</span>
              <span className="tnum font-semibold text-ink">{money(payFor.current_balance)}</span>
            </div>
            <div>
              <span className="block text-[11px] text-ink-3">Credit limit</span>
              <span className="tnum text-ink-2">{money(payFor.credit_limit)}</span>
            </div>
          </div>

          <form onSubmit={recordPayment} className="space-y-4">
            <FieldRow>
              <div>
                <Label>Amount received (₹)</Label>
                <Input name="amount" type="number" min="1" step="0.01" required autoFocus
                       className="tnum" placeholder={String(Math.round(payFor.current_balance))} />
              </div>
              <div>
                <Label>Date received</Label>
                <Input name="received_on" type="date"
                       defaultValue={new Date().toISOString().slice(0, 10)} />
                <p className="mt-1 text-[11px] text-ink-3">
                  When the money arrived, not when you are entering it.
                </p>
              </div>
            </FieldRow>

            <FieldRow>
              <div>
                <Label>Method</Label>
                <Select name="method" defaultValue="cheque">
                  {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div>
                <Label>Reference <span className="font-normal text-ink-3">optional</span></Label>
                <Input name="reference" placeholder="Cheque no. / UTR / UPI ref" />
                <p className="mt-1 text-[11px] text-ink-3">
                  What you will match against your bank statement.
                </p>
              </div>
            </FieldRow>

            <div>
              <Label>Note <span className="font-normal text-ink-3">optional</span></Label>
              <Input name="note" placeholder="Part settlement for August" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button>
              <Button type="submit" variant="success" loading={busy}>
                <TrendingUp className="size-4" /> Record payment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ------------------------------- Remove ---------------------------- */}
      {removing && (
        <Modal title={`Remove ${removing.company_name}?`} onClose={() => setRemoving(null)}>
          <Alert tone="amber" className="mb-4">
            <span className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                They disappear from every screen and no further fuelling can be logged
                against their {num(removing.vehicle_count)} vehicle
                {Number(removing.vehicle_count) === 1 ? '' : 's'}. Their past transactions
                stay in the ledger as your sales history.
              </span>
            </span>
          </Alert>

          {Number(removing.current_balance) > 0 && (
            <Alert tone="red" className="mb-4">
              <strong>{money(removing.current_balance)} is still outstanding.</strong> Removing
              the client does not cancel that debt — record the payment first if it has been
              settled.
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={removeClient}>
              <Trash2 className="size-4" /> Remove client
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
