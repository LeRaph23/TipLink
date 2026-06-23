import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { EstablishmentDigitipCopy } from '../EstablishmentDigitipCopy';
import { EditEstablishmentForm } from './EditEstablishmentForm';

export default async function EditEstablishmentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('dashboard.establishments');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('group_id')
    .in('role', ['group_admin', 'super_admin'])
    .eq('user_id', user!.id)
    .not('group_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!roleRow?.group_id) notFound();

  const service = createServiceClient();
  const { data: est } = await service
    .from('establishments')
    .select('id, name, business_type, country, currency, group_id, google_place_id, google_review_url, address')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (!est || est.group_id !== roleRow.group_id) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const tipUrl = `${baseUrl}/${locale}/pay/group/${id}`;

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
          {est.name}
        </h1>
      </div>

      <EditEstablishmentForm establishment={est} />

      <div style={{
        marginTop: 28, padding: 18, background: 'var(--surface)',
        border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius)',
      }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10,
        }}>
          {t('tipLink')}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code style={{
            flex: 1, fontSize: 11.5, fontFamily: 'ui-monospace, monospace',
            color: 'var(--text-2)', background: 'var(--surface-2)',
            padding: '7px 10px', borderRadius: 6, wordBreak: 'break-all',
          }}>
            {tipUrl}
          </code>
          <EstablishmentDigitipCopy
            url={tipUrl}
            copyLabel={t('copyLink')}
            copiedLabel={t('linkCopied')}
          />
        </div>
      </div>
    </div>
  );
}
