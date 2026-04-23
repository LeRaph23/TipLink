import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getBaseUrl } from '@/lib/env';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = await rateLimit(`billing-portal:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: roles } = await service
    .from('user_roles')
    .select('group_id')
    .eq('user_id', user.id)
    .in('role', ['group_admin', 'super_admin'])
    .not('group_id', 'is', null);

  const groupId = roles?.[0]?.group_id;
  if (!groupId) {
    return NextResponse.json({ error: 'No billing group' }, { status: 404 });
  }

  const { data: group } = await service
    .from('groups')
    .select('stripe_customer_id')
    .eq('id', groupId)
    .single();

  if (!group?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer' }, { status: 404 });
  }

  const base = getBaseUrl();
  const localeCookie = request.cookies.get('NEXT_LOCALE')?.value;
  const locale = localeCookie === 'fr' ? 'fr' : 'en';
  const session = await stripe.billingPortal.sessions.create({
    customer: group.stripe_customer_id,
    return_url: `${base}/${locale}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url });
}
