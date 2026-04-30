'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTransition } from 'react';
import { routing, type Locale } from '@/i18n/routing';

type Props = {
  compact?: boolean;
};

export function LanguageSwitcher({ compact = false }: Props) {
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

  return (
    <div
      role="group"
      aria-label={t('language')}
      style={{
        display: 'inline-flex',
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
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
              background: active ? 'var(--accent-muted)' : 'transparent',
              color: active ? 'var(--accent)' : 'var(--text-3)',
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
