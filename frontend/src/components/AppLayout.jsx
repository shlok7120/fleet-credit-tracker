import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Fuel, LayoutDashboard, Building2, TriangleAlert, Truck,
  FileText, LogOut, Gauge, Settings,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { cn } from '../lib/utils';
import { ThemeToggle, Avatar } from './ui';

/** Which sidebar links each role is allowed to see. */
const NAV_BY_ROLE = {
  admin: [
    { to: '/admin',          label: 'Overview',     icon: LayoutDashboard, end: true },
    { to: '/admin/clients',  label: 'Clients',      icon: Building2 },
    { to: '/admin/alerts',   label: 'Fraud alerts', icon: TriangleAlert },
    { to: '/dispenser',      label: 'Dispenser',    icon: Gauge },
    { to: '/admin/settings', label: 'Settings',     icon: Settings },
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

/**
 * The mark, reused in the sidebar and on the login screen.
 *
 * Shows the pump's own name and uploaded logo when they have been set, and
 * falls back to the product name and fuel glyph before then.
 */
export const Logo = ({ size = 'md' }) => {
  const { pump_name, oil_company, logo } = useBranding();
  const box = size === 'sm' ? 'size-8 rounded-xl' : 'size-9 rounded-xl';
  const icon = size === 'sm' ? 'size-4' : 'size-[18px]';

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div
        className={cn(
          box, 'grid shrink-0 place-items-center overflow-hidden',
          logo
            ? 'glass-quiet'
            : 'text-white bg-linear-to-br from-brand-400 to-brand-600 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_6px_16px_-6px_var(--color-brand-600)]'
        )}
      >
        {logo
          ? <img src={logo} alt="" className="size-full object-contain p-1" />
          : <Fuel className={icon} strokeWidth={2.2} />}
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[14px] font-semibold tracking-[-0.02em] text-ink">
          {pump_name}
        </p>
        {oil_company && (
          <p className="truncate text-[10.5px] text-ink-3">{oil_company}</p>
        )}
      </div>
    </div>
  );
};

const navClasses = ({ isActive }) =>
  cn(
    'group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium',
    'transition-all duration-200',
    isActive
      ? 'text-ink bg-[var(--glass-bg-strong)] border border-[var(--glass-border)] shadow-[0_1px_0_var(--glass-specular)_inset]'
      : 'text-ink-2 border border-transparent hover:text-ink hover:bg-[var(--glass-bg)]'
  );

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = NAV_BY_ROLE[user.role] || [];

  const signOut = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div className="flex min-h-full gap-0 md:gap-4 md:p-4">
      {/* ------------------------------ Sidebar ------------------------------ */}
      <aside className="no-print glass sticky top-4 hidden h-[calc(100vh-2rem)] w-60 shrink-0 flex-col md:flex">
        <div className="px-5 pt-5 pb-4">
          <Logo />
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navClasses}>
              {({ isActive }) => (
                <>
                  {/* Active marker: a small luminous bar on the leading edge. */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full',
                      'bg-linear-to-b from-brand-400 to-brand-600 transition-opacity duration-200',
                      isActive ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <Icon className={cn('size-4 transition-colors', isActive && 'text-brand-500')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-3">
          <div className="glass-quiet flex items-center gap-2.5 p-2.5">
            <Avatar src={user.avatar} name={user.full_name} size="sm" className="rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-ink">{user.full_name}</p>
              <p className="truncate text-[11px] text-ink-3">
                {user.designation || ROLE_LABEL[user.role]}
              </p>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={signOut}
              className="flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium
                         text-ink-2 transition-colors hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-300"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* -------------------------------- Main ------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile bar */}
        <header className="no-print glass sticky top-0 z-30 mb-3 flex items-center justify-between rounded-none px-4 py-3 md:hidden">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={signOut} className="grid size-9 place-items-center rounded-xl glass-quiet text-ink-2">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="no-print scroll-thin mb-3 flex gap-1.5 overflow-x-auto px-3 md:hidden">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors',
                  isActive
                    ? 'glass-quiet text-ink'
                    : 'text-ink-2'
                )
              }
            >
              <Icon className="size-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="min-w-0 flex-1 px-4 pb-4 md:px-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Standard page heading used by every screen. */
export const PageHeader = ({ title, description, actions }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-4 px-1 pt-1 md:px-0">
    <div className="animate-fade-up">
      <h1 className="text-[22px] font-semibold tracking-[-0.025em] text-ink md:text-[26px]">
        {title}
      </h1>
      {description && (
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-3">{description}</p>
      )}
    </div>
    {actions && <div className="no-print flex items-center gap-2">{actions}</div>}
  </div>
);
