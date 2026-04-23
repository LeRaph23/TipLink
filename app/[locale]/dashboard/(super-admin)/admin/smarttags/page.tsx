import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { SmartTagsManager } from './SmartTagsManager';

export default async function AdminSmartTagsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await getTranslations('dashboard.admin.smarttags');
  const supabase = await createClient();

  const [
    { data: stock },
    { data: active },
    { data: establishments },
  ] = await Promise.all([
    supabase
      .from('nfc_stickers')
      .select('id, short_id, batch_label, generated_at')
      .is('establishment_id', null)
      .order('generated_at', { ascending: false })
      .limit(500),
    supabase
      .from('nfc_stickers')
      .select('id, short_id, batch_label, generated_at, establishment_id, establishments(id, name, groups(id, name))')
      .not('establishment_id', 'is', null)
      .order('generated_at', { ascending: false })
      .limit(500),
    supabase
      .from('establishments')
      .select('id, name, group_id, groups(name)')
      .is('deleted_at', null)
      .order('name'),
  ]);

  type ActiveRow = {
    id: string;
    short_id: string;
    batch_label: string | null;
    generated_at: string;
    establishment_id: string | null;
    establishments: {
      id: string;
      name: string;
      groups: { id: string; name: string } | null;
    } | null;
  };

  const activeRows = (active ?? []) as unknown as ActiveRow[];

  return (
    <SmartTagsManager
      locale={locale}
      stock={(stock ?? []).map((s) => ({
        id: s.id,
        short_id: s.short_id,
        batch_label: s.batch_label,
        generated_at: s.generated_at,
      }))}
      active={activeRows.map((s) => ({
        id: s.id,
        short_id: s.short_id,
        batch_label: s.batch_label,
        generated_at: s.generated_at,
        establishment_id: s.establishment_id,
        establishment_name: s.establishments?.name ?? null,
        group_name: s.establishments?.groups?.name ?? null,
      }))}
      establishments={(establishments ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        group_name: (e.groups as { name: string } | null)?.name ?? null,
      }))}
    />
  );
}
