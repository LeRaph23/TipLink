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
        <span style={{
          fontSize: 16,
          fontWeight: 800,
          color: '#E57A97',
          letterSpacing: '-0.03em',
          fontFamily: 'var(--font-poppins), sans-serif',
        }}>DigiTip</span>
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
