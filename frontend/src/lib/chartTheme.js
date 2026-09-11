import { useEffect, useState } from 'react';

/**
 * Recharts styles its SVG through props, not CSS classes, so it cannot inherit
 * the theme the way the rest of the app does. This reads the live design
 * tokens off <html> and re-reads them whenever the theme attribute changes,
 * which keeps every chart in step with light/dark instead of leaving hardcoded
 * hex values behind that only look right in one theme.
 */
const readTokens = () => {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (cs.getPropertyValue(name) || fallback).trim();

  return {
    axis:   v('--color-ink-3', '#8b95ab'),
    grid:   v('--color-line-soft', 'rgba(15,23,42,0.06)'),
    brand:  v('--color-brand-500', '#3d69fb'),
    accent: v('--color-accent-500', '#f2683f'),
    muted:  v('--color-ink-2', '#55607a'),
    ink:    v('--color-ink', '#0b1220'),

    /** Passed to <Tooltip contentStyle>. */
    tooltip: {
      borderRadius: 12,
      border: `1px solid ${v('--glass-border', 'rgba(255,255,255,0.7)')}`,
      background: v('--glass-bg-strong', 'rgba(255,255,255,0.9)'),
      backdropFilter: 'blur(14px) saturate(180%)',
      WebkitBackdropFilter: 'blur(14px) saturate(180%)',
      boxShadow: '0 10px 30px -10px rgba(15,23,42,0.30)',
      color: v('--color-ink', '#0b1220'),
      fontSize: 12,
      padding: '8px 12px',
    },

    /** Hover backdrop behind a bar/column. */
    cursor: v('--glass-bg', 'rgba(255,255,255,0.5)'),
  };
};

export const useChartTheme = () => {
  const [tokens, setTokens] = useState(readTokens);

  useEffect(() => {
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return tokens;
};

/** Shared axis props, so every chart in the app has identical tick styling. */
export const axisProps = (theme, fontSize = 11) => ({
  tick: { fontSize, fill: theme.axis },
  axisLine: false,
  tickLine: false,
});
