import { notFound } from 'next/navigation';
import { CommercialDashboard } from '@/components/commercial/CommercialDashboard';
import { partnerPortalExists } from '@/lib/partners/portal';

export const dynamic = 'force-dynamic';

export default async function CommercialPortalPage({
  params,
}: {
  params: Promise<{ code: string; locale: string }>;
}) {
  const { code } = await params;
  if (!(await partnerPortalExists('commercial', code))) notFound();
  return <CommercialDashboard code={code} />;
}
