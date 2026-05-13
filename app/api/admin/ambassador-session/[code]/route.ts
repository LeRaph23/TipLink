import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { buildCookieValue } from '@/app/api/ambassadeur/[code]/auth/route';

export const runtime = 'nodejs';

async function isSuperAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .limit(1);
    return (roles?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const secret = process.env.AMBASSADOR_SESSION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 });
  }

  const service = createServiceClient();
  const { data: promoCode } = await service
    .from('promo_codes')
    .select('id')
    .eq('code', code.toUpperCase())
    .maybeSingle();

  if (!promoCode) {
    return NextResponse.json({ error: 'Code introuvable' }, { status: 404 });
  }

  const { data: ambassador } = await service
    .from('ambassadors')
    .select('id')
    .eq('promo_code_id', promoCode.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!ambassador) {
    return NextResponse.json({ error: 'Ambassadeur introuvable ou inactif' }, { status: 404 });
  }

  const cookieValue = buildCookieValue(ambassador.id, code, secret);
  const dashboardUrl = `/fr/ambassadeur/${code.toLowerCase()}`;

  const response = NextResponse.redirect(new URL(dashboardUrl, _req.url));
  response.cookies.set('amb_session', cookieValue, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 2 * 60 * 60, // 2-hour admin view session
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
