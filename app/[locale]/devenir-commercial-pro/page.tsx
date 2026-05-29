import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { pageAlternates } from '@/lib/seo';
import { Icon, type IconName } from '@/components/ambassadeur/icons';
import { CommercialRecruitmentForm } from './CommercialRecruitmentForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: 'Programme Commerciaux Pros Digitip · 50 à 65 € par vente · VRP, agents commerciaux, indépendants',
    description:
      "Programme partenaire B2B Digitip à destination des commerciaux indépendants, VRP exclusifs ou multicarte, et agents commerciaux. 50 € par pack Solo, 65 € par pack Duo. Contrat d'apporteur d'affaires, facturation B2B, paiement Stripe Connect.",
    alternates: pageAlternates(locale, '/devenir-commercial-pro', ['fr']),
    openGraph: {
      title: 'Programme Commerciaux Pros Digitip',
      description: 'Barème B2B · 50 € Solo / 65 € Duo · Contrat d\'apporteur d\'affaires · Paiement Stripe Connect.',
      locale: 'fr_FR',
      type: 'website',
    },
  };
}

type Perk = { icon: IconName; label: string; sub: string };
const PERKS: Perk[] = [
  { icon: 'wallet', label: '50 à 65 € par vente', sub: 'Solo 50 € · Duo 65 €' },
  { icon: 'bank',   label: 'Paiement Stripe Connect',  sub: 'Virement B2B, dès 30 €' },
  { icon: 'flag',   label: 'Contrat formel',           sub: 'Apporteur d\'affaires signé' },
  { icon: 'tag',    label: 'Code dédié + tracking',    sub: 'Attribution 100 % automatique' },
];

type Diff = { ambassador: string; pro: string; label: string };
const DIFFS: Diff[] = [
  { label: 'Commission Solo',     ambassador: '35 €',            pro: '50 €' },
  { label: 'Commission Duo',      ambassador: '45 €',            pro: '65 €' },
  { label: 'SIRET',               ambassador: 'Optionnel',       pro: 'Obligatoire' },
  { label: 'Forme juridique',     ambassador: 'Micro suggérée',  pro: 'Toutes (SAS, SARL, EI…)' },
  { label: 'Cadre contractuel',   ambassador: 'Charte',          pro: 'Contrat apporteur d\'affaires' },
  { label: 'Cible de recrutement',ambassador: 'Tous profils',    pro: 'VRP, agents co., indép. B2B' },
];

type Step = { n: string; title: string; body: string };
const STEPS: Step[] = [
  {
    n: '01',
    title: 'Candidature qualifiée',
    body: 'Vous remplissez le formulaire avec votre structure juridique. Étude du dossier sous 48 h ouvrées par notre direction commerciale.',
  },
  {
    n: '02',
    title: 'Signature du contrat',
    body: "Contrat d'apporteur d'affaires en bonne et due forme, signé électroniquement. Vous facturez vos commissions sous le statut juridique déclaré.",
  },
  {
    n: '03',
    title: 'Activation du code commercial',
    body: "Vous recevez votre code promo dédié et l'accès à votre tableau de bord. Votre dispositif Stripe Connect est ouvert dans la foulée.",
  },
  {
    n: '04',
    title: 'Démarchage & commissions',
    body: '50 € par pack Solo vendu, 65 € par pack Duo. Commissions créditées automatiquement à chaque vente confirmée. Virement Stripe dès 30 € de solde.',
  },
];

type Audience = { icon: IconName; title: string; body: string };
const AUDIENCES: Audience[] = [
  {
    icon: 'trophy',
    title: 'VRP exclusifs et multicartes',
    body: 'Compatible avec votre carte de représentation actuelle, en multicarte. Digitip vient compléter votre portefeuille avec un produit à fort potentiel de récurrence (SmartTags NFC).',
  },
  {
    icon: 'flag',
    title: 'Agents commerciaux indépendants',
    body: 'Une nouvelle carte à présenter à vos clients commerce / restauration. Statut d\'agent commercial inscrit au RSAC parfaitement adapté.',
  },
  {
    icon: 'users',
    title: 'Commerciaux indépendants B2B',
    body: 'Free-lances, consultants, anciens commerciaux salariés en reconversion : un produit B2B à forte conversion, ticket moyen 200-400 €.',
  },
  {
    icon: 'tag',
    title: 'Apporteurs d\'affaires structurés',
    body: 'Sociétés de prestation commerciale, agences de prospection : nous travaillons en contrat-cadre. Contactez-nous pour un dispositif sur mesure.',
  },
];

type Trust = { icon: IconName; title: string; body: string };
const TRUST: Trust[] = [
  {
    icon: 'check',
    title: 'Contrat d\'apporteur d\'affaires',
    body: "Engagement contractuel formel des deux parties, avec barème de commissions, clauses de non-exclusivité, modalités de facturation et conditions de résiliation explicites.",
  },
  {
    icon: 'lock',
    title: 'Facturation B2B claire',
    body: 'Vous nous facturez vos commissions mensuellement (ou trimestriellement) selon votre statut. TVA applicable si vous y êtes assujetti. Modèle de facture fourni.',
  },
  {
    icon: 'bank',
    title: 'Paiement Stripe Connect',
    body: "Versement automatisé via Stripe Connect dès 30 € de solde, ou virement bancaire classique sur demande pour les structures qui le préfèrent. Tous les relevés sont téléchargeables.",
  },
  {
    icon: 'flag',
    title: 'Engagement anti-fraude renforcé',
    body: "Sur ce programme à barème supérieur, tout manquement (fausse vente, auto-utilisation du code, transaction de complaisance) entraîne la résiliation immédiate du contrat et la suspension des commissions impayées.",
  },
];

const faqList: React.CSSProperties = {
  listStyle: 'none', padding: 0, margin: '8px 0 0',
  display: 'flex', flexDirection: 'column', gap: 6,
};
const faqItem: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 8,
};

function FaqBullet({ children }: { children: React.ReactNode }) {
  return (
    <li style={faqItem}>
      <Icon name="check" size={14} strokeWidth={2} style={{ color: 'var(--accent)', marginTop: 3 }} />
      <span>{children}</span>
    </li>
  );
}

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: 'Quelle différence concrète avec le programme Ambassadeurs ?',
    a: (
      <>
        Deux programmes, deux cadres :
        <ul style={faqList}>
          <FaqBullet>
            <strong>Ambassadeurs</strong> — public large (étudiants, salariés, demandeurs d&apos;emploi),
            cadre micro-entreprise simplifié, 35-45 € par vente.
          </FaqBullet>
          <FaqBullet>
            <strong>Commerciaux Pros</strong> — réservé aux commerciaux professionnels avec structure
            juridique déclarée (auto-entreprise, EI, SARL, SAS…), contrat d&apos;apporteur d&apos;affaires
            formel, barème supérieur de 50-65 € par vente.
          </FaqBullet>
        </ul>
      </>
    ),
  },
  {
    q: 'Faut-il une carte de VRP ou une inscription RSAC ?',
    a: (
      <>
        Pas obligatoirement. Le programme est ouvert à tout commercial exerçant sous un statut juridique
        déclaré : VRP statutaire, agent commercial inscrit au RSAC, auto-entrepreneur, EI, SARL, SAS.
        <ul style={faqList}>
          <FaqBullet>Le SIRET est en revanche obligatoire dès la candidature (contrairement au programme Ambassadeurs).</FaqBullet>
        </ul>
      </>
    ),
  },
  {
    q: 'Quelles sont les modalités de facturation ?',
    a: (
      <>
        Vous nous adressez une facture reprenant vos commissions de la période :
        <ul style={faqList}>
          <FaqBullet>Rythme mensuel ou trimestriel, à convenir.</FaqBullet>
          <FaqBullet>Assujetti à la TVA : vous la mentionnez. Sinon : « TVA non applicable, article 293 B du CGI ».</FaqBullet>
          <FaqBullet>Un modèle de facture est fourni à la signature du contrat.</FaqBullet>
        </ul>
      </>
    ),
  },
  {
    q: 'Comment se passe l\'attribution des ventes ?',
    a: 'Chaque commercial dispose d\'un code promo personnel (10 % de remise pour le client final) que les commerces utilisent à la commande. À chaque pack vendu avec votre code, votre commission (50 ou 65 €) est créditée automatiquement sur votre tableau de bord, en temps réel.',
  },
  {
    q: 'Y a-t-il un objectif minimum ?',
    a: 'Non, aucun quota imposé. Le contrat est sans engagement de volume et sans clause d\'exclusivité — vous pouvez le résilier à tout moment avec un préavis de 30 jours. Nous attendons en revanche un démarchage régulier et conforme à l\'image de la marque.',
  },
  {
    q: 'Quel produit présente-t-on ?',
    a: 'Le SmartTag Digitip : un sticker NFC qui permet aux clients d\'un commerce de proximité de laisser un pourboire sans contact directement à l\'employé qui les a servis. Cibles prioritaires : salons de coiffure, instituts d\'esthétique, barbiers, spas, restauration et bars. Ticket moyen 200-400 € HT, cycle de vente court (1-2 RDV).',
  },
];

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-3)',
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
  marginBottom: 14,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: 'var(--text)',
  letterSpacing: '-0.02em',
  margin: '0 0 6px',
  fontFamily: 'var(--font-display)',
};

const sectionLead: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-2)',
  lineHeight: 1.6,
  margin: '0 0 20px',
};

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-xl)',
  padding: '28px 28px',
  marginBottom: 18,
};

// Anchor target on the form section + reusable CTA used between sections so
// the form is always one click away wherever the visitor is on the (long) page.
const FORM_ANCHOR = '#candidature';

function PrimaryCta() {
  return (
    <a
      href={FORM_ANCHOR}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '13px 22px', borderRadius: 10,
        background: 'var(--accent)', color: '#fff',
        fontSize: 14, fontWeight: 700, letterSpacing: '0.01em',
        textDecoration: 'none', whiteSpace: 'nowrap',
      }}
    >
      Postuler maintenant
      <span aria-hidden="true">→</span>
    </a>
  );
}

function InlineCtaRow({ label }: { label: string }) {
  return (
    <div style={{
      marginTop: 16, display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: 14, flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{label}</span>
      <a
        href={FORM_ANCHOR}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8,
          background: 'transparent', color: 'var(--accent)',
          border: '1px solid var(--accent-border)',
          fontSize: 13, fontWeight: 700,
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}
      >
        Aller au formulaire
        <span aria-hidden="true">↓</span>
      </a>
    </div>
  );
}

export default async function DevenirCommercialProPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '48px 20px 64px', fontFamily: 'var(--font)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Brand header — tonalité B2B plus institutionnelle */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text)', letterSpacing: '-0.03em' }}>
              Digitip
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
              Programme Commerciaux Pros · Édition 2026
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--text)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              padding: '6px 12px',
              borderRadius: 4,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            B2B · Contrat formel
          </div>
        </header>

        {/* Hero — ton institutionnel, sobriété B2B */}
        <section style={{ ...card, padding: '40px 32px', background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
            Programme partenaire B2B · Barème commerciaux professionnels
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.035em', lineHeight: 1.15, margin: '0 0 14px', fontFamily: 'var(--font-display)' }}>
            Le programme partenaire pensé pour les commerciaux indépendants.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.65, margin: '0 0 18px' }}>
            Réservé aux <strong style={{ color: 'var(--text)' }}>VRP, agents commerciaux et indépendants B2B</strong> disposant
            d&apos;une structure juridique déclarée. Vous représentez nos SmartTags NFC auprès des commerces de proximité.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              <>Sous <strong style={{ color: 'var(--text)' }}>contrat d&apos;apporteur d&apos;affaires</strong> formel.</>,
              <>Barème supérieur : <strong style={{ color: 'var(--accent)' }}>50 € par pack Solo, 65 € par pack Duo.</strong></>,
            ].map((t, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                <Icon name="check" size={15} strokeWidth={2} style={{ color: 'var(--accent)', marginTop: 2 }} />
                <span>{t}</span>
              </li>
            ))}
          </ul>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {PERKS.map(p => (
              <div
                key={p.label}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 14px',
                }}
              >
                <Icon name={p.icon} size={20} strokeWidth={1.75} style={{ color: 'var(--accent)', marginBottom: 8 }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{p.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.4 }}>{p.sub}</div>
              </div>
            ))}
          </div>

          {/* Hero primary CTA — main scroll target so visitors landing on the
              page can jump straight to the form without scrolling through six
              sections of marketing copy first. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 22, flexWrap: 'wrap' }}>
            <PrimaryCta />
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              ~2 minutes · Dossier étudié sous 48 h ouvrées
            </span>
          </div>
        </section>

        {/* Différentiation programme */}
        <section style={card}>
          <div style={sectionLabel}>Comparatif des deux programmes</div>
          <h2 style={sectionTitle}>Ambassadeurs · vs · Commerciaux Pros.</h2>
          <p style={sectionLead}>
            Le programme Ambassadeurs reste accessible à tous les profils. Le programme Commerciaux Pros offre un cadre B2B
            renforcé et un barème supérieur, exclusivement pour les commerciaux professionnels.
          </p>

          <div style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--surface)' }}></th>
                  <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--surface)' }}>Ambassadeurs</th>
                  <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', background: 'var(--surface)' }}>Commerciaux Pros</th>
                </tr>
              </thead>
              <tbody>
                {DIFFS.map((d, i) => (
                  <tr key={d.label} style={{ borderTop: i === 0 ? undefined : '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '11px 14px', color: 'var(--text-3)', fontSize: 12.5 }}>{d.label}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)', fontSize: 13 }}>{d.ambassador}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text)', fontWeight: 600, fontSize: 13 }}>{d.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <InlineCtaRow label="Vous correspondez au profil ?" />
        </section>

        {/* How it works */}
        <section style={card}>
          <div style={sectionLabel}>Parcours d&apos;intégration</div>
          <h2 style={sectionTitle}>De la candidature au premier virement.</h2>
          <p style={sectionLead}>
            Un processus structuré, encadré contractuellement de bout en bout.
          </p>

          <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {STEPS.map(s => (
              <li
                key={s.n}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '44px 1fr',
                  gap: 14,
                  alignItems: 'flex-start',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 16px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--accent)',
                    background: 'var(--accent-muted)',
                    border: '1px solid var(--accent-border)',
                    borderRadius: 8,
                    height: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {s.n}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{s.body}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Audience */}
        <section style={card}>
          <div style={sectionLabel}>À qui s&apos;adresse le programme</div>
          <h2 style={sectionTitle}>Réservé aux commerciaux professionnels.</h2>
          <p style={sectionLead}>
            Vous êtes commercial à temps plein ou à temps choisi, sous statut professionnel, avec un objectif de
            chiffre d&apos;affaires structuré ? Ce programme vous concerne.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {AUDIENCES.map(a => (
              <div
                key={a.title}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 14px',
                }}
              >
                <Icon name={a.icon} size={20} strokeWidth={1.75} style={{ color: 'var(--accent)', marginBottom: 8 }} />
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{a.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{a.body}</div>
              </div>
            ))}
          </div>

          <InlineCtaRow label="Prêt à présenter votre candidature ?" />
        </section>

        {/* Candidature form */}
        <section style={{ ...card, scrollMarginTop: 24 }} id="candidature">
          <div style={sectionLabel}>Candidature</div>
          <h2 style={sectionTitle}>Dossier de candidature commerciale.</h2>
          <p style={sectionLead}>
            Réservé aux structures déclarées. Dossier étudié sous 48 h ouvrées par notre direction commerciale.
            Vos données ne sont jamais partagées avec des tiers.
          </p>
          <Suspense fallback={<div style={{ height: 800 }} />}>
            <CommercialRecruitmentForm />
          </Suspense>
        </section>

        {/* Trust / contractual framework */}
        <section style={card}>
          <div style={sectionLabel}>Cadre contractuel</div>
          <h2 style={sectionTitle}>Un cadre formel, transparent et conforme.</h2>
          <p style={sectionLead}>
            Tous les engagements des deux parties sont documentés et signés. Les paiements transitent par un
            prestataire bancaire agréé (Stripe Connect).
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {TRUST.map(t => (
              <div
                key={t.title}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Icon name={t.icon} size={18} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{t.title}</div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{t.body}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section style={card}>
          <div style={sectionLabel}>Questions fréquentes</div>
          <h2 style={sectionTitle}>Tout ce que les commerciaux pros nous demandent.</h2>
          <p style={sectionLead}>
            Si une question reste sans réponse, écrivez-nous directement à{' '}
            <a href="mailto:partenaires@digitip.app" style={{ color: 'var(--accent)', fontWeight: 600 }}>partenaires@digitip.app</a>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FAQ.map(f => (
              <details
                key={f.q}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 16px',
                }}
              >
                <summary
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text)',
                    cursor: 'pointer',
                    listStyle: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <span>{f.q}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: 18, lineHeight: 1, flexShrink: 0 }}>+</span>
                </summary>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65, marginTop: 10 }}>
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* Legal footer */}
        <footer style={{ marginTop: 28, padding: '0 4px' }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
            Programme édité par YUZU LABS, SAS au capital de 100 € · SIREN 994 879 013 ·
            Siège social : 11 rue de Lorraine, 68490 Petit-Landau, France · Contact partenaires :{' '}
            <a href="mailto:partenaires@digitip.app" style={{ color: 'var(--text-2)' }}>partenaires@digitip.app</a>
            <br />
            Vos données sont traitées conformément à notre politique de confidentialité. Aucune transmission à des tiers commerciaux.
          </p>
        </footer>
      </div>
    </div>
  );
}
