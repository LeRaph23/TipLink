import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { pageAlternates } from '@/lib/seo';
import { ContactForm } from './ContactForm';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: pageAlternates(locale, '/contact'),
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('contact');
  const tc = await getTranslations('common');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ position: 'fixed', top: '-10%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 48px', position: 'relative', zIndex: 10,
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em', color: '#E57A97' }}>DigiTip</span>
        </Link>
        <nav style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <LanguageSwitcher />
          <Link href="/pricing" style={{
            padding: '7px 14px', textDecoration: 'none',
            color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 500,
          }}>{tc('pricing')}</Link>
        </nav>
      </header>

      <main style={{ maxWidth: 520, margin: '0 auto', padding: '40px 24px 80px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(99,102,241,0.85)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>{t('kicker')}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 3.4vw, 38px)', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 14 }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-3)', lineHeight: 1.7 }}>
            {t('subtitle')}
          </p>
        </div>

        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 28,
          boxShadow: 'var(--shadow)',
        }}>
          <ContactForm locale={locale} />
        </div>
      </main>
    </div>
  );
}
