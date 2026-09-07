'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { dismissProNudge } from '@/actions/group';
import { ProUpsell } from './ProUpsell';

/**
 * The Pro nudge, with a way to make it go away.
 *
 * An upsell that cannot be closed stops being a suggestion after the second
 * viewing. Closing it holds it for a month, which is also how long it takes
 * for the number it carries to become a different number, so it comes back
 * saying something new rather than repeating itself.
 *
 * It disappears on click rather than waiting for the round trip. The write is
 * a preference on a promotional card: if it fails, the worst outcome is the
 * card returning on the next visit, and blocking the close on a network call
 * would be worse than that.
 */
export function DismissibleProUpsell({
  groupId,
  title,
  body,
  cta,
}: {
  groupId: string;
  title: string;
  body: string;
  cta: string;
}) {
  const t = useTranslations('common');
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();

  if (hidden) return null;

  return (
    <div style={{ position: 'relative' }}>
      <ProUpsell title={title} body={body} cta={cta} />
      <button
        type="button"
        aria-label={t('close')}
        onClick={() => {
          setHidden(true);
          startTransition(() => { void dismissProNudge(groupId); });
        }}
        style={{
          position: 'absolute', top: 8, right: 8,
          width: 26, height: 26, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', fontSize: 15, lineHeight: 1,
          fontFamily: 'var(--font)',
        }}
      >
        ×
      </button>
    </div>
  );
}
