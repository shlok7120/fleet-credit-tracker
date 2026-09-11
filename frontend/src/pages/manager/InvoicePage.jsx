import { useEffect, useState } from 'react';
import { FileText, Printer } from 'lucide-react';

import api, { errorMessage } from '../../lib/api';
import { moneyExact, money, litres, num } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { PageHeader } from '../../components/AppLayout';
import {
  Card, CardContent, Table, Th, Td, Button, Select,
  PageLoader, Alert, EmptyState,
} from '../../components/ui';

export default function InvoicePage() {
  const { user } = useAuth();
  const brand = useBranding();

  // Billing runs fortnightly: the 1st–15th and the 16th–end of month. The
  // list of cycles comes from the server so the client and server can never
  // disagree about where a boundary falls.
  const [period, setPeriod] = useState('');
  const [periods, setPeriods] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user.client_id) { setError('No fleet is assigned to your account yet.'); return; }
    setInvoice(null);
    api.get(`/clients/${user.client_id}/invoice`, { params: period ? { period } : {} })
      .then(({ data }) => {
        setInvoice(data);
        setPeriods(data.periods || []);
        if (!period) setPeriod(data.period);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [period, user.client_id]);

  if (error) return <div><Alert tone="red">{error}</Alert></div>;

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Billed fortnightly — the 1st to the 15th, and the 16th to month end."
        actions={
          <div className="flex items-center gap-2">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}
                    className="w-48 py-1.5 text-xs">
              {periods.map((p) => (
                <option key={p.period} value={p.period}>{p.label}</option>
              ))}
            </Select>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" /> Print
            </Button>
          </div>
        }
      />

      <div>
        {!invoice ? (
          <PageLoader label="Generating invoice…" />
        ) : (
          <Card className="mx-auto max-w-3xl print:max-w-none">
            <CardContent className="p-8">
              {/* ------------------------ Issuer letterhead ---------------- */}
              <div className="mb-6 flex items-start justify-between gap-6 border-b border-line pb-5">
                <div className="flex min-w-0 items-center gap-3">
                  {brand.logo && (
                    <img src={brand.logo} alt="" className="size-11 shrink-0 object-contain" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-ink">
                      {brand.pump_name}
                    </p>
                    {brand.oil_company && (
                      <p className="text-[11.5px] text-ink-3">
                        Authorised dealer · {brand.oil_company}
                      </p>
                    )}
                  </div>
                </div>
                {brand.city && (
                  <p className="shrink-0 text-right text-[11.5px] text-ink-3">{brand.city}</p>
                )}
              </div>

              {/* --------------------------- Letterhead ------------------- */}
              <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    Statement of account
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">
                    {invoice.client.company_name}
                  </h2>
                  {invoice.client.contact_person && (
                    <p className="mt-0.5 text-sm text-ink-3">
                      Attn: {invoice.client.contact_person}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    Billing period
                  </p>
                  <p className="mt-1 font-medium text-ink">{invoice.period_label}</p>
                  <p className="mt-0.5 text-xs text-ink-3">
                    Generated {new Date(invoice.generated_at).toLocaleDateString('en-IN')}
                  </p>
                  {invoice.dispatch?.status === 'sent' && (
                    <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                      Emailed {new Date(invoice.dispatch.created_at).toLocaleDateString('en-IN')}
                    </p>
                  )}
                </div>
              </div>

              {invoice.lines.length === 0 ? (
                <EmptyState icon={FileText} title="No fuelling in this fortnight"
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
                          <Td className="font-mono font-medium text-ink">{l.license_plate}</Td>
                          <Td className="capitalize text-ink-3">{l.fuel}</Td>
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
                        <span className="text-ink-3">Total volume</span>
                        <span className="tnum text-ink-2">{litres(invoice.total_liters)}</span>
                      </div>
                      <div className="flex justify-between border-t border-line pt-2">
                        <span className="font-semibold text-ink">Amount due</span>
                        <span className="text-lg font-semibold tnum text-ink">
                          {moneyExact(invoice.subtotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 rounded-lg bg-[var(--glass-bg)] p-4 text-xs leading-relaxed text-ink-3">
                    <p>
                      Current account balance: <span className="font-medium text-ink-2 tnum">
                        {money(invoice.client.current_balance)}
                      </span> against a sanctioned limit of <span className="font-medium text-ink-2 tnum">
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
