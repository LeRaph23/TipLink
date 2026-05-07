import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { EstablishmentDigitipCopy } from './EstablishmentDigitipCopy';

export default async function EstablishmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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

  const groupId = roleRow?.group_id;

  const service = createServiceClient();
  const { data: establishments } = groupId
    ? await service
        .from('establishments')
        .select('id, name, address, created_at')
        .eq('group_id', groupId)
        .is('deleted_at', null)
        .order('name')
    : { data: [] };

  // Tips collected per establishment over the last 28 days
  const since28 = new Date(Date.now() - 28 * 24 * 3600000).toISOString();
  const estIds = (establishments ?? []).map((e) => e.id);
  const { data: txns } = estIds.length
    ? await service
        .from('transactions')
        .select('establishment_id, amount')
        .in('establishment_id', estIds)
        .eq('status', 'succeeded')
        .gte('created_at', since28)
    : { data: [] };

  const tipsByEst = new Map<string, number>();
  for (const tx of txns ?? []) {
    tipsByEst.set(tx.establishment_id, (tipsByEst.get(tx.establishment_id) ?? 0) + tx.amount);
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
        </div>
        <Link
          href="/dashboard/establishments/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 'var(--radius)',
            background: 'var(--accent)', color: '#fff',
            fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
          }}
        >
          + {t('create')}
        </Link>
      </div>

      {!establishments?.length ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', padding: '48px 24px', textAlign: 'center',
          color: 'var(--text-3)', fontSize: 13,
        }}>
          {t('empty')}
        </div>
      ) : (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[t('name'), 'Adresse', 'Pourboires 28j', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '10px 16px', textAlign: i === 3 ? 'right' : 'left',
                    fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    borderBottom: '1px solid var(--border)', background: 'var(--surface-2)',
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {establishments.map((est) => {
                const totalCents = tipsByEst.get(est.id) ?? 0;
                const totalFormatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(totalCents / 100);
                return (
                  <tr key={est.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>
                      {est.name}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-2)' }}>
                      {est.address ?? <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text)', fontWeight: 600 }}>
                      {totalFormatted}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <EstablishmentDigitipCopy
                          url={`${baseUrl}/${locale}/pay/group/${est.id}`}
                          copyLabel={t('copyLink')}
                          copiedLabel={t('linkCopied')}
                        />
                        <Link
                          href={`/dashboard/establishments/${est.id}`}
                          style={{
                            padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)', color: 'var(--text-2)',
                            fontSize: 12, fontWeight: 500, textDecoration: 'none',
                          }}
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
