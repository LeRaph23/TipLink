'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTransition } from 'react';
import { routing, type Locale } from '@/i18n/routing';

type Props = {
  compact?: boolean;
  /**
   * Colour source.
   *
   * 'auto' (the default) follows the app theme through the same CSS variables
   * everything else uses, so the control is legible in light and dark without
   * the caller having to know which is active. The two fixed values remain for
   * surfaces whose colour does not follow the theme, such as the landing
   * header, which is white in both.
   *
   * It used to default to 'dark', and eleven of the thirteen call sites took
   * that default while sitting on the light theme the app ships with. The
   * inactive language then rendered as rgba(255,255,255,0.55) on #f6f6f8 — a
   * contrast ratio of roughly 1.05:1, which is to say invisible, on the login
   * page, the order wizard, the pricing page and the dashboard sidebar.
   */
  variant?: 'auto' | 'dark' | 'light';
};

export function LanguageSwitcher({ compact = false, variant = 'auto' }: Props) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('common');

  const switchTo = (next: Locale) => {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  };

  const isLight = variant === 'light';
  const isAuto = variant === 'auto';

  const colors = isAuto
    ? {
        border: 'var(--border)',
        activeBg: 'var(--accent-muted)',
        activeFg: 'var(--accent)',
        idleFg: 'var(--text-3)',
      }
    : isLight
      ? {
          border: '#e4e4ec',
          activeBg: 'color-mix(in oklch, #E57A97 12%, transparent)',
          activeFg: '#E57A97',
          idleFg: '#74748a',
        }
      : {
          border: 'rgba(255,255,255,0.1)',
          activeBg: 'rgba(99,102,241,0.2)',
          activeFg: '#a5b4fc',
          idleFg: 'rgba(255,255,255,0.55)',
        };

  return (
    <div
      role="group"
      aria-label={t('language')}
      style={{
        display: 'inline-flex',
        borderRadius: 8,
        border: `1px solid ${colors.border}`,
        overflow: 'hidden',
        opacity: isPending ? 0.6 : 1,
        transition: 'opacity 150ms',
      }}
    >
      {routing.locales.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => switchTo(l)}
            aria-pressed={active}
            style={{
              padding: compact ? '4px 8px' : '6px 12px',
              fontSize: compact ? 11 : 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              background: active ? colors.activeBg : 'transparent',
              color: active ? colors.activeFg : colors.idleFg,
              border: 'none',
              cursor: active ? 'default' : 'pointer',
              fontFamily: 'var(--font)',
            }}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
