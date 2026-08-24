import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { SettingsForm } from './SettingsForm';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const t = await getTranslations('dashboard.settings');

  const { data: roles } = await supabase
    .from('user_roles')
    .select('group_id, role')
    .eq('user_id', user.id)
    .in('role', ['group_admin', 'super_admin'])
    .not('group_id', 'is', null);

  const groupId = roles?.[0]?.group_id;
  if (!groupId) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 8 }}>
          {t('noGroup')}
        </p>
      </div>
    );
  }

  const { data: group } = await supabase
    .from('groups')
    .select('id, name, logo_url, legal_name, vat_number, accountant_email, settings')
    .eq('id', groupId)
    .single();

  if (!group) {
    return (
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
      </div>
    );
  }

  const settingsObj = (group.settings as Record<string, unknown> | null) ?? {};
  const rawThresholds = Array.isArray(settingsObj.tip_thresholds)
    ? (settingsObj.tip_thresholds as number[])
    : [1, 2, 5, 10];
  const tipThresholds = rawThresholds.slice(0, 4);
  while (tipThresholds.length < 4) tipThresholds.push(tipThresholds[tipThresholds.length - 1] ?? 1);

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em' }}>{t('title')}</h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 3 }}>{t('subtitle')}</p>
      </div>

      <SettingsForm
        groupId={group.id}
        initial={{
          name: group.name,
          logoUrl: group.logo_url,
          legalName: group.legal_name,
          vatNumber: group.vat_number,
          accountantEmail: group.accountant_email,
          tipThresholds: tipThresholds as number[],
        }}
        labels={{
          sectionBranding: t('sectionBranding'),
          logo: t('logo'),
          logoHelp: t('logoHelp'),
          teamName: t('teamName'),
          sectionTips: t('sectionTips'),
          tipsHelp: t('tipsHelp'),
          sectionLegal: t('sectionLegal'),
          legalName: t('legalName'),
          vatNumber: t('vatNumber'),
          accountantEmail: t('accountantEmail'),
          accountantEmailHelp: t('accountantEmailHelp'),
          save: t('save'),
          saving: t('saving'),
          saved: t('saved'),
        }}
      />
    </div>
  );
}
