import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createClient } from '@/lib/supabase/server';
import { runAdminSearch } from '@/lib/admin/search';

export default async function AdminSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);
  const t = await getTranslations('dashboard.admin.search');
  const supabase = await createClient();
  const q = (sp.q ?? '').trim();
  const results = q ? await runAdminSearch(supabase, q) : null;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{t('subtitle')}</p>
      </div>

      <form method="get" style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t('placeholder')}
          style={{
            flex: '1 1 240px', minWidth: 200, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14,
          }}
        />
        <button type="submit" style={{
          padding: '10px 18px', borderRadius: 'var(--radius-sm)', background: 'var(--accent)',
          color: 'var(--accent-contrast, #fff)', border: 'none', fontWeight: 600, cursor: 'pointer',
        }}>
          {t('submit')}
        </button>
      </form>

      {results && (
        <div style={{ display: 'grid', gap: 22 }}>
          <ResultBlock title={t('secGroups')} empty={t('none')} items={results.groups.map((g) => (
            <li key={g.id}><Link href="/dashboard/admin/groups" style={{ color: 'var(--accent)' }}>{g.name}</Link></li>
          ))} />
          <ResultBlock title={t('secEstablishments')} empty={t('none')} items={results.establishments.map((e) => (
            <li key={e.id}><span style={{ fontWeight: 600 }}>{e.name}</span> <span style={{ color: 'var(--text-3)', fontSize: 12 }}>({e.slug})</span></li>
          ))} />
          <ResultBlock title={t('secStaff')} empty={t('none')} items={results.staff.map((s) => (
            <li key={s.id}>{s.full_name}</li>
          ))} />
          <ResultBlock title={t('secStickers')} empty={t('none')} items={results.stickers.map((s) => (
            <li key={s.id}><code style={{ fontSize: 12 }}>{s.short_id}</code></li>
          ))} />
          <ResultBlock title={t('secTransactions')} empty={t('none')} items={results.transactions.map((tx) => (
            <li key={tx.id}>
              {formatAmount(tx.amount, locale)} · {tx.stripe_payment_intent_id ? (
                <a href={`https://dashboard.stripe.com/payments/${tx.stripe_payment_intent_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12 }}>Stripe</a>
              ) : tx.id}
            </li>
          ))} />
        </div>
      )}
    </div>
  );
}

function formatAmount(cents: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function ResultBlock({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: React.ReactNode[];
}) {
  return (
    <section>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{title}</h2>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{empty}</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text)' }}>{items}</ul>
      )}
    </section>
  );
}
