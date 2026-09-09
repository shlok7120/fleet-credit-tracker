/**
 * The FleetCredit component library.
 *
 * Everything the app renders comes from here, so the whole product looks like
 * one designed thing rather than nine separately-built screens. The visual
 * language ("liquid glass") lives in index.css; this file composes it.
 */
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '../../lib/utils';

/* ============================================================ Card ====== */
export const Card = ({ className, interactive = false, ...props }) => (
  <div
    className={cn('glass', interactive && 'glass-interactive', className)}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }) => (
  <div className={cn('flex items-start justify-between gap-4 px-5 pt-5 pb-3', className)} {...props} />
);

export const CardTitle = ({ className, ...props }) => (
  <h3 className={cn('text-[13px] font-semibold tracking-[-0.01em] text-ink', className)} {...props} />
);

export const CardDescription = ({ className, ...props }) => (
  <p className={cn('mt-1 text-xs leading-relaxed text-ink-3', className)} {...props} />
);

export const CardContent = ({ className, ...props }) => (
  <div className={cn('px-5 pb-5', className)} {...props} />
);

/* ========================================================== Button ====== */
const BUTTON_VARIANTS = {
  /* A solid, saturated pill. The gloss overlay (below) gives it the same
     lit-from-above quality as the glass panels it sits on. */
  primary:
    'text-white bg-linear-to-b from-brand-500 to-brand-600 ' +
    'shadow-[0_1px_0_rgba(255,255,255,0.35)_inset,0_6px_18px_-6px_var(--color-brand-600)] ' +
    'hover:from-brand-400 hover:to-brand-600',
  secondary:
    'text-ink glass-quiet hover:bg-[var(--glass-bg-hover)] border border-[var(--glass-border)]',
  ghost:
    'text-ink-2 hover:text-ink hover:bg-[var(--glass-bg)]',
  danger:
    'text-white bg-linear-to-b from-rose-500 to-rose-600 ' +
    'shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_6px_18px_-6px_#e11d48] hover:from-rose-400',
  success:
    'text-white bg-linear-to-b from-emerald-500 to-emerald-600 ' +
    'shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_6px_18px_-6px_#059669] hover:from-emerald-400',
};

const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-2xl',
  xl: 'h-14 px-8 text-base gap-2.5 rounded-2xl',
};

export const Button = ({
  variant = 'primary', size = 'md', className, loading = false, disabled, children, ...props
}) => (
  <button
    disabled={disabled || loading}
    className={cn(
      'group relative inline-flex select-none items-center justify-center overflow-hidden',
      'font-medium tracking-[-0.01em] whitespace-nowrap',
      'transition-[transform,box-shadow,background-color,color] duration-200 ease-out',
      'active:scale-[0.975] disabled:pointer-events-none disabled:opacity-45',
      BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className
    )}
    {...props}
  >
    {/* Light sweeping across the surface on hover. Purely decorative. */}
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 -left-full w-1/2 skew-x-[-20deg]
                 bg-white/25 opacity-0 group-hover:opacity-100
                 group-hover:[animation:sheen_0.9s_ease-out]"
    />
    {loading && <Spinner className="size-4" />}
    {children}
  </button>
);

/* =========================================================== Input ====== */
export const Label = ({ className, ...props }) => (
  <label className={cn('mb-1.5 block text-[13px] font-medium text-ink-2', className)} {...props} />
);

const FIELD_BASE =
  'w-full rounded-xl px-3.5 py-2.5 text-sm text-ink ' +
  'bg-[var(--field-bg)] backdrop-blur-md ' +
  'border border-[var(--field-border)] shadow-[var(--field-shadow)] ' +
  'placeholder:text-ink-3 transition-[border-color,box-shadow,background-color] duration-200 ' +
  'hover:border-[color-mix(in_srgb,var(--color-brand-500)_35%,var(--field-border))] ' +
  'focus:outline-none focus:border-brand-500 ' +
  'focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-brand-500)_16%,transparent)]';

export const Input = ({ className, error, ...props }) => (
  <input
    className={cn(FIELD_BASE, error && 'border-rose-400/70 focus:border-rose-500', className)}
    {...props}
  />
);

export const Select = ({ className, children, ...props }) => (
  <select className={cn(FIELD_BASE, 'cursor-pointer pr-8', className)} {...props}>
    {children}
  </select>
);

/* =========================================================== Badge ====== */
/* A -600 text shade has enough contrast on white but goes muddy against the
   dark canvas, so each tone lightens by two steps in dark mode. */
const BADGE_TONES = {
  slate:  'bg-[var(--glass-bg-strong)] text-ink-2 ring-[var(--glass-border)]',
  brand:  'bg-brand-500/12   text-brand-700   dark:text-brand-300   ring-brand-500/25',
  green:  'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25',
  amber:  'bg-amber-500/14   text-amber-700   dark:text-amber-300   ring-amber-500/25',
  red:    'bg-rose-500/12    text-rose-700    dark:text-rose-300    ring-rose-500/25',
  violet: 'bg-violet-500/12  text-violet-700  dark:text-violet-300  ring-violet-500/25',
};

export const Badge = ({ tone = 'slate', className, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium',
      'ring-1 ring-inset backdrop-blur-sm whitespace-nowrap',
      BADGE_TONES[tone], className
    )}
    {...props}
  />
);

/* ========================================================= Spinner ====== */
export const Spinner = ({ className }) => (
  <svg className={cn('size-5 animate-spin', className)} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-95" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
  </svg>
);

export const PageLoader = ({ label = 'Loading…' }) => (
  <div className="flex flex-col items-center justify-center gap-4 py-28">
    <div className="grid size-12 place-items-center rounded-2xl glass animate-pulse-ring">
      <Spinner className="size-5 text-brand-500" />
    </div>
    <p className="text-sm text-ink-3">{label}</p>
  </div>
);

/* =========================================================== Table ====== */
export const Table = ({ className, ...props }) => (
  <div className="scroll-thin overflow-x-auto">
    <table className={cn('w-full border-collapse text-sm', className)} {...props} />
  </div>
);

export const Th = ({ className, ...props }) => (
  <th
    className={cn(
      'whitespace-nowrap border-b border-line px-4 py-3 text-left',
      'text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3',
      className
    )}
    {...props}
  />
);

export const Td = ({ className, ...props }) => (
  <td className={cn('border-b border-line-soft px-4 py-3.5 text-ink-2', className)} {...props} />
);

/** Applies the hover treatment consistently to every data row. */
export const Tr = ({ className, ...props }) => (
  <tr
    className={cn(
      'transition-colors duration-150 hover:bg-[var(--glass-bg)]',
      'last:[&>td]:border-b-0',
      className
    )}
    {...props}
  />
);

export const EmptyState = ({ icon: Icon, title, hint }) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
    {Icon && (
      <div className="grid size-12 place-items-center rounded-2xl glass-quiet">
        <Icon className="size-5 text-ink-3" strokeWidth={1.75} />
      </div>
    )}
    <p className="text-sm font-medium text-ink">{title}</p>
    {hint && <p className="max-w-xs text-xs leading-relaxed text-ink-3">{hint}</p>}
  </div>
);

/* ======================================================== StatCard ====== */
const STAT_TONES = {
  brand:  ['text-brand-500',   'from-brand-500/22   to-brand-500/5'],
  green:  ['text-emerald-500', 'from-emerald-500/22 to-emerald-500/5'],
  amber:  ['text-amber-500',   'from-amber-500/22   to-amber-500/5'],
  red:    ['text-rose-500',    'from-rose-500/22    to-rose-500/5'],
  violet: ['text-violet-500',  'from-violet-500/22  to-violet-500/5'],
};

export const StatCard = ({ icon: Icon, label, value, sub, tone = 'brand', className }) => {
  const [fg, bg] = STAT_TONES[tone] ?? STAT_TONES.brand;
  return (
    <Card interactive className={cn('overflow-hidden p-5', className)}>
      {/* A faint wash of the tone colour, so the four KPI cards read as a set
          of distinct measures at a glance rather than four identical boxes. */}
      <div
        aria-hidden
        className={cn('pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-linear-to-br blur-2xl', bg)}
      />
      <div className="relative flex items-start gap-3.5">
        {Icon && (
          <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl glass-quiet', fg)}>
            <Icon className="size-[18px]" strokeWidth={2} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-ink-3">{label}</p>
          <p className="tnum mt-1.5 truncate text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink">
            {value}
          </p>
          {sub && <p className="mt-2 text-[11.5px] leading-snug text-ink-3">{sub}</p>}
        </div>
      </div>
    </Card>
  );
};

/* ===================================================== ProgressBar ====== */
export const ProgressBar = ({ value, tone = 'bg-brand-500', className }) => (
  <div
    className={cn(
      'h-2 w-full overflow-hidden rounded-full',
      'bg-[var(--track)] shadow-[inset_0_1px_2px_rgba(15,23,42,0.10)]',
      className
    )}
  >
    <div
      className={cn('h-full rounded-full transition-[width] duration-700 ease-out', tone)}
      style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
    />
  </div>
);

/* =========================================================== Alert ====== */
const ALERT_TONES = {
  red:   'bg-rose-500/10    border-rose-500/25    text-rose-700    dark:text-rose-300',
  amber: 'bg-amber-500/10   border-amber-500/25   text-amber-700   dark:text-amber-300',
  green: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300',
  brand: 'bg-brand-500/10   border-brand-500/25   text-brand-700   dark:text-brand-300',
};

export const Alert = ({ tone = 'red', title, children, className }) => (
  <div
    className={cn(
      'rounded-xl border px-4 py-3 text-[13px] leading-relaxed backdrop-blur-sm',
      ALERT_TONES[tone], className
    )}
  >
    {title && <p className="mb-0.5 font-semibold">{title}</p>}
    {children}
  </div>
);

/* ===================================================== ThemeToggle ====== */
const THEME_KEY = 'fct_theme';

/** Reads and writes the theme on <html data-theme>, matching index.html. */
export const useTheme = () => {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'light'
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  }, [theme]);

  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
};

export const ThemeToggle = ({ className }) => {
  const [theme, toggle] = useTheme();
  const dark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      title={dark ? 'Switch to light' : 'Switch to dark'}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn(
        'relative grid size-9 place-items-center rounded-xl glass-quiet',
        'text-ink-2 transition-colors hover:text-ink hover:bg-[var(--glass-bg-hover)]',
        className
      )}
    >
      <Sun
        className={cn('absolute size-4 transition-all duration-300',
          dark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')}
      />
      <Moon
        className={cn('absolute size-4 transition-all duration-300',
          dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0')}
      />
    </button>
  );
};

/* ========================================================== Avatar ====== */
const AVATAR_SIZES = {
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-xs',
  lg: 'size-16 text-lg',
  xl: 'size-24 text-2xl',
};

/** Falls back to initials on a brand gradient when there is no photo. */
export const Avatar = ({ src, name = '', size = 'md', className }) => {
  const initials = name
    .split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white',
        'bg-linear-to-br from-brand-500 to-accent-600',
        'ring-1 ring-[var(--glass-border)] shadow-[0_1px_0_rgba(255,255,255,0.35)_inset]',
        AVATAR_SIZES[size], className
      )}
    >
      {src
        ? <img src={src} alt={name} className="size-full object-cover" />
        : <span>{initials}</span>}
    </div>
  );
};

/* ========================================================== Switch ====== */
export const Switch = ({ checked, onChange, disabled, label, hint, id }) => (
  <label
    htmlFor={id}
    className={cn(
      'flex items-start justify-between gap-4 rounded-xl px-3 py-2.5 transition-colors',
      disabled ? 'opacity-50' : 'cursor-pointer hover:bg-[var(--glass-bg)]'
    )}
  >
    <span className="min-w-0">
      <span className="block text-[13px] font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-3">{hint}</span>}
    </span>

    <span className="relative mt-0.5 shrink-0">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={cn(
          'block h-6 w-10 rounded-full transition-colors duration-200',
          'bg-[var(--track)] peer-checked:bg-brand-500',
          'peer-focus-visible:outline peer-focus-visible:outline-2',
          'peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500'
        )}
      />
      <span
        className={cn(
          'pointer-events-none absolute left-0.5 top-0.5 size-5 rounded-full bg-white',
          'shadow-[0_1px_3px_rgba(15,23,42,0.35)] transition-transform duration-200',
          checked && 'translate-x-4'
        )}
      />
    </span>
  </label>
);

/* ============================================================ Tabs ====== */
export const Tabs = ({ tabs, active, onChange, className }) => (
  <div className={cn('glass-quiet inline-flex gap-1 p-1', className)}>
    {tabs.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        onClick={() => onChange(id)}
        className={cn(
          'relative flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium',
          'transition-all duration-200 whitespace-nowrap',
          active === id
            ? 'bg-[var(--glass-bg-strong)] text-ink shadow-[0_1px_0_var(--glass-specular)_inset]'
            : 'text-ink-2 hover:text-ink'
        )}
      >
        {Icon && <Icon className="size-4" />}
        {label}
      </button>
    ))}
  </div>
);

/* ==================================================== Section header ==== */
export const FieldRow = ({ children, className }) => (
  <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>
);
