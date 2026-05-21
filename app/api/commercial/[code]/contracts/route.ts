import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getCommercialSession } from '@/lib/commercial/session';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const session = await getCommercialSession(req, code);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const service = createServiceClient();
  const { data } = await service
    .from('commercial_contracts')
    .select('id, title, status, sent_at, viewed_at, signed_at, content_hash')
    .eq('commercial_id', session.id)
    .neq('status', 'revoked')
    .order('sent_at', { ascending: false });

  return NextResponse.json({
    contracts: (data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      sent_at: c.sent_at,
      viewed_at: c.viewed_at,
      signed_at: c.signed_at,
      content_hash: c.content_hash,
    })),
  });
}
