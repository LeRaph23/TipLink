import { notFound } from 'next/navigation';
import { AmbassadeurDashboard } from '@/components/ambassadeur/AmbassadeurDashboard';
import { partnerPortalExists } from '@/lib/partners/portal';

export const dynamic = 'force-dynamic';

export default async function AmbassadeurPage({
  params,
}: {
  params: Promise<{ code: string; locale: string }>;
}) {
  const { code } = await params;
  if (!(await partnerPortalExists('ambassador', code))) notFound();
  return <AmbassadeurDashboard code={code} />;
}
