import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';

/**
 * The "page introuvable" screen.
 *
 * Shared by two callers that are easy to mistake for one thing:
 *
 *  - `app/[locale]/not-found.tsx`, the Next.js convention file, rendered when a
 *    page in this subtree calls `notFound()`;
 *  - `app/[locale]/not-found/page.tsx`, an addressable ROUTE, because
 *    `proxy.ts` redirects failed SmartTag scans to `/<locale>/not-found` in
 *    four places and a convention file is not reachable by URL. Without that
 *    route every failed scan landed on the framework's default English 404,
 *    even though the copy here was written for exactly that case: "le SmartTag
 *    NFC n'est peut-être pas encore assigné".
 */
export async function NotFoundScreen() {
  const t = await getTranslations('notFound');
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px', textAlign: 'center',
    }}>
      <div className="fade-up">
        {/* Decorative watermark: deliberately low-contrast, and hidden from
            assistive technology because the readable message is the heading
            below it. It used to be white at 4 % opacity, i.e. invisible on the
            light theme the app ships. */}
        <div aria-hidden style={{ fontFamily: 'var(--font-display)', fontSize: 96, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--border-subtle)', lineHeight: 1, marginBottom: 16, userSelect: 'none' }}>
          404
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>{t('title')}</h2>
        <p style={{ fontSize: 14, color: 'var(--text-2)', maxWidth: 320, lineHeight: 1.7, marginBottom: 28 }}>
          {t('description')}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Link href="/" style={{
            padding: '9px 18px', borderRadius: 'var(--radius)',
            background: 'var(--accent)', color: 'var(--accent-fg)',
            fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
          }}>← {t('home')}</Link>
          <Link href="/login" style={{
            padding: '9px 18px', borderRadius: 'var(--radius)',
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', fontSize: 13.5, fontWeight: 500, textDecoration: 'none',
          }}>{t('login')}</Link>
        </div>
      </div>
    </main>
  );
}
