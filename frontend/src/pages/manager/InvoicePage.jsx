import { useEffect, useState } from 'react';
import { FileText, Printer } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { moneyExact, money, litres, num } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardContent, Table, Th, Td, Button, Select,
  PageLoader, Alert, EmptyState,
} from '../../components/ui';

/** The last six months, as {value: '2026-08', label: 'Aug 2026'}. */
const monthOptions = () => {
  const out = [];
  const d = new Date();
  for (let i = 0; i < 6; i++) {
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
};

export default function InvoicePage() {
  const { user } = useAuth();
  const months = monthOptions();

  const [month, setMonth] = useState(months[0].value);
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user.client_id) { setError('No fleet is assigned to your account yet.'); return; }
    setInvoice(null);
    api.get(`/clients/${user.client_id}/invoice`, { params: { month } })
      .then(({ data }) => setInvoice(data))
      .catch((e) => setError(errorMessage(e)));
  }, [month, user.client_id]);

  if (error) return <div className="p-6"><Alert tone="red">{error}</Alert></div>;

  return (
    <div>
      <PageHeader
        title="Monthly invoice"
        description="Consolidated statement of every litre billed to your fleet."
        actions={
          <div className="flex items-center gap-2">
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="w-44 py-1.5 text-xs">
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </Select>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" /> Print
            </Button>
          </div>
        }
      />

      <div className="p-6">
        {!invoice ? (
          <PageLoader label="Generating invoice…" />
        ) : (
          <Card className="mx-auto max-w-3xl">
            <CardContent className="p-8">
              {/* --------------------------- Letterhead ------------------- */}
              <div className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Statement of account
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                    {invoice.client.company_name}
                  </h2>
                  {invoice.client.contact_person && (
                    <p className="mt-0.5 text-sm text-slate-500">
                      Attn: {invoice.client.contact_person}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Billing period
                  </p>
                  <p className="mt-1 font-medium text-slate-900">
                    {new Date(`${invoice.month}-01`).toLocaleDateString('en-IN',
                      { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Generated {new Date(invoice.generated_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
              </div>

              {invoice.lines.length === 0 ? (
                <EmptyState icon={FileText} title="No fuelling this month"
                            hint="Pick a different billing period from the dropdown above." />
              ) : (
                <>
                  <Table className="mt-6">
                    <thead>
                      <tr>
                        <Th>Vehicle</Th>
                        <Th>Fuel</Th>
                        <Th className="text-right">Fills</Th>
                        <Th className="text-right">Volume</Th>
                        <Th className="text-right">Amount</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lines.map((l) => (
                        <tr key={l.license_plate}>
                          <Td className="font-mono font-medium text-slate-900">{l.license_plate}</Td>
                          <Td className="capitalize text-slate-500">{l.fuel}</Td>
                          <Td className="text-right tnum">{num(l.fills)}</Td>
                          <Td className="text-right tnum">{litres(l.liters)}</Td>
                          <Td className="text-right tnum font-medium">{moneyExact(l.amount)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>

                  <div className="mt-6 flex justify-end">
                    <div className="w-full max-w-xs space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Total volume</span>
                        <span className="tnum text-slate-700">{litres(invoice.total_liters)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-2">
                        <span className="font-semibold text-slate-900">Amount due</span>
                        <span className="text-lg font-semibold tnum text-slate-900">
                          {moneyExact(invoice.subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
                    <p>
                      Current account balance: <span className="font-medium text-slate-700 tnum">
                        {money(invoice.client.current_balance)}
                      </span> against a sanctioned limit of <span className="font-medium text-slate-700 tnum">
                        {money(invoice.client.credit_limit)}
                      </span>.
                    </p>
                    <p className="mt-1">
                      This statement is generated automatically from dispenser records.
                      Raise any discrepancy with the pump administrator within 7 days.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
