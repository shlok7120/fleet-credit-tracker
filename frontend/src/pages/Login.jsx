import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Fuel, Lock, User, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useAuth, HOME_FOR_ROLE } from '../context/AuthContext';
import { Button, Input, Label, Alert } from '../components/ui';

/** Quick-fill buttons so a demo/viva does not depend on remembering passwords. */
const DEMO_ACCOUNTS = [
  { role: 'Pump Admin',     username: 'admin',        password: 'admin123',     tone: 'text-brand-600' },
  { role: 'Fleet Manager',  username: 'mgr_bluestar', password: 'manager123',   tone: 'text-violet-600' },
  { role: 'Pump Attendant', username: 'sunita',       password: 'attendant123', tone: 'text-emerald-600' },
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
    <div className="min-h-full grid lg:grid-cols-2">
      {/* ---------------------------- Brand panel ---------------------------- */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #1d66f1 0%, transparent 45%), radial-gradient(circle at 80% 70%, #059669 0%, transparent 45%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Fuel className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FleetCredit</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            The credit ledger, finally off paper.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Track every litre dispensed to every corporate fleet, watch credit
            limits in real time, and let the anomaly model catch the fills that
            should never have happened.
          </p>

          <div className="mt-8 space-y-3">
            {[
              ['Live credit exposure across all fleets', ShieldCheck],
              ['Machine-learning fraud alerts on every fill', TriangleAlert],
              ['Monthly invoices generated automatically', Fuel],
            ].map(([text, Icon]) => (
              <div key={text} className="flex items-center gap-3 text-sm text-slate-300">
                <Icon className="size-4 shrink-0 text-brand-300" />
                {text}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-500">
          Corporate Fleet Credit Tracker · Internship Project
        </p>
      </div>

      {/* ----------------------------- Login form ---------------------------- */}
      <div className="flex items-center justify-center bg-slate-100 px-6 py-12">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 lg:hidden flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white">
              <Fuel className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">FleetCredit</span>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use your pump-issued credentials to continue.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="username"
                  autoComplete="username"
                  autoFocus
                  className="pl-9"
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
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="pl-9"
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
            </Button>
          </form>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Demo accounts
            </p>
            <div className="mt-2.5 space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.username}
                  type="button"
                  onClick={() => { setForm({ username: a.username, password: a.password }); setError(''); }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  <span className={`text-sm font-medium ${a.tone}`}>{a.role}</span>
                  <span className="font-mono text-xs text-slate-400">{a.username}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
