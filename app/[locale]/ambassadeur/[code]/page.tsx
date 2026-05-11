import { AmbassadeurDashboard } from '@/components/ambassadeur/AmbassadeurDashboard';

export default async function AmbassadeurPage({
  params,
}: {
  params: Promise<{ code: string; locale: string }>;
}) {
  const { code } = await params;
  return <AmbassadeurDashboard code={code} />;
}
