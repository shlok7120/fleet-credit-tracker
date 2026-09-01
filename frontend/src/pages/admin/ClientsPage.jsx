import { useEffect, useState } from 'react';
import { Building2, Plus, TrendingUp, Wallet, X } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { money, num, utilisationTone } from '../../lib/utils';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardContent, Table, Th, Td, Button, Input, Label, Select,
  Badge, PageLoader, Alert, ProgressBar, EmptyState,
} from '../../components/ui';

/** Small modal used for both "add client" and "record payment". */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="size-4" />
          </button>
        </div>
        <CardContent className="pt-5">{children}</CardContent>
      </Card>
    </div>
  );
}

export default function ClientsPage() {
  const [clients, setClients] = useState(null);
  const [managers, setManagers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [payFor, setPayFor] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.get('/clients').then(({ data }) => setClients(data)).catch((e) => setError(errorMessage(e)));

  useEffect(() => {
    load();
    api.get('/auth/users')
      .then(({ data }) => setManagers(data.filter((u) => u.role === 'manager')))
      .catch(() => {});
  }, []);

  const addClient = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    setBusy(true); setError('');
    try {
      await api.post('/clients', {
        company_name: f.get('company_name'),
        contact_person: f.get('contact_person'),
        contact_phone: f.get('contact_phone'),
        credit_limit: Number(f.get('credit_limit')),
        manager_user_id: f.get('manager_user_id') ? Number(f.get('manager_user_id')) : null,
      });
      setShowAdd(false);
      setNotice('Client added.');
      load();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  };

  const recordPayment = async (e) => {
    e.preventDefault();
    const amount = Number(new FormData(e.target).get('amount'));
    setBusy(true); setError('');
    try {
      await api.post(`/clients/${payFor.client_id}/payments`, { amount });
      setNotice(`Payment of ${money(amount)} recorded for ${payFor.company_name}.`);
      setPayFor(null);
      load();
    } catch (err) { setError(errorMessage(err)); }
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
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="size-4" /> Add client
          </Button>
        }
      />

      <div className="space-y-4 p-6">
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
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const pct = Number(c.utilisation_pct);
                    const tone = utilisationTone(pct);
                    return (
                      <tr key={c.client_id} className="transition-colors hover:bg-slate-50">
                        <Td>
                          <p className="font-medium text-slate-900">{c.company_name}</p>
                          {c.contact_person && (
                            <p className="text-xs text-slate-400">{c.contact_person}</p>
                          )}
                        </Td>
                        <Td className="text-slate-500">{c.manager_name || '—'}</Td>
                        <Td className="text-right tnum">{num(c.vehicle_count)}</Td>
                        <Td className="text-right tnum">{money(c.credit_limit)}</Td>
                        <Td className="text-right font-semibold text-slate-900 tnum">
                          {money(c.current_balance)}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={pct} tone={tone.bar} />
                            <span className={`shrink-0 text-[11px] font-medium tnum ${tone.text}`}>
                              {pct}%
                            </span>
                          </div>
                          <Badge tone={pct >= 90 ? 'red' : pct >= 75 ? 'amber' : 'green'} className="mt-1">
                            {tone.label}
                          </Badge>
                        </Td>
                        <Td className="text-right">
                          <Button variant="secondary" size="sm" onClick={() => setPayFor(c)}>
                            <Wallet className="size-3.5" /> Payment
                          </Button>
                        </Td>
                      </tr>
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
        <Modal title="Add corporate client" onClose={() => setShowAdd(false)}>
          <form onSubmit={addClient} className="space-y-3.5">
            <div>
              <Label>Company name</Label>
              <Input name="company_name" required placeholder="e.g. Konkan Freight Carriers" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contact person</Label>
                <Input name="contact_person" placeholder="Full name" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input name="contact_phone" placeholder="+91 …" />
              </div>
            </div>
            <div>
              <Label>Credit limit (₹)</Label>
              <Input name="credit_limit" type="number" min="0" step="1000" required placeholder="500000" />
            </div>
            <div>
              <Label>Assign fleet manager</Label>
              <Select name="manager_user_id" defaultValue="">
                <option value="">— none —</option>
                {managers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.full_name} ({m.username})</option>
                ))}
              </Select>
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
        <Modal title={`Record payment — ${payFor.company_name}`} onClose={() => setPayFor(null)}>
          <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Currently owed</span>
              <span className="font-semibold text-slate-900 tnum">{money(payFor.current_balance)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-slate-500">Credit limit</span>
              <span className="tnum text-slate-700">{money(payFor.credit_limit)}</span>
            </div>
          </div>
          <form onSubmit={recordPayment} className="space-y-3.5">
            <div>
              <Label>Amount received (₹)</Label>
              <Input name="amount" type="number" min="1" step="0.01" required autoFocus
                     placeholder={String(Math.round(payFor.current_balance))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setPayFor(null)}>Cancel</Button>
              <Button type="submit" variant="success" loading={busy}>
                <TrendingUp className="size-4" /> Record payment
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
