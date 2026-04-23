import { requireSuperAdmin } from '@/lib/auth/require-super-admin';

export default async function SuperAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireSuperAdmin(locale);
  return <>{children}</>;
}
