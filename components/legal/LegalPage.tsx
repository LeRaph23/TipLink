import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="7" fill="var(--accent)" />
      <path d="M7 12c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 12c0 2.8-2.2 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill="white" />
    </svg>
  );
}

export type LegalSection = { title: string; body: string };

export function LegalPage({
  title,
  intro,
  sections,
  lastUpdatedLabel,
  lastUpdatedDate,
  backLabel,
  pricingLabel,
  contactLabel,
  privacyLabel,
  termsLabel,
  currentPath,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
  lastUpdatedLabel: string;
  lastUpdatedDate: string;
  backLabel: string;
  pricingLabel: string;
  contactLabel: string;
  privacyLabel: string;
  termsLabel: string;
  currentPath: '/privacy' | '/terms';
}) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ position: 'fixed', top: '-10%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 48px', position: 'relative', zIndex: 10,
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <LogoMark size={26} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#f0f0f8' }}>Digitip</span>
        </Link>
        <nav style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <LanguageSwitcher />
          <Link href="/pricing" style={{
            padding: '7px 14px', textDecoration: 'none',
            color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 500,
          }}>{pricingLabel}</Link>
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
          {currentPath !== '/privacy' && (
            <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
              {privacyLabel}
            </Link>
          )}
          {currentPath !== '/terms' && (
            <Link href="/terms" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
              {termsLabel}
            </Link>
          )}
          <Link href="/contact" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>
            {contactLabel}
          </Link>
        </div>
      </main>
    </div>
  );
}
