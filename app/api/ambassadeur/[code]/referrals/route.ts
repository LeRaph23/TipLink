import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyCookieValue } from '../auth/route';
import { getReferralStats } from '@/lib/referrals';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const cookieValue = request.cookies.get('amb_session')?.value;
  if (!cookieValue) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) return NextResponse.json({ error: 'Configuration manquante' }, { status: 500 });

  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return NextResponse.json({ error: 'Session invalide' }, { status: 401 });

  const service = createServiceClient();

  const [{ data: me }, statsResult, refsResult, pendingAppsResult] = await Promise.all([
    service
      .from('ambassadors')
      .select('id, name, referral_code')
      .eq('id', ambassadorId)
      .single(),
    getReferralStats(service, ambassadorId),
    service
      .from('ambassadors')
      .select('id, name, referral_validated_at, created_at')
      .eq('referrer_ambassador_id', ambassadorId)
      .order('created_at', { ascending: false }),
    service
      .from('ambassador_recruitment_applications')
      .select('id, first_name, last_name, status, created_at')
      .eq('referrer_ambassador_id', ambassadorId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);

  if (!me) return NextResponse.json({ error: 'Ambassadeur introuvable' }, { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://digitip.app';
  const referralUrl = me.referral_code
    ? `${baseUrl}/devenir-ambassadeur?ref=${encodeURIComponent(me.referral_code)}`
    : null;

  return NextResponse.json({
    referralCode: me.referral_code,
    referralUrl,
    stats: statsResult,
    filleuls: (refsResult.data ?? []).map(r => ({
      id: r.id,
      firstName: r.name.split(' ')[0],
      status: r.referral_validated_at ? 'validated' : 'pending_sales',
      createdAt: r.created_at,
    })),
    pendingApplications: (pendingAppsResult.data ?? []).map(a => ({
      id: a.id,
      firstName: a.first_name,
      createdAt: a.created_at,
    })),
  });
}
