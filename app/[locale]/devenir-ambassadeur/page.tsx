import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { pageAlternates } from '@/lib/seo';
import { Icon, type IconName } from '@/components/ambassadeur/icons';
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
    title: 'Programme Ambassadeurs Digitip · Activité déclarée, 35-45 € par vente',
    description:
      "Programme officiel d'ambassadeurs Digitip : une activité en micro-entreprise, encadrée et déclarée, ouverte aux étudiants, salariés, demandeurs d'emploi, indépendants et retraités actifs. Vous présentez nos SmartTags NFC à des commerces de proximité et touchez 35 à 45 € par vente. Pas de stock, pas d'avance, paiement Stripe Connect.",
    alternates: pageAlternates(locale, '/devenir-ambassadeur', ['fr']),
    openGraph: {
      title: 'Programme Ambassadeurs Digitip',
      description: 'Activité déclarée, ouverte à tous les profils · 35 à 45 € par vente · Candidature en 2 minutes.',
      locale: 'fr_FR',
      type: 'website',
    },
  };
}

type Perk = { icon: IconName; label: string; sub: string };
const PERKS: Perk[] = [
  { icon: 'wallet', label: '35 à 45 € par vente', sub: 'Solo 35 € · Duo 45 €' },
  { icon: 'gift', label: 'Bonus parrainage', sub: '+25 € par filleul · +250 € aux 10' },
  { icon: 'bank', label: 'Paiement Stripe Connect', sub: 'Dès 30 € · virement mensuel' },
  { icon: 'tag', label: 'Aucun stock à avancer', sub: '100 % en ligne, depuis le téléphone' },
];

type Step = { n: string; title: string; body: string };
const STEPS: Step[] = [
  {
    n: '01',
    title: 'Candidature',
    body: "Vous remplissez le formulaire ci-dessous. Nous examinons votre dossier sous 48 h ouvrées.",
  },
  {
    n: '02',
    title: 'Activation du compte',
    body: "Vous recevez votre code ambassadeur, votre PIN et l'accès à votre tableau de bord personnel.",
  },
  {
    n: '03',
    title: 'Démarchage encadré',
    body: "Vous présentez le SmartTag à des établissements de proximité (restaurants, bars, cafés, salons, hôtels…) à votre rythme.",
  },
  {
    n: '04',
    title: 'Commissions versées',
    body: "À chaque vente confirmée, votre commission est créditée. Retrait Stripe dès 30 € de solde.",
  },
];

type Audience = { icon: IconName; title: string; body: string };
const AUDIENCES: Audience[] = [
  {
    icon: 'users',
    title: 'Étudiants et alternants',
    body: "Une activité compatible avec les études : horaires libres, intensité ajustable selon les périodes d'examens.",
  },
  {
    icon: 'trophy',
    title: 'Jeunes diplômés',
    body: "Un premier revenu commercial pour étoffer un CV : prospection terrain, négociation, suivi client.",
  },
  {
    icon: 'wallet',
    title: 'Salariés en complément',
    body: "Un revenu d'appoint cumulable avec un CDI ou un CDD, sur le temps libre. Statut micro déclaré séparément.",
  },
  {
    icon: 'refresh',
    title: 'Reconversion et demandeurs d’emploi',
    body: "Compatible avec l’ARE / France Travail (à déclarer). Aucune avance, aucun engagement de résultat.",
  },
  {
    icon: 'tag',
    title: 'Indépendants et freelances',
    body: "Un canal de revenu supplémentaire à intégrer à une activité existante (commerciale, terrain, services).",
  },
  {
    icon: 'clock',
    title: 'Retraités actifs et parents',
    body: "Un rythme entièrement choisi, quelques heures par semaine, sans contrainte d’objectif.",
  },
];

type Trust = { icon: IconName; title: string; body: string };
const TRUST: Trust[] = [
  {
    icon: 'check',
    title: 'Activité 100 % déclarée',
    body: "Vous démarchez sous statut de micro-entrepreneur. Vos commissions sont facturées à Digitip et soumises aux cotisations URSSAF, aucun travail au noir.",
  },
  {
    icon: 'lock',
    title: 'Paiements traçables',
    body: "Les commissions transitent par Stripe Connect, prestataire bancaire agréé. Chaque versement est documenté et téléchargeable depuis le tableau de bord.",
  },
  {
    icon: 'flag',
    title: 'Engagement anti-fraude',
    body: "Charte signée à l'inscription : pas de fausses ventes, pas d'auto-utilisation du code. Tout manquement entraîne la suspension immédiate du compte.",
  },
  {
    icon: 'clock',
    title: 'Sans engagement',
    body: "Aucune obligation de résultat, aucune pénalité. Vous testez, vous décidez si cela vous correspond, vous arrêtez quand vous le souhaitez.",
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
    q: "L'activité est-elle légale et déclarée ?",
    a: (
      <>
        Oui. Vous exercez en tant que micro-entrepreneur (auto-entrepreneur) :
        <ul style={faqList}>
          <FaqBullet>Vous nous facturez vos commissions.</FaqBullet>
          <FaqBullet>Vous déclarez votre chiffre d&apos;affaires à l&apos;URSSAF et payez vos cotisations selon le régime micro.</FaqBullet>
          <FaqBullet>C&apos;est le cadre légal standard des programmes d&apos;apporteurs d&apos;affaires en France.</FaqBullet>
        </ul>
      </>
    ),
  },
  {
    q: "Faut-il déjà avoir un SIRET pour postuler ?",
    a: (
      <>
        Non, vous pouvez candidater sans SIRET. Pour démarcher activement, vous devrez avoir déclaré
        votre statut d&apos;auto-entrepreneur :
        <ul style={faqList}>
          <FaqBullet>Démarche gratuite et en ligne, environ 10 minutes sur autoentrepreneur.urssaf.fr.</FaqBullet>
          <FaqBullet>Vous pouvez démarcher dès le jour de la déclaration.</FaqBullet>
          <FaqBullet>Le numéro SIRET arrive quelques jours plus tard et sert à émettre vos factures.</FaqBullet>
        </ul>
      </>
    ),
  },
  {
    q: "Est-ce compatible avec ma situation actuelle ?",
    a: (
      <>
        Oui, dans la quasi-totalité des cas. Le statut de micro-entrepreneur est cumulable avec :
        <ul style={faqList}>
          <FaqBullet>Statut étudiant, bourse, congé parental.</FaqBullet>
          <FaqBullet>Contrat salarié (CDI/CDD) ou une autre activité indépendante.</FaqBullet>
          <FaqBullet>Allocation chômage (ARE), à déclarer mensuellement à France Travail.</FaqBullet>
          <FaqBullet>Retraite.</FaqBullet>
        </ul>
        <p style={{ margin: '10px 0 0' }}>
          Seules certaines professions réglementées (fonctionnaires, professions médicales libérales)
          ont des restrictions à vérifier. Vous gérez votre temps : nos ambassadeurs actifs y consacrent
          en moyenne 5 heures par semaine.
        </p>
      </>
    ),
  },
  {
    q: "Comment et quand suis-je payé ?",
    a: "Vous connectez votre RIB via Stripe Connect depuis votre tableau de bord. Vos commissions sont créditées automatiquement à chaque vente confirmée. Vous pouvez retirer dès 30 € de solde, dans la limite d'un virement par mois. Le virement arrive sous 2 à 5 jours ouvrés.",
  },
  {
    q: "Quel produit présente-t-on aux commerces ?",
    a: "Le SmartTag Digitip : un sticker NFC qui permet aux clients d'un établissement de laisser un pourboire sans contact directement à l'employé qui les a servis. Cible prioritaire : restaurants, bars, cafés, hôtels, salons de coiffure, instituts d'esthétique, barbiers et spas.",
  },
  {
    q: "Et si je ne réalise aucune vente ?",
    a: "Aucune obligation, aucune pénalité, aucun frais. Vous arrêtez quand vous le souhaitez, simplement en cessant l'activité ou, si vous l'aviez ouverte uniquement pour ce programme, en clôturant votre micro-entreprise (gratuit, en ligne).",
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

export default async function DevenirAmbassadeurPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '48px 20px 64px', fontFamily: 'var(--font)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Brand header */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent)', letterSpacing: '-0.03em' }}>
              Digitip
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>
              Programme Ambassadeurs · Édition 2026
            </div>
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--success)',
              background: 'var(--success-bg)',
              border: '1px solid color-mix(in oklch, var(--success) 30%, transparent)',
              padding: '6px 10px',
              borderRadius: 999,
            }}
          >
            <Icon name="check" size={12} strokeWidth={2.5} />
            Programme officiel
          </div>
        </header>

        {/* Hero */}
        <section style={{ ...card, padding: '36px 28px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 12 }}>
            Activité encadrée et déclarée · Ouverte à tous les profils
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1.1, margin: '0 0 14px', fontFamily: 'var(--font-display)' }}>
            Rejoignez le programme officiel d&apos;ambassadeurs Digitip.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.65, margin: '0 0 18px' }}>
            Vous présentez nos SmartTags NFC (un dispositif de pourboire sans contact) à des
            établissements de proximité (restaurants, bars, cafés, salons, hôtels…), et touchez
            35 à 45 € par vente.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
            {[
              'Activité en micro-entreprise',
              'Sans stock ni avance financière',
              'Sans horaires imposés',
            ].map((t) => (
              <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
                <Icon name="check" size={14} strokeWidth={2} style={{ color: 'var(--accent)' }} />
                {t}
              </li>
            ))}
          </ul>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {PERKS.map(p => (
              <div
                key={p.label}
                style={{
                  background: 'var(--surface-2)',
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
        </section>

        {/* How it works */}
        <section style={card}>
          <div style={sectionLabel}>Comment ça marche</div>
          <h2 style={sectionTitle}>Quatre étapes, encadrées de bout en bout.</h2>
          <p style={sectionLead}>De la candidature à la première commission versée, le parcours est balisé et transparent.</p>

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

        {/* Audience — explicit for school administrators */}
        <section style={card}>
          <div style={sectionLabel}>À qui s&apos;adresse le programme</div>
          <h2 style={sectionTitle}>Ouvert à tous les profils, à temps choisi.</h2>
          <p style={sectionLead}>
            Aucun prérequis de diplôme ni d&apos;âge. Le programme convient aussi bien à un premier revenu
            qu&apos;à un complément d&apos;activité sur le temps libre : vous fixez votre rythme.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
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
        </section>

        {/* Candidature form */}
        <section style={card} id="candidature">
          <div style={sectionLabel}>Candidature</div>
          <h2 style={sectionTitle}>Postulez en 2 minutes.</h2>
          <p style={sectionLead}>
            Dossier examiné sous 48 h ouvrées. Aucune information n&apos;est partagée avec des tiers.
          </p>
          <Suspense fallback={<div style={{ height: 600 }} />}>
            <RecruitmentLandingForm />
          </Suspense>
        </section>

        {/* Trust / legal framework */}
        <section style={card}>
          <div style={sectionLabel}>Cadre légal et garanties</div>
          <h2 style={sectionTitle}>Un programme transparent et traçable.</h2>
          <p style={sectionLead}>
            Toutes les conditions sont documentées : contrat d&apos;apporteur d&apos;affaires, charte anti-fraude,
            relevés Stripe téléchargeables.
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
          <h2 style={sectionTitle}>Tout ce que vous (ou vos proches) voudrez savoir.</h2>
          <p style={sectionLead}>
            Réponses détaillées sur le cadre légal, le cumul avec votre situation actuelle,
            les paiements et l&apos;engagement attendu.
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

        {/* Callout for school administrators */}
        <section
          style={{
            ...card,
            background: 'var(--accent-muted)',
            border: '1px solid var(--accent-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="share" size={18} strokeWidth={1.75} style={{ color: 'var(--accent)' }} />
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
              Établissements, missions locales, associations, France Travail
            </div>
          </div>
          <h2 style={{ ...sectionTitle, marginBottom: 8 }}>
            Vous accompagnez un public en recherche d&apos;activité&nbsp;?
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, margin: '0 0 14px' }}>
            Cette page peut être partagée telle quelle : mail, intranet, atelier d&apos;insertion, canaux d&apos;un BDE,
            d&apos;un service emploi-stage, d&apos;une mission locale ou d&apos;une structure d&apos;accompagnement.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              'Activité déclarée, sans avance financière.',
              'Compatible avec la plupart des situations : étudiants, salariés, demandeurs d’emploi, retraités.',
              'Brief sur demande : présentation, conditions, vigilance anti-fraude, contact référent.',
            ].map((t) => (
              <li key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.5 }}>
                <Icon name="check" size={15} strokeWidth={2} style={{ color: 'var(--accent)', marginTop: 2 }} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65, margin: '0 0 16px' }}>
            Pour le brief détaillé, écrivez-nous à{' '}
            <a href="mailto:contact@digitip.app?subject=Programme%20Ambassadeurs%20%C2%B7%20Demande%20institutionnelle" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              contact@digitip.app
            </a>
            . Réponse sous 48 h ouvrées.
          </p>
          <a
            href="mailto:contact@digitip.app?subject=Programme%20Ambassadeurs%20%C2%B7%20Demande%20institutionnelle"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 10,
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              fontSize: 13.5,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Demander la fiche de présentation
            <Icon name="arrowRight" size={14} strokeWidth={2} />
          </a>
        </section>

        {/* Legal footer */}
        <footer style={{ marginTop: 28, padding: '0 4px' }}>
          <p style={{ fontSize: 11.5, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
            Programme édité par YUZU LABS, SAS au capital de 100 € · SIREN 994 879 013 ·
            Siège social : 11 rue de Lorraine, 68490 Petit-Landau, France · Contact :{' '}
            <a href="mailto:contact@digitip.app" style={{ color: 'var(--text-2)' }}>contact@digitip.app</a>
            <br />
            Vos données sont traitées conformément à notre politique de confidentialité. Aucune transmission à des tiers commerciaux.
          </p>
        </footer>
      </div>
    </div>
  );
}
