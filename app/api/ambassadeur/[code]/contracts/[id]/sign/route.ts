import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getAmbassadorSession } from '@/lib/ambassadeur/session';
import { getRequestIp, hashIp, sha256Hex } from '@/lib/ambassadeur/templates';
import { decodeSignaturePng } from '@/lib/ambassadeur/contracts';
import { sendSignedContractCopy } from '@/lib/email';

export const runtime = 'nodejs';

const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;
const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://digitip.app';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string; id: string }> },
) {
  const { code, id } = await params;
  const session = await getAmbassadorSession(req, code);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { signatureDataUrl, consentChecked } = body as {
    signatureDataUrl?: string;
    consentChecked?: boolean;
  };

  if (!consentChecked) {
    return NextResponse.json({ error: 'Tu dois accepter la clause de consentement.' }, { status: 400 });
  }
  if (typeof signatureDataUrl !== 'string' || !signatureDataUrl) {
    return NextResponse.json({ error: 'Signature manquante.' }, { status: 400 });
  }

  let pngBuffer: Buffer;
  try {
    pngBuffer = decodeSignaturePng(signatureDataUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signature invalide';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const service = createServiceClient();

  // Lock the contract row in a single read to validate state + integrity
  const { data: contract } = await service
    .from('ambassador_contracts')
    .select('id, ambassador_id, status, content_snapshot, content_hash, title')
    .eq('id', id)
    .maybeSingle();

  if (!contract || contract.ambassador_id !== session.id) {
    return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 });
  }
  if (contract.status === 'signed') {
    return NextResponse.json({ error: 'Contrat déjà signé.' }, { status: 409 });
  }
  if (contract.status === 'revoked') {
    return NextResponse.json({ error: 'Contrat révoqué.' }, { status: 410 });
  }

  // Verify integrity: the snapshot must still hash to the recorded hash.
  // Detects any silent tampering with the stored content before signing.
  const recomputed = sha256Hex(contract.content_snapshot);
  if (recomputed !== contract.content_hash) {
    return NextResponse.json({ error: 'Intégrité du contrat compromise. Signature refusée.' }, { status: 409 });
  }

  const signedAt = new Date().toISOString();
  const ip = getRequestIp(req.headers);
  const ipHash = hashIp(ip);
  const userAgent = req.headers.get('user-agent') ?? null;

  // Upload signature PNG to private bucket: <contractId>/<timestamp>.png
  const signaturePath = `${contract.id}/${Date.now()}.png`;
  const { error: uploadErr } = await service.storage
    .from('ambassador-signatures')
    .upload(signaturePath, pngBuffer, {
      contentType: 'image/png',
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json({ error: `Upload signature échoué: ${uploadErr.message}` }, { status: 500 });
  }

  const { error: updateErr } = await service
    .from('ambassador_contracts')
    .update({
      status: 'signed',
      signed_at: signedAt,
      signature_image_path: signaturePath,
      signer_ip_hash: ipHash,
      signer_user_agent: userAgent,
    })
    .eq('id', id)
    .eq('status', contract.status); // optimistic concurrency: refuse if changed

  if (updateErr) {
    // Best effort: try to clean uploaded file (signature wasn't persisted in row)
    await service.storage.from('ambassador-signatures').remove([signaturePath]).catch(() => {});
    return NextResponse.json({ error: `Signature refusée: ${updateErr.message}` }, { status: 500 });
  }

  await service.from('ambassador_contract_audit_log').insert({
    contract_id: id,
    action: 'signed',
    actor_type: 'ambassador',
    actor_id: session.id,
    ip_hash: ipHash,
    user_agent: userAgent,
    details: { content_hash: contract.content_hash, signature_path: signaturePath },
  });

  const downloadUrl = `${BASE_URL}/fr/ambassadeur/${code.toLowerCase()}?tab=contracts&download=${contract.id}`;
  const firstName = session.name.split(' ')[0] ?? session.name;

  // Send signed copy to ambassador (and admin if configured)
  if (session.email) {
    await sendSignedContractCopy({
      to: session.email,
      firstName,
      contractTitle: contract.title,
      signedAt,
      contentHash: contract.content_hash,
      downloadUrl,
    }).catch(() => {});
  }
  if (ADMIN_EMAIL) {
    await sendSignedContractCopy({
      to: ADMIN_EMAIL,
      firstName: `Admin (signé par ${session.name})`,
      contractTitle: contract.title,
      signedAt,
      contentHash: contract.content_hash,
      downloadUrl,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, signed_at: signedAt, content_hash: contract.content_hash });
}
