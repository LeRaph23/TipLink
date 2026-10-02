import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { JsonLd } from '@/lib/seo/JsonLd';
import { BASE_URL, buildPageMetadata, breadcrumbList, faqPage, jsonLdGraph, webPage } from '@/lib/seo';
import { HELP_CONTACT, HELP_ENTRIES } from '@/content/aide';
import { HelpCenter } from '@/components/help/HelpCenter';
import { TutorialVideo } from '@/components/landing/TutorialVideo';

// FR-only, like the other content hubs: the tutorials and the screens it
// describes are the French UI.
export function generateStaticParams() {
  return [{ locale: 'fr' }];
}

const TITLE = 'Aide Digitip : plaque, Stripe, équipe, code email';
const DESCRIPTION =
  "Bloqué à une étape ? Activation de la plaque, NFC, code par email, vérification Stripe, invitation de l'équipe : toutes les réponses, étape par étape.";

const TUTORIALS = [
  { src: '/tutos/activer-plaque', title: 'Activer ma plaque' },
  { src: '/tutos/activer-paiements', title: 'Activer les paiements' },
  { src: '/tutos/ajouter-equipe', title: 'Ajouter mon équipe' },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (locale !== 'fr') return {};
  return buildPageMetadata({ locale, path: '/aide', title: TITLE, description: DESCRIPTION, locales: ['fr'] });
}

export default async function HelpPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (locale !== 'fr') notFound();
  setRequestLocale(locale);

  const url = `${BASE_URL}/fr/aide`;
  const graph = jsonLdGraph([
    webPage({ name: TITLE, description: DESCRIPTION, url, locale }),
    breadcrumbList([
      { name: 'Accueil', url: `${BASE_URL}/fr` },
      { name: 'Aide', url },
    ]),
    faqPage(HELP_ENTRIES.map((e) => ({
      question: e.question,
      answer: e.steps ? `${e.answer} ${e.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}` : e.answer,
    }))),
  ]);

  return (
    <>
      <JsonLd data={graph} />
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px clamp(16px,4vw,48px)',
          borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface)',
        }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em', color: '#E57A97' }}>DigiTip</span>
          </Link>
          <LanguageSwitcher />
        </header>

        <main style={{ maxWidth: 860, margin: '0 auto', padding: '40px 20px 80px' }}>
          <Link href="/" style={{ display: 'inline-block', marginBottom: 24, color: 'var(--text-3)', fontSize: 13, textDecoration: 'none' }}>
            ← Accueil
          </Link>

          <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 12 }}>
            Bloqué ? On vous débloque.
          </h1>
          <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 32, maxWidth: 620 }}>
            Toutes les réponses, de l’arrivée de la plaque au premier pourboire. Tapez votre problème ou
            choisissez l’étape où vous êtes.
          </p>

          <HelpCenter intro={
            <section aria-labelledby="tutos" style={{ marginBottom: 40 }}>
              <h2 id="tutos" style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent)', marginBottom: 14 }}>
                La mise en route en vidéo
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, maxWidth: 560 }}>
                {TUTORIALS.map((v) => (
                  <figure key={v.src} style={{ margin: 0 }}>
                    <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <TutorialVideo src={v.src} label={`Tuto vidéo : ${v.title}`} />
                    </div>
                    <figcaption style={{ fontSize: 13, fontWeight: 700, marginTop: 6 }}>{v.title}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          } />

          <section style={{ marginTop: 16, padding: 24, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Toujours bloqué ?</h2>
            <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.65 }}>
              Écrivez-nous à{' '}
              <a href={`mailto:${HELP_CONTACT}`} style={{ color: 'var(--accent)', fontWeight: 700 }}>{HELP_CONTACT}</a>{' '}
              avec une capture de l’écran où vous êtes bloqué. Réponse sous 48 heures ouvrées.
            </p>
          </section>
        </main>
      </div>
    </>
  );
}
