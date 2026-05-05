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
        </nav>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px', position: 'relative', zIndex: 1 }}>
        <Link href="/" style={{
          display: 'inline-block', marginBottom: 20,
          color: 'rgba(255,255,255,0.45)', fontSize: 13, textDecoration: 'none',
        }}>← {backLabel}</Link>

        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 5vw, 48px)',
          fontWeight: 800, color: '#f0f0f8', letterSpacing: '-0.03em',
          lineHeight: 1.05, marginBottom: 12,
        }}>{title}</h1>

        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', marginBottom: 28 }}>
          {lastUpdatedLabel} · {lastUpdatedDate}
        </p>

        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.75, marginBottom: 36 }}>
          {intro}
        </p>

        {sections.map((s) => (
          <section key={s.title} style={{ marginBottom: 28 }}>
            <h2 style={{
              fontSize: 17, fontWeight: 700, color: '#f0f0f8',
              letterSpacing: '-0.01em', marginBottom: 10,
            }}>{s.title}</h2>
            <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75 }}>
              {s.body}
            </p>
          </section>
        ))}

        <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '36px 0 24px' }} />

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
          {navLinks
            .filter((l) => l.href !== currentPath)
            .map((l) => (
              <Link key={l.href} href={l.href} style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
                {l.label}
              </Link>
            ))}
        </div>
      </main>
    </div>
  );
}
