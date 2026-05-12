import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAmbassadorSession } from '@/lib/ambassadeur/session';
import { buildSignedContractPage } from '@/lib/ambassadeur/contracts';
import { getRequestIp, hashIp } from '@/lib/ambassadeur/templates';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code, id } = await params;
  const session = await getAmbassadorSession(req, code);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const service = createServiceClient();
  const { data: contract } = await service
    .from('ambassador_contracts')
    .select('id, ambassador_id, title, content_snapshot, content_hash, status, signed_at, signature_image_path, signer_ip_hash')
    .eq('id', id)
    .maybeSingle();

  if (!contract || contract.ambassador_id !== session.id) {
    return new NextResponse('Not found', { status: 404 });
  }
  if (contract.status !== 'signed' || !contract.signature_image_path || !contract.signed_at) {
    return new NextResponse('Not signed yet', { status: 409 });
  }

  // Fetch the signature PNG from the private bucket and inline as data URL
  const { data: blob, error } = await service.storage
    .from('ambassador-signatures')
    .download(contract.signature_image_path);
  if (error || !blob) return new NextResponse('Signature missing', { status: 500 });
  const buffer = Buffer.from(await blob.arrayBuffer());
  const signatureDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

  await service.from('ambassador_contract_audit_log').insert({
    contract_id: id,
    action: 'downloaded',
    actor_type: 'ambassador',
    actor_id: session.id,
    ip_hash: hashIp(getRequestIp(req.headers)),
    user_agent: req.headers.get('user-agent') ?? null,
  });

  const html = buildSignedContractPage({
    title: contract.title,
    contentSnapshot: contract.content_snapshot,
    signatureDataUrl,
    ambassadorName: session.name,
    signedAt: contract.signed_at,
    contentHash: contract.content_hash,
    signerIpHashShort: (contract.signer_ip_hash ?? '').slice(0, 8),
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}
