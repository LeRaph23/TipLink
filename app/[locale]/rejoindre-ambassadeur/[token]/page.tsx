import { notFound } from 'next/navigation';
import { RecruitmentForm } from './RecruitmentForm';

export const dynamic = 'force-dynamic';

export default async function RecruitmentPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { token } = await params;
  const expected = process.env.AMBASSADOR_RECRUITMENT_TOKEN;
  if (!expected || token !== expected) notFound();

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg)',
      padding: '40px 20px',
      fontFamily: 'var(--font)',
    }}>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent)', letterSpacing: '-0.03em', marginBottom: 4 }}>
            DigiTip
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Programme Ambassadeurs · Inscription
          </div>
        </div>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)',
          padding: '32px 28px',
        }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>
            Devenez ambassadeur DigiTip
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 20px' }}>
            Vous touchez <strong>35 €</strong> par vente Solo et <strong>45 €</strong> par vente Duo,
            plus jusqu&apos;à <strong>100 €</strong> de bonus hebdomadaire et <strong>200 €</strong> pour le n°1 du mois.
          </p>

          <RecruitmentForm token={token} />
        </div>

        <p style={{ marginTop: 24, fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center' }}>
          Votre dossier sera examiné sous 48h. Pas de spam, pas de partage de vos données.
        </p>
      </div>
    </div>
  );
}
