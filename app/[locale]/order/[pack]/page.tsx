import { notFound, redirect } from 'next/navigation';

// The former five-step order wizard. Ordering is now the one-page checkout,
// for visitors and signed-in customers alike (it pre-fills an account's
// details); old links (dashboard, emails, ads) land there.
export default async function OrderPage({
  params,
}: {
  params: Promise<{ locale: string; pack: string }>;
}) {
  const { locale, pack } = await params;
  if (pack !== 'solo' && pack !== 'duo') notFound();
  redirect(`/${locale}/checkout?pack=${pack}`);
}
