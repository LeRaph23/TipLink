import type { CSSProperties, ReactNode } from 'react';

/**
 * The three levels every manager screen is built from.
 *
 * Seventeen pages each declared their own page title in inline styles, all of
 * them within a point or two of one another and none of them agreeing on
 * spacing. That is most of why the dashboard reads flat: with a page title at
 * 19px and a card title at 14px, and no level in between, a screen with three
 * cards on it is three things of equal weight and nothing saying which one the
 * page is about.
 *
 * So: page (one per screen), section (a group of cards, distinctly subordinate
 * to the page title), card (one thing). The section level is the one that was
 * missing entirely.
 *
 * These stay unstyled beyond that. The brief was to fix the hierarchy, not to
 * redesign anything: same surfaces, same borders, same accent.
 */

// ── Page ────────────────────────────────────────────────────────────────────
export function PageHeader({
  title,
  subtitle,
  action,
  back,
  children,
  style,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Sits opposite the title, and wraps under it when there is no room. */
  action?: ReactNode;
  /** The way out of a detail screen, above the title where one is expected. */
  back?: ReactNode;
  /** Anything that belongs to the header itself, below the subtitle. */
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 26,
        ...style,
      }}
    >
      <div style={{ minWidth: 0 }}>
        {back && <div style={{ marginBottom: 10 }}>{back}</div>}
        <h1 style={{
          fontSize: 21, fontWeight: 700, color: 'var(--text)',
          letterSpacing: '-0.03em', lineHeight: 1.25, margin: 0,
        }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{
            fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.55,
            margin: '5px 0 0', maxWidth: '62ch',
          }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </header>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────
/**
 * The level that did not exist. Deliberately a small uppercase label rather
 * than a second heading: it has to group without competing with the page
 * title, and anything set in sentence case at 15 or 16px starts arguing with
 * the h1 above it.
 */
export function SectionTitle({
  children,
  action,
  style,
}: {
  children: ReactNode;
  action?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: 12, marginBottom: 10, ...style,
    }}>
      <h2 style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0,
      }}>
        {children}
      </h2>
      {action}
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
/**
 * `accent` is for an offer, never for a warning: the filled accent ground
 * belongs to VerifyBanner and means "you are blocked". Two registers, kept
 * apart on purpose.
 */
export function Card({
  children,
  tone = 'plain',
  padded = true,
  style,
  className,
}: {
  children: ReactNode;
  tone?: 'plain' | 'accent';
  padded?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const accent = tone === 'accent';
  return (
    <div
      className={className}
      style={{
        background: accent
          ? 'linear-gradient(135deg, rgba(229,122,151,0.08), rgba(236,151,176,0.05))'
          : 'var(--surface)',
        border: `1px solid ${accent ? 'rgba(229,122,151,0.25)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius)',
        padding: padded ? 18 : 0,
        marginBottom: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A card's own title. The third level, and the smallest of the three. */
export const cardTitleStyle: CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  color: 'var(--text)',
  letterSpacing: '-0.01em',
  margin: 0,
};
