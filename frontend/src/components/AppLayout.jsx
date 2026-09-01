import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Fuel, LayoutDashboard, Building2, TriangleAlert, Truck,
  FileText, LogOut, Gauge,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/utils';

/** Which sidebar links each role is allowed to see. */
const NAV_BY_ROLE = {
  admin: [
    { to: '/admin',          label: 'Overview',     icon: LayoutDashboard, end: true },
    { to: '/admin/clients',  label: 'Clients',      icon: Building2 },
    { to: '/admin/alerts',   label: 'Fraud alerts', icon: TriangleAlert },
    { to: '/dispenser',      label: 'Dispenser',    icon: Gauge },
  ],
  manager: [
    { to: '/fleet',          label: 'My fleet',     icon: LayoutDashboard, end: true },
    { to: '/fleet/vehicles', label: 'Vehicles',     icon: Truck },
    { to: '/fleet/invoice',  label: 'Invoices',     icon: FileText },
  ],
  attendant: [
    { to: '/dispenser',      label: 'Dispenser',    icon: Gauge, end: true },
  ],
};

const ROLE_LABEL = {
  admin: 'Pump Admin',
  manager: 'Fleet Manager',
  attendant: 'Pump Attendant',
};

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = NAV_BY_ROLE[user.role] || [];

  const signOut = () => { logout(); navigate('/login', { replace: true }); };

  const initials = user.full_name
    .split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="flex min-h-full">
      {/* ------------------------------ Sidebar ------------------------------ */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white">
            <Fuel className="size-4" />
          </div>
          <span className="font-semibold tracking-tight text-slate-900">FleetCredit</span>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{user.full_name}</p>
              <p className="truncate text-xs text-slate-500">{ROLE_LABEL[user.role]}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ------------------------------- Main -------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg bg-brand-600 text-white">
              <Fuel className="size-3.5" />
            </div>
            <span className="font-semibold text-slate-900">FleetCredit</span>
          </div>
          <button onClick={signOut} className="text-slate-500 hover:text-rose-600">
            <LogOut className="size-5" />
          </button>
        </header>

        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden scroll-thin">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600'
                )
              }
            >
              <Icon className="size-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto scroll-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Standard page heading used by every screen. */
export const PageHeader = ({ title, description, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);
