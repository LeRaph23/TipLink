'use client';

import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: number;
  format: 'currency' | 'count';
  locale: string;
  currency?: string;
  sub?: string;
  trend?: number;
  trendLabel?: string;
}

export function StatCard({ label, value, format, locale, currency = 'EUR', sub, trend, trendLabel }: Props) {
  const fmt = format === 'currency'
    ? new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 })
    : new Intl.NumberFormat(locale);

  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      raf = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 800);
      setDisplay(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div className="lift" style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: 20,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {format === 'currency' ? fmt.format(display) : fmt.format(Math.round(display))}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 500, color: trend >= 0 ? 'var(--success)' : 'var(--error)', display: 'flex', alignItems: 'center', gap: 3 }}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% {trendLabel}
        </div>
      )}
    </div>
  );
}
