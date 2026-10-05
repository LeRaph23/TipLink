import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { effectivePlan } from '@/lib/billing/entitlements';
import { summarizeCompliments, isComplimentTag } from '@/lib/compliments';
import { ProUpsell } from '@/components/billing/ProUpsell';
import { PageHeader, SectionTitle, cardTitleStyle } from '@/components/dashboard/ui';
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
        <Preview label={t('exampleBadge')} t={t} />
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
          <SectionTitle>{t('byPerson', { days: WINDOW_DAYS })}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
            {summary.map((s) => (
              <div key={s.staffId ?? 'team'} style={{ ...card, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <h3 style={{ ...cardTitleStyle, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {nameOf(s.staffId)}
                  </h3>
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {s.count}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {s.topTags.slice(0, 3).map(({ tag, count }) => (
                    <span key={tag} style={{
                      padding: '3px 9px', borderRadius: 100, fontSize: 12, fontWeight: 500,
                      background: 'var(--accent-muted)', color: 'var(--accent)',
                    }}>
                      {t(`tags.${tag}`)} · {count}
                    </span>
                  ))}
                  {s.messageCount > 0 && (
                    <span style={{ padding: '3px 9px', borderRadius: 100, fontSize: 12, color: 'var(--text-3)', background: 'var(--surface-2)' }}>
                      {t('messagesCount', { count: s.messageCount })}
                    </span>
                  )}
                </div>
              </div>
            ))}
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
                        “{m.message}”
                      </div>
                      {(m.tags ?? []).filter(isComplimentTag).length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                          {(m.tags ?? []).filter(isComplimentTag).map((tag) => t(`tags.${tag}`)).join(' · ')}
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

/** The locked page's example: obviously an example, never real data. */
function Preview({ label, t }: { label: string; t: Awaited<ReturnType<typeof getTranslations<'dashboard.compliments'>>> }) {
  const sample = [
    { name: 'Julie', count: 14, tags: ['advice', 'smile'] as const, quote: t('sample1') },
    { name: 'Karim', count: 9, tags: ['speed', 'welcome'] as const, quote: t('sample2') },
  ];
  return (
    <div aria-hidden="true" style={{ position: 'relative', marginTop: 4 }}>
      <span style={{
        position: 'absolute', top: -10, left: 14, zIndex: 1,
        padding: '2px 9px', borderRadius: 100, fontSize: 11, fontWeight: 700,
        background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
      </span>
      <div style={{
        ...card, padding: 16, display: 'grid', gap: 12,
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        borderStyle: 'dashed', userSelect: 'none',
      }}>
        {sample.map((s) => (
          <div key={s.name} style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{s.name}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{s.count}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '8px 0' }}>
              {s.tags.map((tag) => (
                <span key={tag} style={{
                  padding: '3px 9px', borderRadius: 100, fontSize: 12,
                  background: 'var(--accent-muted)', color: 'var(--accent)',
                }}>
                  {t(`tags.${tag}`)}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>“{s.quote}”</div>
          </div>
        ))}
      </div>
    </div>
  );
}
