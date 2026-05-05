import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export type LegalSection = { title: string; body: string };

type LegalPath = '/privacy' | '/terms' | '/mentions-legales' | '/cgv';

export function LegalPage({
  title,
  intro,
  sections,
  lastUpdatedLabel,
  lastUpdatedDate,
  backLabel,
  navLinks,
  currentPath,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
  lastUpdatedLabel: string;
  lastUpdatedDate: string;
  backLabel: string;
  navLinks: { label: string; href: LegalPath }[];
  currentPath: LegalPath;
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
        <Link href="/" style={{
          display: 'inline-block', marginBottom: 24,
          color: 'var(--text-3)', fontSize: 13, textDecoration: 'none',
        }}>← {backLabel}</Link>

        <h1 style={{
          fontSize: 'clamp(28px, 5vw, 44px)',
          fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.03em',
          lineHeight: 1.08, marginBottom: 10,
        }}>{title}</h1>

        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 28 }}>
          {lastUpdatedLabel} · {lastUpdatedDate}
        </p>

        <p style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 40 }}>
          {intro}
        </p>

        {sections.map((s) => (
          <section key={s.title} style={{ marginBottom: 32 }}>
            <h2 style={{
              fontSize: 16, fontWeight: 700, color: 'var(--text)',
              letterSpacing: '-0.01em', marginBottom: 10,
            }}>{s.title}</h2>
            <p style={{ fontSize: 14.5, color: 'var(--text-2)', lineHeight: 1.8 }}>
              {s.body}
            </p>
          </section>
        ))}

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '40px 0 24px' }} />

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
          {navLinks
            .filter((l) => l.href !== currentPath)
            .map((l) => (
              <Link key={l.href} href={l.href} style={{ color: 'var(--text-3)', textDecoration: 'none' }}>
                {l.label}
              </Link>
            ))}
        </div>
      </main>
    </div>
  );
}
