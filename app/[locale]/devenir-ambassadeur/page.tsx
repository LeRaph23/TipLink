import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { RecruitmentLandingForm } from './RecruitmentLandingForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Devenir ambassadeur Digitip · 25-35€ par vente',
  description: 'Rejoins le programme ambassadeur Digitip : tu places des SmartTags NFC chez des restos et tu touches 25-35€ par vente. Pas de stock, pas d\'avance. SIRET requis.',
  openGraph: {
    title: 'Deviens ambassadeur Digitip',
    description: '25-35€ par vente. Pas de stock. SIRET requis.',
    locale: 'fr_FR',
    type: 'website',
  },
};

const PERKS = [
  { icon: '💰', label: '25-35€ par vente', sub: 'Solo 25€ · Duo 35€' },
  { icon: '🎁', label: 'Bonus parrainage', sub: '+25€ par filleul · +250€ aux 10' },
  { icon: '⚡', label: 'Virement Stripe', sub: 'Dès 30€ · 1×/mois max' },
  { icon: '📱', label: '0 stock', sub: 'Tout en ligne, depuis ton tel' },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Faut-il avoir un SIRET ?',
    a: 'Oui, obligatoire. Si tu n\'en as pas, crée-le gratuitement en 10 min sur autoentrepreneur.urssaf.fr (statut auto-entrepreneur / micro-entreprise). C\'est instantané.',
  },
  {
    q: 'Comment je suis payé ?',
    a: 'Tu connectes ton RIB via Stripe Connect depuis ton dashboard. Tu peux retirer ton blé dès 30€ de solde, dans la limite d\'un virement par mois. Le virement arrive sous 2-5 jours ouvrés.',
  },
  {
    q: 'Combien de temps ça prend ?',
    a: 'C\'est toi qui décides. Nos meilleurs ambassadeurs (BTS NDRC en alternance) bossent ~5h/semaine et font 8-12 ventes. Soit ~250-400€/semaine en plus.',
  },
  {
    q: 'Quel est le produit que je vends ?',
    a: 'SmartTag : un sticker NFC qui permet aux clients de laisser un pourboire sans contact directement aux employés. Cible : restos, bars, salons de coiffure, taxis VTC.',
  },
  {
    q: 'Et si je ne fais aucune vente ?',
    a: 'Aucune obligation, aucune pénalité. Tu testes, tu vois si ça te plaît, tu arrêtes quand tu veux.',
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
            Gagne 25-35€ par vente,<br />depuis ton téléphone.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 0 24px' }}>
            Rejoins l&apos;équipe Digitip. Tu places des SmartTags NFC (pourboires sans contact) chez des restos, bars, coiffeurs.
            Pas de stock à avancer, pas d&apos;horaires imposés. Tu factures via micro-entreprise, on s&apos;occupe du reste.
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
          Ton dossier sera examiné sous 48h. Pas de spam, pas de partage de tes données.
        </p>
      </div>
    </div>
  );
}
