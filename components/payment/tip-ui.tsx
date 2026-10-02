'use client';

import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { PayIcon, Spinner, btnProps } from '@/components/pay/ui';

/**
 * Client pieces shared by the single-person and the team tip flows, so the two
 * checkouts cannot drift apart again (design v2: amount tile, text field, pay
 * button, each with its hover / pressed / focus / disabled / loading states).
 */

// ── Amount tiles ───────────────────────────────────────────────────────────
// Selection never rests on colour alone: 2 px border, rose 50 fill, rose 700
// figure and a tick, plus aria-pressed for screen readers.
export function AmountTiles({
  amounts, isActive, onPick, format, label,
}: {
  amounts: number[];
  isActive: (amount: number) => boolean;
  onPick: (amount: number) => void;
  format: (amount: number) => string;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(amounts.length, 4)}, minmax(0, 1fr))`, gap: 8, marginTop: 20 }}
    >
      {amounts.map(amt => {
        const active = isActive(amt);
        return (
          <button
            key={amt}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(amt)}
            className="dg-press dg-tile"
            style={{
              position: 'relative', height: 64, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: active ? 'var(--accent-muted)' : 'var(--surface)',
              color: active ? 'var(--accent-text)' : 'var(--text)',
              font: '600 24px/1 var(--font-display)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
            }}
          >
            {format(amt)}
            {active && (
              <span style={{
                position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%',
                background: 'var(--accent)', color: 'var(--accent-fg)', display: 'grid', placeItems: 'center',
              }}>
                <PayIcon name="check" size={12} stroke={2.5} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Underlined text action: "Montant personnalisé", "Payer par carte". */
export function TextAction({ onClick, icon, children }: { onClick: () => void; icon?: 'card'; children: ReactNode }) {
  return (
    <button
      type="button"
      className="dg-link"
      onClick={onClick}
      style={{
        minHeight: 44, alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 12px',
        background: 'none', border: 'none', cursor: 'pointer', font: '600 14px/20px var(--font)',
      }}
    >
      {icon && <PayIcon name={icon} size={18} />}
      {children}
    </button>
  );
}

// ── Text field ─────────────────────────────────────────────────────────────
export function PayField({
  id, label, ariaLabel, prefix, error, ...input
}: {
  id: string;
  label?: string;
  ariaLabel?: string;
  prefix?: string;
  error?: string | null;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'prefix' | 'style' | 'className'>) {
  const errorId = `${id}-error`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label htmlFor={id} style={{ font: '500 14px/20px var(--font)', color: 'var(--text-2)' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {prefix && (
          <span aria-hidden="true" style={{ position: 'absolute', left: 14, top: 0, bottom: 0, display: 'flex', alignItems: 'center', font: '500 16px var(--font)', color: 'var(--text-3)', pointerEvents: 'none' }}>
            {prefix}
          </span>
        )}
        <input
          id={id}
          aria-label={ariaLabel}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className="dg-field"
          {...input}
          style={{
            width: '100%', height: 48, padding: prefix ? '0 14px 0 34px' : '0 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: input.disabled ? 'var(--surface-2)' : 'var(--surface)',
            color: input.disabled ? 'var(--text-3)' : 'var(--text)', font: '400 16px var(--font)', outline: 'none',
          }}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" style={{ display: 'flex', gap: 6, alignItems: 'center', font: '500 12px/16px var(--font)', color: 'var(--error)', margin: 0 }}>
          <PayIcon name="alert" size={14} />{error}
        </p>
      )}
    </div>
  );
}

// ── Tip summary ────────────────────────────────────────────────────────────
// What the customer is about to be charged, as a short receipt: tip, service
// fee, total charged. It was one 12 px grey sentence, the smallest text on the
// screen for the one figure that reassures (UI/UX audit, UX-04).
export function TipSummary({
  labels, tip, fee, total, perPerson, info, infoLabel, marginTop,
}: {
  /** Row labels, already translated. */
  labels: { tip: string; fee: string; total: string };
  tip: string;
  fee: string;
  total: string;
  /** Team tip shared between several people, already formatted ("≈ 2,50 € / pers"). */
  perPerson?: string | null;
  info: string;
  infoLabel: string;
  marginTop: number;
}) {
  const [open, setOpen] = useState(false);
  const row = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    font: '400 14px/20px var(--font)', color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums',
  } as const;
  return (
    <div style={{ marginTop, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={row}>
        <span>
          {labels.tip}
          {perPerson && <span style={{ color: 'var(--text-3)' }}> · {perPerson}</span>}
        </span>
        <span>{tip}</span>
      </div>
      <div style={row}>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {labels.fee}
          {/* 44 × 44 px touch target around a 16 px glyph. */}
          <button
            type="button"
            aria-expanded={open}
            aria-label={infoLabel}
            onClick={() => setOpen(v => !v)}
            style={{
              width: 44, height: 44, margin: '-12px -10px -12px -6px', display: 'grid', placeItems: 'center',
              background: 'none', border: 'none', cursor: 'pointer', color: open ? 'var(--accent)' : 'var(--text-3)',
            }}
          >
            <PayIcon name="info" size={16} />
          </button>
        </span>
        <span>{fee}</span>
      </div>
      {open && (
        <p className="dg-reveal" style={{
          font: '400 14px/20px var(--font)', color: 'var(--text-2)', background: 'var(--surface-2)',
          borderRadius: 'var(--radius-sm)', padding: '12px 14px', margin: '4px 0',
        }}>
          {info}
        </p>
      )}
      <div style={{
        ...row, marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border)',
        font: '600 16px/22px var(--font)', color: 'var(--text)',
      }}>
        <span>{labels.total}</span>
        <span key={total} className="amount-tick">{total}</span>
      </div>
    </div>
  );
}

/** Stands where the pay buttons will be until an amount is valid. */
export function SelectPrompt({ children }: { children: ReactNode }) {
  return (
    <p style={{
      marginTop: 16, textAlign: 'center', padding: 16, borderRadius: 'var(--radius-sm)',
      background: 'var(--surface-2)', color: 'var(--text-3)', font: '500 14px/20px var(--font)',
    }}>
      {children}
    </p>
  );
}

// ── Pay button (large primary) ─────────────────────────────────────────────
export function PayButton({
  onClick, disabled, loading, children,
}: { onClick: () => void; disabled?: boolean; loading?: boolean; children: ReactNode }) {
  const b = btnProps('primary', 'L', { full: true, disabled, loading });
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={b.className}
      style={b.style}
    >
      {loading && <Spinner size={18} />}
      {children}
    </button>
  );
}

// ── Theme ──────────────────────────────────────────────────────────────────
/**
 * The site theme, as set on <html>. A black wallet button on a near-black page
 * has no visible edge, so the express checkout follows this to go white.
 */
export function useSiteTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const html = document.documentElement;
    const read = () => setTheme(html.dataset.theme === 'dark' ? 'dark' : 'light');
    read();
    const observer = new MutationObserver(read);
    observer.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
