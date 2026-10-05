import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { effectivePlan } from '@/lib/billing/entitlements';
import { summarizeCompliments, isComplimentTag } from '@/lib/compliments';
import { ProUpsell } from '@/components/billing/ProUpsell';
import { PageHeader, SectionTitle } from '@/components/dashboard/ui';
import { HideToggle } from './HideToggle';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 30;

const card: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius)',
};

/**
 * What customers said about the team, right after tipping (Digitip Pro).
 *
 * Read with the user's own client, so RLS decides the scope: a group admin
 * sees every establishment, a manager their own. The page is the same for
 * both; only the rows differ.
 *
 * Without Pro it shows what the page would look like, clearly marked as an
 * example, and the way to get it. A paywall that only says "locked" tells a
 * manager nothing about what is behind it.
 */
export default async function ComplimentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.compliments');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  // The group whose plan decides this page: the one the caller administers,
  // or the group of the establishment they manage.
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role, group_id, establishment_id')
    .eq('user_id', user.id);
  const service = createServiceClient();
  let groupId = roles?.find((r) => (r.role === 'group_admin' || r.role === 'super_admin') && r.group_id)?.group_id ?? null;
  if (!groupId) {
    const estId = roles?.find((r) => r.role === 'manager' && r.establishment_id)?.establishment_id ?? null;
    if (estId) {
      groupId = (await service.from('establishments').select('group_id').eq('id', estId).maybeSingle()).data?.group_id ?? null;
    }
  }
  const { data: group } = groupId
    ? await service.from('groups').select('plan, pro_trial_ends_at').eq('id', groupId).maybeSingle()
    : { data: null };
  const isPro = effectivePlan(group) === 'pro';

  if (!isPro) {
    return (
      <div style={{ maxWidth: 760 }}>
        <PageHeader title={t('title')} subtitle={t('subtitle')} />
        <ProUpsell title={t('lockedTitle')} body={t('lockedBody')} cta={t('lockedCta')} />
        <Preview label={t('exampleBadge')} t={t} locale={locale} />
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/purity -- a server render, once per request
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: rows }, { data: staff }] = await Promise.all([
    supabase
      .from('tip_compliments')
      .select('id, staff_id, tags, message, hidden_at, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.from('staff_profiles').select('id, full_name'),
  ]);
  const names = new Map((staff ?? []).map((s) => [s.id, s.full_name]));
  const nameOf = (id: string | null) => (id ? names.get(id) ?? '—' : t('team'));
  const summary = summarizeCompliments(rows ?? []);
  const messages = (rows ?? []).filter((r) => r.message?.trim());
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const quote = (text: string) => (locale === 'fr' ? `« ${text} »` : `“${text}”`);
  // "L'accueil, les conseils" reads as a sentence; a row of pills did not.
  const liked = (labels: string[]) =>
    labels.map((l, i) => (i === 0 ? l : l.charAt(0).toLowerCase() + l.slice(1))).join(', ');
  const th: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--surface-2)',
  };
  const cell: React.CSSProperties = { padding: '12px 14px' };

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {!rows?.length ? (
        <div style={{ ...card, padding: '36px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{t('emptyTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55, maxWidth: 420, margin: '0 auto' }}>
            {t('emptyBody')}
          </div>
        </div>
      ) : (
        <>
          <SectionTitle>{t('byPerson')}</SectionTitle>
          <div style={{ ...card, overflow: 'hidden', marginBottom: 28 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th style={th}>{t('colPerson')}</th>
                  <th style={{ ...th, textAlign: 'right' }}>{t('colCount')}</th>
                  <th style={th}>{t('colLiked')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.staffId ?? 'team'} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td style={{ ...cell, fontWeight: 600, color: 'var(--text)' }}>{nameOf(s.staffId)}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{s.count}</td>
                    <td style={{ ...cell, color: 'var(--text-2)' }}>
                      {liked(s.topTags.slice(0, 3).map(({ tag }) => t(`tags.${tag}`))) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {messages.length > 0 && (
            <>
              <SectionTitle>{t('recentMessages')}</SectionTitle>
              <div style={{ ...card, overflow: 'hidden' }}>
                {messages.map((m, i) => (
                  <div key={m.id} style={{
                    padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start',
                    borderTop: i ? '1px solid var(--border-subtle)' : 'none',
                    opacity: m.hidden_at ? 0.55 : 1,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>
                        <strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>{nameOf(m.staff_id)}</strong>
                        {' · '}{fmt.format(new Date(m.created_at))}
                        {m.hidden_at && <> · {t('hiddenBadge')}</>}
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                        {quote(m.message ?? '')}
                      </div>
                      {(m.tags ?? []).filter(isComplimentTag).length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                          {liked((m.tags ?? []).filter(isComplimentTag).map((tag) => t(`tags.${tag}`)))}
                        </div>
                      )}
                    </div>
                    <HideToggle id={m.id} hidden={Boolean(m.hidden_at)} />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** The locked page's example: labelled as one, never real-looking data. */
function Preview({ label, t, locale }: {
  label: string;
  t: Awaited<ReturnType<typeof getTranslations<'dashboard.compliments'>>>;
  locale: string;
}) {
  const quote = (text: string) => (locale === 'fr' ? `« ${text} »` : `“${text}”`);
  const rows = [
    { name: 'Julie', count: 14, liked: `${t('tags.advice')}, ${t('tags.smile').toLowerCase()}`, text: t('sample1') },
    { name: 'Karim', count: 9, liked: `${t('tags.speed')}, ${t('tags.welcome').toLowerCase()}`, text: t('sample2') },
  ];
  return (
    <div aria-hidden="true" style={{ userSelect: 'none' }}>
      <SectionTitle>{label}</SectionTitle>
      <div style={{ ...card, borderStyle: 'dashed', overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <div key={r.name} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--border-subtle)' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>{r.name}</span>
              <span style={{ fontWeight: 700, color: 'var(--text)' }}>{r.count}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 2 }}>{r.liked}</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 6 }}>{quote(r.text)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
