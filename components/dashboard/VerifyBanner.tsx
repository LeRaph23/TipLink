import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { EstablishmentPayability } from '@/lib/stripe/establishment-account';

/**
 * The one thing standing between a manager and their first euro, said loudly
 * on every dashboard page.
 *
 * Loud on purpose. The information existed before, as a grey dot on
 * /dashboard/paiements, which is a page nobody visits until they already
 * suspect something is wrong. A tag that cannot take payments is not a status
 * to report, it is a shop with the shutters down, so this uses a filled accent
 * ground rather than the 8% tint the upsell card uses: the two must never be
 * mistaken for each other.
 *
 * The hook is the money when there is money. Tips that arrived and could not
 * be transferred are the argument that no wording beats, and `heldCents` is
 * read from transactions that genuinely never moved, so the figure is owed
 * rather than estimated. With nothing held the copy stays neutral instead of
 * inventing urgency.
 */
export async function VerifyBanner({
  payability,
  locale,
}: {
  payability: EstablishmentPayability;
  locale: string;
}) {
  if (payability.state === 'ready') return null;

  const t = await getTranslations('dashboard.verifyBanner');
  const { state, heldCents } = payability;

  const held =
    heldCents > 0
      ? new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: heldCents % 100 === 0 ? 0 : 2,
        }).format(heldCents / 100)
      : null;

  // 'verifying' is the one state where nothing is asked of the manager, so it
  // gets a calmer ground and no call to action that would only lead to a form
  // already filled in.
  const waiting = state === 'verifying';

  const title = held
    ? t('titleHeld', { amount: held })
    : waiting
      ? t('titleVerifying')
      : t('titleBlocked');

  const body = waiting
    ? t('bodyVerifying')
    : state === 'not_started'
      ? t('bodyNotStarted')
      : t('bodyIncomplete');

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        flexWrap: 'wrap',
        background: waiting ? 'var(--surface-2)' : 'linear-gradient(135deg, #E57A97, #EC97B0)',
        border: waiting ? '1px solid var(--border)' : 'none',
        borderRadius: 'var(--radius)',
        padding: '15px 18px',
        marginBottom: 18,
        boxShadow: waiting ? 'none' : '0 6px 22px rgba(229,122,151,0.28)',
      }}
    >
      <span aria-hidden style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>
        {waiting ? '⏳' : '🔒'}
      </span>

      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div
          style={{
            fontSize: 14.5,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            color: waiting ? 'var(--text)' : '#fff',
            marginBottom: 3,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.55,
            color: waiting ? 'var(--text-3)' : 'rgba(255,255,255,0.92)',
          }}
        >
          {body}
        </div>
      </div>

      {!waiting && (
        <Link
          href="/dashboard/paiements"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 42,
            padding: '0 18px',
            borderRadius: 11,
            background: '#fff',
            color: '#B8496C',
            fontSize: 13.5,
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {state === 'not_started' ? t('ctaStart') : t('ctaResume')}
        </Link>
      )}
    </div>
  );
}
