import type { CSSProperties, ReactNode } from 'react';

/**
 * Building blocks of the tip pages (design v2, "Digitip Fondations").
 *
 * No hooks and no 'use client': the pages are edge server components and the
 * amount selector is a client one, and both draw from this file. Hover, press
 * and focus states live in globals.css (`.dg-*`), since inline styles cannot
 * express them.
 */

// ── Icons (24 grid, 1.75 stroke) ────────────────────────────────────────────
export type PayIconName =
  | 'lock' | 'card' | 'chevron' | 'check' | 'x' | 'clock' | 'alert' | 'info'
  | 'external' | 'heart' | 'star' | 'person';

export function PayIcon({
  name, size = 20, color = 'currentColor', stroke = 1.75,
}: { name: PayIconName; size?: number; color?: string; stroke?: number }) {
  const p = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const paths: Record<PayIconName, ReactNode> = {
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" {...p} /><path d="M8 11V8a4 4 0 0 1 8 0v3" {...p} /></>,
    card: <><rect x="3" y="6" width="18" height="12" rx="2" {...p} /><path d="M3 10h18M7 14h3" {...p} /></>,
    chevron: <path d="M9 6l6 6-6 6" {...p} />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" {...p} />,
    x: <path d="M7 7l10 10M17 7L7 17" {...p} />,
    clock: <><circle cx="12" cy="12" r="8" {...p} /><path d="M12 8v4l3 2" {...p} /></>,
    alert: <><circle cx="12" cy="12" r="8" {...p} /><path d="M12 8v5M12 16h.01" {...p} /></>,
    info: <><circle cx="12" cy="12" r="8" {...p} /><path d="M12 11v5M12 8h.01" {...p} /></>,
    external: <path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" {...p} />,
    heart: <path d="M12 21s-7.5-4.6-10-9.2C.6 9 1.7 5.5 4.8 4.7 6.7 4.2 8.6 5 9.6 6.4L12 9l2.4-2.6c1-1.4 2.9-2.2 4.8-1.7 3.1.8 4.2 4.3 2.8 7.1C19.5 16.4 12 21 12 21z" fill={color} stroke="none" />,
    star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill={color} stroke="none" />,
    person: <><circle cx="12" cy="8" r="3.4" {...p} /><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" {...p} /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {paths[name]}
    </svg>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="dg-spinner"
      style={{
        width: size, height: size, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
        border: '2px solid currentColor', borderRightColor: 'transparent',
      }}
    />
  );
}

// ── Buttons ────────────────────────────────────────────────────────────────
// Returned as props rather than wrapped in a component, so the same look goes
// on a <button>, a next-intl <Link> or a plain <a>.
export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type BtnSize = 'S' | 'M' | 'L';
const BTN_SIZE: Record<BtnSize, { h: number; px: number; fs: number }> = {
  S: { h: 36, px: 14, fs: 14 },
  M: { h: 44, px: 18, fs: 14 },
  L: { h: 56, px: 24, fs: 16 },
};

export function btnProps(
  variant: BtnVariant = 'primary',
  size: BtnSize = 'M',
  opts: { full?: boolean; disabled?: boolean; loading?: boolean } = {},
): { className: string; style: CSSProperties } {
  const s = BTN_SIZE[size];
  const look: Record<BtnVariant, CSSProperties> = {
    primary: { background: 'var(--accent)', color: 'var(--accent-fg)', border: '1px solid transparent' },
    secondary: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' },
    ghost: { background: 'transparent', color: 'var(--text-2)', border: '1px solid transparent' },
    danger: { background: 'var(--error)', color: 'var(--error-fg)', border: '1px solid transparent' },
  };
  const off = opts.disabled && !opts.loading;
  return {
    className: `dg-press dg-btn-${variant}`,
    style: {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      height: s.h, minHeight: s.h, padding: `0 ${s.px}px`, width: opts.full ? '100%' : 'auto',
      borderRadius: 'var(--radius-sm)', font: `600 ${s.fs}px/1 var(--font)`, whiteSpace: 'nowrap',
      textDecoration: 'none', cursor: off ? 'not-allowed' : opts.loading ? 'progress' : 'pointer',
      ...look[variant],
      ...(off ? { background: 'var(--surface-3)', color: 'var(--text-3)', borderColor: 'transparent' } : {}),
    },
  };
}

// ── Brand field ────────────────────────────────────────────────────────────
// The plaque's flat colour field, ending in the plaque's wave. One per screen,
// always at the border between the brand and the content.
export function Logo({ size = 15 }: { size?: number }) {
  return (
    <span style={{ font: `800 ${size}px/1 var(--font-logo)`, letterSpacing: '-0.03em', color: 'var(--brand)' }}>
      DigiTip
    </span>
  );
}

/** The establishment's logo when it has one, DigiTip otherwise. */
export function BrandMark({ logoUrl }: { logoUrl?: string | null }) {
  if (!logoUrl) return <Logo />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={logoUrl} alt="" height={24} style={{ height: 24, maxWidth: 120, objectFit: 'contain', display: 'block' }} />;
}

function Wave() {
  return (
    <svg viewBox="0 0 390 28" preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block', width: '100%', height: 28, marginTop: -27 }}>
      <path d="M0 10 C 120 34, 240 -8, 390 14 L390 28 L0 28 Z" fill="var(--bg)" />
    </svg>
  );
}

export function Band({
  tone = 'brand', pb = 56, logo, children,
}: {
  tone?: 'brand' | 'neutral';
  pb?: number;
  /** What sits above the headline: a mark, a shimmer, or nothing. */
  logo?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div style={{ background: tone === 'brand' ? 'var(--brand-field)' : 'var(--surface-2)', padding: `56px 24px ${pb}px`, textAlign: 'center' }}>
        {logo !== undefined && logo !== null && (
          <div style={{ marginBottom: 16, minHeight: 16, display: 'flex', justifyContent: 'center' }}>{logo}</div>
        )}
        {children}
      </div>
      <Wave />
    </>
  );
}

export function LogoShimmer() {
  return <span className="dg-shimmer" style={{ width: 72, height: 16, borderRadius: 999 }} />;
}

// ── Layout and type ────────────────────────────────────────────────────────
/** The whole tip page is one 420 px column; only the brand field is full width. */
export function PayColumn({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ maxWidth: 420, margin: '0 auto', padding: '0 20px', ...style }}>{children}</div>;
}

export function PayMain({ children, pb = 40 }: { children: ReactNode; pb?: number }) {
  return <main style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: pb }}>{children}</main>;
}

export function PayTitle({ children }: { children: ReactNode }) {
  return (
    <h1 style={{ font: '600 24px/30px var(--font-display)', letterSpacing: '-0.01em', color: 'var(--text)', textWrap: 'balance', overflowWrap: 'anywhere' }}>
      {children}
    </h1>
  );
}

export function Headline({ children }: { children: ReactNode }) {
  return <p style={{ font: '500 20px/28px var(--font-display)', color: 'var(--text)' }}>{children}</p>;
}

export function BandBody({ children }: { children: ReactNode }) {
  return <p style={{ font: '400 16px/24px var(--font)', color: 'var(--text-2)', marginTop: 8, textWrap: 'pretty' }}>{children}</p>;
}

export function Avatar({ src, alt = '', size = 80, ring = 4 }: { src?: string | null; alt?: string; size?: number; ring?: number }) {
  const box: CSSProperties = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'block',
    border: ring ? `${ring}px solid var(--bg)` : undefined, background: 'var(--surface-3)',
  };
  if (!src) {
    return (
      <span aria-hidden="true" style={{ ...box, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
        <PayIcon name="person" size={Math.round(size * 0.45)} stroke={1.6} />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} decoding="async" style={{ ...box, objectFit: 'cover' }} />;
}

export function StatusDot({ tone, icon }: { tone: 'success' | 'warning' | 'error'; icon: 'check' | 'clock' | 'x' }) {
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
      background: `var(--${tone}-bg)`, color: `var(--${tone})`, display: 'grid', placeItems: 'center',
    }}>
      {icon === 'check' ? (
        // Drawn, not stamped: the one animation of the flow, finishing as the
        // eye reaches it. No bounce, no counter: a receipt states the amount.
        <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
          <path className="dg-draw" d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <PayIcon name={icon} size={30} stroke={2} />
      )}
    </div>
  );
}

export function Secured({ children }: { children: ReactNode }) {
  return (
    <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, font: '500 12px/16px var(--font)', color: 'var(--text-3)', margin: '32px 0 0', textAlign: 'center' }}>
      <PayIcon name="lock" size={14} />{children}
    </p>
  );
}

export function Shimmer({ w, h, r = 8, style }: { w?: number | string; h: number; r?: number; style?: CSSProperties }) {
  return <span className="dg-shimmer" aria-hidden="true" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

/** Inline alert above the pay button, where the eye already is. */
export function PayError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" style={{
      display: 'flex', gap: 8, alignItems: 'center', padding: '12px 14px', borderRadius: 'var(--radius-sm)',
      background: 'var(--error-bg)', color: 'var(--error)', font: '500 14px/20px var(--font)', margin: 0,
    }}>
      <PayIcon name="alert" size={18} />{children}
    </p>
  );
}

export function DemoBadge({ children }: { children: ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', marginBottom: 16,
      borderRadius: 999, background: 'var(--surface)', color: 'var(--text-2)', font: '600 12px/16px var(--font)',
    }}>
      {children}
    </span>
  );
}
