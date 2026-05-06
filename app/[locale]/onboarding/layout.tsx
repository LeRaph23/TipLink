import { setRequestLocale } from 'next-intl/server';

export default async function OnboardingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <header style={{
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="7" fill="var(--accent)" />
          <path d="M7 12c0-2.8 2.2-5 5-5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M17 12c0 2.8-2.2 5-5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="1.8" fill="white" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)' }}>Digitip</span>
      </header>
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '40px 20px 80px',
      }}>
        {children}
      </main>
    </div>
  );
}
