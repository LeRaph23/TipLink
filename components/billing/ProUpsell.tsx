import { Link } from '@/i18n/navigation';

/**
 * The one upsell surface, used wherever a free group meets a Pro feature.
 *
 * Deliberately a single component rather than a card per page: the offer has to
 * look the same everywhere it appears, and the two places it appears — the
 * dashboard teaser and the payroll export — were otherwise going to drift into
 * two different-looking pitches for the same 19 €.
 *
 * It always carries a destination. The version of this that shipped first on
 * the statements page was a grey sentence explaining the limit with nothing to
 * click, which is the worst shape a paywall can take: it tells someone what
 * they cannot do and then leaves them there.
 */
export function ProUpsell({
  title,
  body,
  cta,
  emphasis = 'normal',
}: {
  title: string;
  body: string;
  cta: string;
  /** 'quiet' for a limit already hit, 'normal' for an opportunity being offered. */
  emphasis?: 'normal' | 'quiet';
}) {
  const accent = emphasis === 'normal';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        background: accent
          ? 'linear-gradient(135deg, rgba(229,122,151,0.08), rgba(236,151,176,0.05))'
          : 'var(--surface)',
        border: `1px solid ${accent ? 'rgba(229,122,151,0.25)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius)',
        padding: '16px 18px',
        marginBottom: 20,
      }}
    >
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
          {title}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{body}</div>
      </div>

      <Link
        href="/dashboard/billing"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 40,
          padding: '0 16px',
          borderRadius: 10,
          border: accent ? 'none' : '1px solid var(--border)',
          background: accent ? 'var(--accent)' : 'var(--surface-2)',
          color: accent ? '#fff' : 'var(--text-2)',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {cta}
      </Link>
    </div>
  );
}
