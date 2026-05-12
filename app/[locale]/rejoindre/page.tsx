import { redirect, notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ShortRecruitmentRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const token = process.env.AMBASSADOR_RECRUITMENT_TOKEN;
  if (!token) notFound();
  redirect(`/${locale}/rejoindre-ambassadeur/${token}`);
}
