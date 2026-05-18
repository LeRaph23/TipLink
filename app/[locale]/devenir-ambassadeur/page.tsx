import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { pageAlternates } from '@/lib/seo';
import { RecruitmentLandingForm } from './RecruitmentLandingForm';

export const dynamic = 'force-dynamic';

// FR-only page: /en/devenir-ambassadeur returns 404 (notFound() below), so the
// canonical/hreflang alternates only advertise the French version.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Devenir ambassadeur Digitip · 25-35€ par vente',
    description: "Rejoignez le programme ambassadeur Digitip : vous placez des SmartTags NFC chez des coiffeurs, instituts et restaurants et touchez 25-35€ par vente. Pas de stock, pas d'avance. SIRET requis.",
    alternates: pageAlternates(locale, '/devenir-ambassadeur', ['fr']),
    openGraph: {
      title: 'Devenez ambassadeur Digitip',
      description: '25-35€ par vente. Pas de stock. SIRET requis.',
      locale: 'fr_FR',
      type: 'website',
    },
  };
}

const PERKS = [
  { icon: '💰', label: '25-35€ par vente', sub: 'Solo 25€ · Duo 35€' },
  { icon: '🎁', label: 'Bonus parrainage', sub: '+25€ par filleul · +250€ aux 10' },
  { icon: '⚡', label: 'Virement Stripe', sub: 'Dès 30€ · 1×/mois max' },
  { icon: '📱', label: '0 stock', sub: 'Tout en ligne, depuis votre téléphone' },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Faut-il avoir un SIRET ?',
    a: 'Oui, obligatoire. Si vous n\'en avez pas, créez-le gratuitement en 10 min sur autoentrepreneur.urssaf.fr (statut auto-entrepreneur / micro-entreprise). C\'est instantané.',
  },
  {
    q: 'Comment suis-je payé ?',
    a: 'Vous connectez votre RIB via Stripe Connect depuis votre tableau de bord. Vous pouvez retirer vos gains dès 30€ de solde, dans la limite d\'un virement par mois. Le virement arrive sous 2-5 jours ouvrés.',
  },
  {
    q: 'Combien de temps cela prend-il ?',
    a: 'C\'est vous qui décidez. Nos meilleurs ambassadeurs (BTS NDRC en alternance) travaillent environ 5h par semaine et réalisent 8 à 12 ventes, soit environ 250-400€ par semaine en complément.',
  },
  {
    q: 'Quel est le produit que je vends ?',
    a: 'SmartTag : un sticker NFC qui permet aux clients de laisser un pourboire sans contact directement aux employés. Cible prioritaire : salons de coiffure et instituts d\'esthétique. Ensuite : barbiers, spas, restaurants, bars.',
  },
  {
    q: 'Et si je ne réalise aucune vente ?',
    a: 'Aucune obligation, aucune pénalité. Vous testez, vous voyez si cela vous convient, vous arrêtez quand vous le souhaitez.',
  },
];

export default async function DevenirAmbassadeurPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '40px 20px', fontFamily: 'var(--font)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent)', letterSpacing: '-0.03em', marginBottom: 4 }}>
            DigiTip
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Programme Ambassadeurs
          </div>
        </div>

        {/* Hero */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)', padding: '36px 28px', marginBottom: 20,
        }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1.1, margin: '0 0 12px' }}>
            Gagnez 25-35€ par vente.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 24px' }}>
            Rejoignez l&apos;équipe Digitip. Vous placez des SmartTags NFC (pourboires sans contact) en priorité chez des coiffeurs et instituts d&apos;esthétique.
            Pas de stock à avancer, pas d&apos;horaires imposés. Vous facturez via micro-entreprise, nous nous occupons du reste.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
            {PERKS.map(p => (
              <div key={p.label} style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 14, textAlign: 'center',
              }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{p.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{p.sub}</div>
              </div>
            ))}
          </div>

          <Suspense fallback={<div style={{ height: 600 }} />}>
            <RecruitmentLandingForm />
          </Suspense>
        </div>

        {/* FAQ */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-xl)', padding: '24px 28px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            FAQ
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {FAQ.map(f => (
              <details key={f.q} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <summary style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
                  {f.q}
                </summary>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginTop: 8 }}>
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', marginTop: 12 }}>
          Votre dossier sera examiné sous 48h. Pas de spam, pas de partage de vos données.
        </p>
      </div>
    </div>
  );
}
