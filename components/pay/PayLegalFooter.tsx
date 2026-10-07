import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/**
 * Legal line under every tip page. The person tipping is a consumer paying
 * Digitip a service fee, so they are owed the seller's identity and access to
 * the conditions and the privacy policy before paying (art. L.111-1 and
 * L.221-5 C. conso, art. 13 RGPD). Kept to one discreet line: it must be
 * there, not compete with the amount.
 */
export async function PayLegalFooter() {
  const t = await getTranslations('pay.legal');
  const link = { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2 } as const;
  return (
    <footer style={{ maxWidth: 480, margin: '0 auto', padding: '8px 24px 32px', textAlign: 'center', font: '400 11.5px/17px var(--font)', color: 'var(--text-3)' }}>
      <p style={{ margin: 0 }}>{t('operator')}</p>
      <p style={{ margin: '4px 0 0', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/conditions-pourboire" style={link}>{t('tipTerms')}</Link>
        <Link href="/privacy" style={link}>{t('privacy')}</Link>
        <Link href="/mentions-legales" style={link}>{t('mentions')}</Link>
      </p>
    </footer>
  );
}
