import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getBaseUrl } from '@/lib/env';
import { StickerList } from '@/components/dashboard/StickerList';

export default async function StickersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.stickers');

  const supabase = await createClient();

  const { data: stickers } = await supabase
    .from('nfc_stickers')
    .select(`
      id,
      short_id,
      establishments (id, name)
    `)
    .order('created_at', { ascending: false });

  // Establishments the caller manages — offered as re-assignment targets so a
  // multi-salon admin can move a tag between their own establishments.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user!.id)
    .in('role', ['group_admin', 'super_admin'])
    .not('group_id', 'is', null);
  const groupIds = [...new Set((roleRows ?? []).map((r) => r.group_id as string))];
  const { data: establishments } = groupIds.length
    ? await supabase
        .from('establishments')
        .select('id, name')
        .in('group_id', groupIds)
        .is('deleted_at', null)
        .order('name')
    : { data: [] };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
      </div>

      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius)', padding: 14, marginBottom: 18,
      }}>
        <div aria-hidden style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--accent-bg, rgba(124,92,252,0.12))',
          color: 'var(--accent)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 14, fontWeight: 700,
        }}>i</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 }}>
          {t('infoBanner')}
        </p>
      </div>

      <StickerList stickers={stickers ?? []} establishments={establishments ?? []} baseUrl={getBaseUrl()} />
    </div>
  );
}
