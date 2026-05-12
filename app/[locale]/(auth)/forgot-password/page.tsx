import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ForgotPasswordForm } from './ForgotPasswordForm';

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect(`/${locale}/dashboard`);

  const t = await getTranslations('auth');

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'fixed', top: '-20%', left: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'absolute', top: 16, right: 20, zIndex: 2 }}>
        <LanguageSwitcher compact />
      </div>

      <div className="fade-up" style={{ width: '100%', maxWidth: 400, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-poppins), sans-serif', fontWeight: 800, fontSize: 26, letterSpacing: '-0.03em', color: '#E57A97' }}>DigiTip</span>
          </div>
          <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text)', marginBottom: 5 }}>
            {t('forgotPasswordTitle')}
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-3)' }}>{t('forgotPasswordSubtitle')}</p>
        </div>

        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)', padding: 28,
          boxShadow: 'var(--shadow), 0 0 0 1px rgba(255,255,255,0.02)',
        }}>
          <ForgotPasswordForm locale={locale} />
        </div>
      </div>
    </main>
  );
}
