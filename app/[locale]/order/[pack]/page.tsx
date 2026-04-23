import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { validatePack } from '@/lib/order-validation';
import { createClient } from '@/lib/supabase/server';
import { OrderWizard } from './OrderWizard';

export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; pack: string }>;
}) {
  const { locale, pack } = await params;
  setRequestLocale(locale);

  if (!validatePack(pack)) {
    notFound();
  }

  // Resume logic: if the user already has a group, send them to billing to finish.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: role } = await supabase
      .from('user_roles')
      .select('group_id')
      .eq('user_id', user.id)
      .not('group_id', 'is', null)
      .maybeSingle();
    if (role?.group_id) {
      redirect(`/${locale}/dashboard/billing`);
    }
  }

  return <OrderWizard pack={pack} locale={locale} />;
}

export function generateStaticParams() {
  return [
    { pack: 's' },
    { pack: 'm' },
    { pack: 'l' },
  ];
}
