import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes without conflicts. cn('p-2', cond && 'p-4') */
export const cn = (...inputs) => twMerge(clsx(inputs));

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const money = (v) => inr.format(Number(v || 0));
export const moneyExact = (v) => inrPrecise.format(Number(v || 0));

export const litres = (v) =>
  `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(Number(v || 0))} L`;

export const num = (v) => new Intl.NumberFormat('en-IN').format(Number(v || 0));

export const dateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

export const dateOnly = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

/**
 * Colour code a credit-utilisation percentage.
 *
 * `bar` uses a gradient so the meter catches light like the rest of the
 * interface; `text` lightens in dark mode, where a -600 shade reads as muddy.
 */
export const utilisationTone = (pct) => {
  if (pct >= 90) return {
    bar: 'bg-linear-to-r from-rose-400 to-rose-600',
    text: 'text-rose-700 dark:text-rose-300', label: 'Critical',
  };
  if (pct >= 75) return {
    bar: 'bg-linear-to-r from-amber-400 to-amber-600',
    text: 'text-amber-700 dark:text-amber-300', label: 'High',
  };
  if (pct >= 50) return {
    bar: 'bg-linear-to-r from-brand-400 to-brand-600',
    text: 'text-brand-700 dark:text-brand-300', label: 'Moderate',
  };
  return {
    bar: 'bg-linear-to-r from-emerald-400 to-emerald-600',
    text: 'text-emerald-700 dark:text-emerald-300', label: 'Healthy',
  };
};
