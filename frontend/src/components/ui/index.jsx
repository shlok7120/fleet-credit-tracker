/**
 * A small, hand-rolled component library in the shadcn/ui style.
 *
 * Everything the app needs — cards, buttons, inputs, badges, tables — lives
 * here so every screen looks like it was designed by the same person.
 */
import { cn } from '../../lib/utils';

/* ------------------------------------------------------------------ Card */
export const Card = ({ className, ...props }) => (
  <div
    className={cn(
      'rounded-xl border border-slate-200 bg-white shadow-sm',
      className
    )}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }) => (
  <div className={cn('flex items-start justify-between gap-4 px-5 pt-5 pb-3', className)} {...props} />
);

export const CardTitle = ({ className, ...props }) => (
  <h3 className={cn('text-sm font-semibold tracking-tight text-slate-900', className)} {...props} />
);

export const CardDescription = ({ className, ...props }) => (
  <p className={cn('mt-0.5 text-xs text-slate-500', className)} {...props} />
);

export const CardContent = ({ className, ...props }) => (
  <div className={cn('px-5 pb-5', className)} {...props} />
);

/* ---------------------------------------------------------------- Button */
const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:outline-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-slate-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:outline-rose-600 shadow-sm',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:outline-emerald-600 shadow-sm',
};

const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  xl: 'h-14 px-8 text-lg gap-2.5',
};

export const Button = ({
  variant = 'primary', size = 'md', className, loading = false, disabled, children, ...props
}) => (
  <button
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2',
      'disabled:opacity-50 disabled:pointer-events-none',
      BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className
    )}
    {...props}
  >
    {loading && <Spinner className="size-4" />}
    {children}
  </button>
);

/* ----------------------------------------------------------------- Input */
export const Label = ({ className, ...props }) => (
  <label className={cn('block text-sm font-medium text-slate-700 mb-1.5', className)} {...props} />
);

export const Input = ({ className, error, ...props }) => (
  <input
    className={cn(
      'w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-slate-900',
      'placeholder:text-slate-400 transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
      error
        ? 'border-rose-400 focus:border-rose-500'
        : 'border-slate-300 focus:border-brand-500',
      className
    )}
    {...props}
  />
);

export const Select = ({ className, children, ...props }) => (
  <select
    className={cn(
      'w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900',
      'focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30',
      className
    )}
    {...props}
  >
    {children}
  </select>
);

/* ----------------------------------------------------------------- Badge */
const BADGE_TONES = {
  slate:   'bg-slate-100 text-slate-700 ring-slate-200',
  brand:   'bg-brand-50 text-brand-700 ring-brand-200',
  green:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber:   'bg-amber-50 text-amber-700 ring-amber-200',
  red:     'bg-rose-50 text-rose-700 ring-rose-200',
  violet:  'bg-violet-50 text-violet-700 ring-violet-200',
};

export const Badge = ({ tone = 'slate', className, ...props }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
      BADGE_TONES[tone], className
    )}
    {...props}
  />
);

/* --------------------------------------------------------------- Spinner */
export const Spinner = ({ className }) => (
  <svg className={cn('animate-spin size-5', className)} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-90" fill="currentColor"
      d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
  </svg>
);

export const PageLoader = ({ label = 'Loading…' }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
    <Spinner className="size-7 text-brand-500" />
    <p className="text-sm">{label}</p>
  </div>
);

/* ----------------------------------------------------------------- Table */
export const Table = ({ className, ...props }) => (
  <div className="overflow-x-auto scroll-thin">
    <table className={cn('w-full text-sm', className)} {...props} />
  </div>
);

export const Th = ({ className, ...props }) => (
  <th
    className={cn(
      'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider',
      'text-slate-500 border-b border-slate-200 whitespace-nowrap',
      className
    )}
    {...props}
  />
);

export const Td = ({ className, ...props }) => (
  <td className={cn('px-4 py-3 border-b border-slate-100 text-slate-700', className)} {...props} />
);

export const EmptyState = ({ icon: Icon, title, hint }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
    {Icon && <Icon className="size-8 text-slate-300" />}
    <p className="text-sm font-medium text-slate-600">{title}</p>
    {hint && <p className="text-xs text-slate-400 max-w-xs">{hint}</p>}
  </div>
);

/* --------------------------------------------------------------- StatCard */
export const StatCard = ({ icon: Icon, label, value, sub, tone = 'brand', className }) => {
  const tones = {
    brand:  'bg-brand-50 text-brand-600',
    green:  'bg-emerald-50 text-emerald-600',
    amber:  'bg-amber-50 text-amber-600',
    red:    'bg-rose-50 text-rose-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <Card className={cn('p-5', className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tones[tone])}>
            <Icon className="size-4.5" strokeWidth={2.2} />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900 tnum">
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
        </div>
      </div>
    </Card>
  );
};

/* ------------------------------------------------------------- ProgressBar */
export const ProgressBar = ({ value, tone = 'bg-brand-500', className }) => (
  <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-200', className)}>
    <div
      className={cn('h-full rounded-full transition-all duration-500', tone)}
      style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
    />
  </div>
);

/* ------------------------------------------------------------------ Alert */
export const Alert = ({ tone = 'red', title, children, className }) => {
  const tones = {
    red:   'bg-rose-50 border-rose-200 text-rose-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    brand: 'bg-brand-50 border-brand-200 text-brand-800',
  };
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone], className)}>
      {title && <p className="font-semibold mb-0.5">{title}</p>}
      {children}
    </div>
  );
};
