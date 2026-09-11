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
    bar: 'bg-linear-to-r from-orange-400 to-orange-600',
    text: 'text-orange-700 dark:text-orange-300', label: 'High',
  };
  // Sky rather than brand: with an amber brand, a "Moderate" bar in brand
  // colours would read as decoration instead of as a reading on a scale.
  if (pct >= 50) return {
    bar: 'bg-linear-to-r from-sky-400 to-sky-600',
    text: 'text-sky-700 dark:text-sky-300', label: 'Moderate',
  };
  return {
    bar: 'bg-linear-to-r from-emerald-400 to-emerald-600',
    text: 'text-emerald-700 dark:text-emerald-300', label: 'Healthy',
  };
};
