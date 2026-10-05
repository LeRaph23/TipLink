import { getTranslations } from 'next-intl/server';
import { createServiceClient } from '@/lib/supabase/service';
import { summarizeCompliments } from '@/lib/compliments';
import { cardTitleStyle } from './ui';

const WINDOW_DAYS = 30;

/**
 * The compliments addressed to one employee, on their own dashboard.
 *
 * Nothing when there are none: an employee is not the person who can buy Pro,
 * and an empty card would read as "nobody likes you". Hidden messages (a
 * manager took them down) are left out, as the RLS policy does for a direct
 * read; this goes through the service client only because the dashboard
 * already resolved whose profile this is.
 */
export async function StaffCompliments({ staffId, locale }: { staffId: string; locale: string }) {
  // eslint-disable-next-line react-hooks/purity -- a server render, once per request
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data: rows } = await createServiceClient()
    .from('tip_compliments')
    .select('staff_id, tags, message, created_at')
    .eq('staff_id', staffId)
    .is('hidden_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);

  if (!rows?.length) return null;
  const t = await getTranslations('dashboard.compliments');
  const [summary] = summarizeCompliments(rows);
  const messages = rows.filter((r) => r.message?.trim()).slice(0, 3);
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });

  return (
    <section style={{
      background: 'var(--surface)', border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 20,
    }}>
      <h3 style={{ ...cardTitleStyle, marginBottom: 4 }}>
        {t('staffTitle', { count: summary.count })}
      </h3>
      <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginBottom: 12 }}>{t('staffSub')}</div>
      {summary.topTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: messages.length ? 12 : 0 }}>
          {summary.topTags.map(({ tag, count }) => (
            <span key={tag} style={{
              padding: '4px 10px', borderRadius: 100, fontSize: 12.5, fontWeight: 500,
              background: 'var(--accent-muted)', color: 'var(--accent)',
            }}>
              {t(`tags.${tag}`)} · {count}
            </span>
          ))}
        </div>
      )}
      {messages.map((m, i) => (
        <blockquote key={i} style={{
          margin: i ? '8px 0 0' : 0, padding: '10px 12px', borderRadius: 10,
          background: 'var(--surface-2)', fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5,
        }}>
          “{m.message}”
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>
            {fmt.format(new Date(m.created_at))}
          </span>
        </blockquote>
      ))}
    </section>
  );
}
