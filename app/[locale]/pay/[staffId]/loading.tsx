import { getTranslations } from 'next-intl/server';
import { Band, Headline, LogoShimmer, PayColumn, PayMain, Shimmer } from '@/components/pay/ui';

/**
 * Same geometry as the finished page, so nothing jumps when it streams in. The
 * headline is static text, so it shows straight away instead of a shimmer.
 */
export default async function Loading() {
  const t = await getTranslations('pay');
  return (
    <PayMain>
      <div aria-busy="true">
        <Band logo={<LogoShimmer />}>
          <Headline>{t('tipHeadline')}</Headline>
          <p style={{ font: '400 14px/20px var(--font)', color: 'var(--text-2)', marginTop: 4 }}>{t('tipSubhead')}</p>
        </Band>
        <PayColumn>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -56, position: 'relative' }}>
            <span className="dg-shimmer" style={{ width: 80, height: 80, borderRadius: '50%', border: '4px solid var(--bg)' }} />
            <Shimmer w={150} h={14} style={{ marginTop: 15 }} />
            <Shimmer w={170} h={24} style={{ marginTop: 10 }} />
            <Shimmer w={130} h={14} style={{ marginTop: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 20 }}>
            {[0, 1, 2].map(i => <Shimmer key={i} h={64} r={10} />)}
          </div>
          <Shimmer w={150} h={14} style={{ margin: '19px auto 0' }} />
          <Shimmer h={56} r={10} style={{ marginTop: 31 }} />
        </PayColumn>
      </div>
    </PayMain>
  );
}
