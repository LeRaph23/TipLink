import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getCommercialSession } from '@/lib/commercial/session';
import { getRequestIp, hashIp } from '@/lib/ambassadeur/templates';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code, id } = await params;
  const session = await getCommercialSession(req, code);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const service = createServiceClient();
  const { data: contract } = await service
    .from('commercial_contracts')
    .select('id, commercial_id, title, content_snapshot, content_hash, consent_text, status, sent_at, viewed_at, signed_at')
    .eq('id', id)
    .maybeSingle();

  if (!contract || contract.commercial_id !== session.id) {
    return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 });
  }
  if (contract.status === 'revoked') {
    return NextResponse.json({ error: 'Contrat révoqué' }, { status: 410 });
  }

  // Mark as viewed on first access — record the IP/UA in the audit log too.
  if (contract.status === 'sent') {
    const now = new Date().toISOString();
    await service
      .from('commercial_contracts')
      .update({ status: 'viewed', viewed_at: now })
      .eq('id', id);
    const ip = getRequestIp(req.headers);
    await service.from('commercial_contract_audit_log').insert({
      contract_id: id,
      action: 'viewed',
      actor_type: 'commercial',
      actor_id: session.id,
      ip_hash: hashIp(ip),
      user_agent: req.headers.get('user-agent') ?? null,
    });
    contract.status = 'viewed';
    contract.viewed_at = now;
  }

  return NextResponse.json({
    id: contract.id,
    title: contract.title,
    content_snapshot: contract.content_snapshot,
    content_hash: contract.content_hash,
    consent_text: contract.consent_text,
    status: contract.status,
    sent_at: contract.sent_at,
    viewed_at: contract.viewed_at,
    signed_at: contract.signed_at,
  });
}
