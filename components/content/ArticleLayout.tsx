import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import type { ContentMeta } from '@/content/types';

// Shares the 720px reading column, header and back-link of
// components/legal/LegalPage.tsx rather than inventing a second prose style.
// Server component — no interactivity, so nothing here pins the tree client-side.

function formatFrDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

export function ArticleLayout({
  meta,
  hubHref,
  hubLabel,
  children,
  relatedLinks,
}: {
  meta: ContentMeta;
  hubHref: string;
  hubLabel: string;
  children: React.ReactNode;
  relatedLinks: { label: string; href: string }[];
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px clamp(16px,4vw,48px)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface)',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em', color: '#E57A97' }}>DigiTip</span>
        </Link>
        <nav style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <LanguageSwitcher />
        </nav>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
        <Link href={hubHref} style={{
          display: 'inline-block', marginBottom: 24,
          color: 'var(--text-3)', fontSize: 13, textDecoration: 'none',
        }}>← {hubLabel}</Link>

        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 44px)',
          fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em',
          lineHeight: 1.08, marginBottom: 10,
        }}>{meta.h1}</h1>

        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 32 }}>
          Mis à jour le {formatFrDate(meta.dateModified)}
        </p>

        <article className="prose-article">{children}</article>

        {meta.faq.length > 0 && (
          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 16 }}>
              Questions fréquentes
            </h2>
            {/* <details> rather than a useState accordion: keeps this a server
                component, gives keyboard accessibility for free, and puts the
                answers in the initial HTML — which the FAQPage markup asserts. */}
            {meta.faq.map((f) => (
              <details
                key={f.question}
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  padding: '14px 0',
                }}
              >
                <summary style={{
                  cursor: 'pointer', fontWeight: 650, fontSize: 15,
                  color: 'var(--text)', listStyle: 'revert',
                }}>
                  {f.question}
                </summary>
                <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.8, marginTop: 10 }}>
                  {f.answer}
                </p>
              </details>
            ))}
          </section>
        )}

        {meta.sources.length > 0 && (
          <section style={{ marginTop: 48 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Sources</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {meta.sources.map((s) => (
                <li key={s.url} style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow"
                     style={{ color: 'var(--text-2)' }}>
                    {s.label}
                  </a>
                  {' — vérifié le '}{formatFrDate(s.verifiedOn)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section style={{
          marginTop: 48, padding: 24, borderRadius: 14,
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Recevoir les pourboires par carte
          </h2>
          <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16 }}>
            Digitip est une plaque NFC à poser sur le comptoir. Le client approche son
            téléphone, choisit un montant, et la somme part sur le compte bancaire du
            bénéficiaire. Achat unique, sans abonnement.
          </p>
          <Link href="/pricing" style={{
            display: 'inline-block', padding: '11px 22px', borderRadius: 10,
            background: '#E57A97', color: '#fff', fontWeight: 700, fontSize: 14.5,
            textDecoration: 'none',
          }}>
            Voir les tarifs →
          </Link>
        </section>

        {relatedLinks.length > 0 && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '40px 0 24px' }} />
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
              {relatedLinks.map((l) => (
                <Link key={l.href} href={l.href} style={{ color: 'var(--text-3)', textDecoration: 'none' }}>
                  {l.label}
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
