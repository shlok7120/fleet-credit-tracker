import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Fuel, Lock, User, ShieldCheck, TriangleAlert, Sparkles, ArrowRight } from 'lucide-react';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext';
import { Button, Input, Label, Alert, ThemeToggle } from '../components/ui';

/**
 * Quick-fill buttons so local development does not depend on remembering
 * passwords. Rendered ONLY in development — `import.meta.env.DEV` is true
 * under `npm run dev` and false in any production build, so Vite strips this
 * block (and the credentials in it) out of the deployed bundle entirely.
 * Publishing working admin credentials on a public login page would hand
 * every visitor the whole ledger.
 */
const DEMO_ACCOUNTS = [
  { role: 'Pump Admin',     username: 'admin',        password: 'admin123',     dot: 'bg-brand-500' },
  { role: 'Fleet Manager',  username: 'mgr_bluestar', password: 'manager123',   dot: 'bg-violet-500' },
  { role: 'Pump Attendant', username: 'sunita',       password: 'attendant123', dot: 'bg-emerald-500' },
];

const FEATURES = [
  [ShieldCheck,    'Live credit exposure',   'Every fleet’s balance against its sanctioned limit, updated as fuel is dispensed.'],
  [TriangleAlert,  'Fraud caught at the pump', 'An anomaly model scores each fill the moment it is logged, and explains itself.'],
  [Sparkles,       'Demand forecasting',     'ARIMA projects the next fortnight so stock and credit lines are never a surprise.'],
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in? Never show the login form again.
  if (user) return <Navigate to={HOME_FOR_ROLE[user.role] || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const result = await login(form.username.trim(), form.password);
    setBusy(false);

    if (result.ok) navigate(HOME_FOR_ROLE[result.user.role] || '/', { replace: true });
    else setError(result.error);
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
      <div className="absolute right-5 top-5 z-10">
        <ThemeToggle />
      </div>

      {/* The right column is shorter in production, where the dev-only demo
          block is stripped out. Without a floor on the card height the brand
          column's justify-between collapses and the footer collides with the
          feature list. */}
      <div className="glass animate-rise grid w-full max-w-5xl overflow-hidden lg:min-h-[600px] lg:grid-cols-[1.05fr_1fr]">
        {/* --------------------------- Brand panel --------------------------- */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
          {/* Colour wash confined to this half, so the form side stays calm. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-linear-to-br from-brand-500/18 via-accent-500/12 to-emerald-500/12"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -left-16 -top-16 size-72 rounded-full bg-brand-500/25 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -right-10 size-80 rounded-full bg-accent-500/20 blur-3xl"
          />

          <div className="relative flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-xl bg-linear-to-br from-brand-400 to-brand-600 text-white shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_20px_-8px_var(--color-brand-600)]">
              <Fuel className="size-5" strokeWidth={2.2} />
            </div>
            <span className="text-base font-semibold tracking-[-0.02em] text-ink">FleetCredit</span>
          </div>

          <div className="relative">
            <h1 className="max-w-sm text-[34px] font-semibold leading-[1.12] tracking-[-0.035em] text-ink">
              The credit ledger,
              <br />
              finally off paper.
            </h1>
            <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-ink-2">
              Track every litre dispensed to every corporate fleet, watch credit
              limits in real time, and let the anomaly model catch the fills
              that should never have happened.
            </p>

            <div className="mt-9 space-y-4">
              {FEATURES.map(([Icon, title, body]) => (
                <div key={title} className="flex gap-3.5">
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl glass-quiet text-brand-500">
                    <Icon className="size-4" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">{title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink-3">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="relative pt-10 text-[11px] text-ink-3">
            Corporate Fleet Credit Tracker · Internship Project
          </p>
        </div>

        {/* ---------------------------- Form panel --------------------------- */}
        <div className="relative flex items-center border-t border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-8 sm:p-10 lg:border-l lg:border-t-0">
          <div className="w-full">
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <div className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-brand-400 to-brand-600 text-white">
                <Fuel className="size-[18px]" strokeWidth={2.2} />
              </div>
              <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">FleetCredit</span>
            </div>

            <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-ink">Sign in</h2>
            <p className="mt-1 text-[13px] text-ink-3">
              Use your pump-issued credentials to continue.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                  <Input
                    id="username"
                    autoComplete="username"
                    autoFocus
                    className="h-11 pl-10"
                    placeholder="admin"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    error={!!error}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    className="h-11 pl-10"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    error={!!error}
                    required
                  />
                </div>
              </div>

              {error && (
                <Alert tone="red">
                  <span className="flex items-center gap-2">
                    <TriangleAlert className="size-4 shrink-0" />
                    {error}
                  </span>
                </Alert>
              )}

              <Button type="submit" size="lg" className="w-full" loading={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
                {!busy && <ArrowRight className="size-4" />}
              </Button>
            </form>

            {import.meta.env.DEV && (
              <div className="glass-quiet mt-8 p-3">
                <p className="px-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                  Demo accounts
                  <span className="font-normal normal-case tracking-normal"> · local only</span>
                </p>
                <div className="mt-2 space-y-0.5">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.username}
                      type="button"
                      onClick={() => { setForm({ username: a.username, password: a.password }); setError(''); }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left
                                 transition-colors hover:bg-[var(--glass-bg-hover)]"
                    >
                      <span className={`size-1.5 shrink-0 rounded-full ${a.dot}`} />
                      <span className="flex-1 text-[13px] font-medium text-ink">{a.role}</span>
                      <span className="font-mono text-[11px] text-ink-3">{a.username}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
