import { redirect } from 'next/navigation';

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ pack?: string }>;
}) {
  const { locale } = await params;
  const { pack } = await searchParams;

  // Legacy link support: /signup?pack=X → /order/X wizard
  if (pack === 's' || pack === 'm' || pack === 'l') {
    redirect(`/${locale}/order/${pack}`);
  }

  redirect(`/${locale}/login`);
}
