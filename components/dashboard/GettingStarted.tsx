import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  deriveGettingStarted,
  type GettingStartedFacts,
  type GettingStartedStepId,
} from '@/lib/dashboard/getting-started';
import { cardTitleStyle } from './ui';

/**
 * What to do next, in the order it has to happen.
 *
 * A card, deliberately not a banner. The two banner registers are already
 * spoken for and the distinction is load-bearing: VerifyBanner uses a filled
 * accent ground for "you are blocked", ProUpsell an 8% tint for "here is an
 * opportunity". A third pink block stacked under those two would read as more
 * of the same noise on exactly the account that can least afford to be
 * confused. So this takes the neutral surface and earns attention from being
 * the only thing on the page that says what to do.
 *
 * It renders on /dashboard only. The layout already injects VerifyBanner
 * everywhere; a checklist that followed the manager onto every page would be
 * nagging rather than guiding.
 */
export async function GettingStarted({
  facts,
  tipUrlPath,
  locale,
}: {
  facts: GettingStartedFacts;
  tipUrlPath: string | null;
  locale: string;
}) {
  const { steps, doneCount, complete } = deriveGettingStarted(facts);

  // Nothing left to say. Same contract as VerifyBanner: the component decides
  // its own irrelevance rather than making every caller remember to check.
  if (complete) return null;

  const t = await getTranslations('dashboard.gettingStarted');

  const hrefFor: Record<GettingStartedStepId, string> = {
    verify: '/dashboard/paiements',
    team: '/dashboard/staff',
    review: '/dashboard/settings',
    firstTip: tipUrlPath ?? '/dashboard/stickers',
  };

  return (
    <section
      aria-label={t('title')}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <h2 style={cardTitleStyle}>
          {t('title')}
        </h2>
        <span style={{ fontSize: 12, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
          {t('progress', { done: doneCount, total: steps.length })}
        </span>
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {steps.map((step) => {
          const isExternalTip = step.id === 'firstTip' && Boolean(tipUrlPath);
          const label = t(`${step.id}.label`);
          const body = t(`${step.id}.body`);

          return (
            <li
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '10px 0',
                // Only the step being asked for is at full strength. A done
                // step still shows, because seeing what you finished is most of
                // what makes a checklist satisfying, but it recedes.
                opacity: step.done ? 0.55 : step.current ? 1 : 0.75,
              }}
            >
              <span
                aria-hidden
                className={step.done ? 'check-in' : undefined}
                style={{
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  marginTop: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  background: step.done ? 'var(--success-bg)' : 'var(--surface-2)',
                  color: step.done ? 'var(--success)' : 'var(--text-3)',
                  border: `1px solid ${step.done ? 'transparent' : 'var(--border)'}`,
                }}
              >
                {step.done ? '✓' : ''}
              </span>

              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: step.current ? 600 : 500,
                    color: 'var(--text)',
                    textDecoration: step.done ? 'line-through' : 'none',
                    textDecorationColor: 'var(--text-3)',
                  }}
                >
                  {label}
                </div>
                {step.current && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.55, marginTop: 3 }}>
                    {body}
                  </div>
                )}
              </div>

              {step.current && (
                isExternalTip ? (
                  // The tip page is what a customer sees, not a dashboard
                  // screen: opening it in place would strand the manager
                  // outside their own dashboard.
                  <a
                    className="btn-ghost"
                    href={`/${locale}${hrefFor[step.id]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={ctaStyle}
                  >
                    {t(`${step.id}.cta`)}
                  </a>
                ) : (
                  <Link className="btn-ghost" href={hrefFor[step.id]} style={ctaStyle}>
                    {t(`${step.id}.cta`)}
                  </Link>
                )
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const ctaStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 34,
  padding: '0 14px',
  borderRadius: 9,
  border: '1px solid var(--border)',
  background: 'var(--surface-2)',
  color: 'var(--text-2)',
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};
