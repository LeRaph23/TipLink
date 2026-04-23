import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';

export default async function LocaleNotFound() {
  const t = await getTranslations('notFound');
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px', textAlign: 'center',
    }}>
      <div className="fade-up">
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 96, fontWeight: 800, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.04)', lineHeight: 1, marginBottom: 16, userSelect: 'none' }}>
          404
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>{t('title')}</h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 320, lineHeight: 1.7, marginBottom: 28 }}>
          {t('description')}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Link href="/" style={{
            padding: '9px 18px', borderRadius: 'var(--radius)',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
          }}>← {t('home')}</Link>
          <Link href="/login" style={{
            padding: '9px 18px', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 13.5, fontWeight: 500, textDecoration: 'none',
          }}>{t('login')}</Link>
        </div>
      </div>
    </main>
  );
}
