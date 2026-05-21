import { setRequestLocale } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { createServiceClient } from '@/lib/supabase/service';
import {
  CommercialRecruitmentApplications,
  type CommercialApplicationRow,
} from '../CommercialRecruitmentApplications';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CommerciauxRecrutementPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireSuperAdmin(locale);

  const service = createServiceClient();

  const { data } = await service
    .from('commercial_recruitment_applications')
    .select('id, first_name, last_name, email, phone, city, sector, company_name, legal_form, vat_number, siret, vrp_status, notes, status, reviewed_at, created_at')
    .order('created_at', { ascending: false });

  const applications: CommercialApplicationRow[] = (data ?? []).map((r) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
    phone: r.phone,
    city: r.city,
    sector: r.sector,
    company_name: r.company_name,
    legal_form: r.legal_form,
    vat_number: r.vat_number,
    siret: r.siret,
    vrp_status: r.vrp_status,
    notes: r.notes,
    status: r.status as 'pending' | 'accepted' | 'rejected',
    reviewed_at: r.reviewed_at,
    created_at: r.created_at,
  }));

  return <CommercialRecruitmentApplications applications={applications} />;
}
