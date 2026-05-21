import { CommercialDashboard } from '@/components/commercial/CommercialDashboard';

export const dynamic = 'force-dynamic';

export default async function CommercialPortalPage({
  params,
}: {
  params: Promise<{ code: string; locale: string }>;
}) {
  const { code } = await params;
  return <CommercialDashboard code={code} />;
}
