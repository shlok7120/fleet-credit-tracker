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

/** Colour code a credit-utilisation percentage. */
export const utilisationTone = (pct) => {
  if (pct >= 90) return { bar: 'bg-rose-500',   text: 'text-rose-600',   label: 'Critical' };
  if (pct >= 75) return { bar: 'bg-amber-500',  text: 'text-amber-600',  label: 'High' };
  if (pct >= 50) return { bar: 'bg-brand-500',  text: 'text-brand-600',  label: 'Moderate' };
  return           { bar: 'bg-emerald-500', text: 'text-emerald-600', label: 'Healthy' };
};
