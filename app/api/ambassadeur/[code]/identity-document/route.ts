import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { fileToDocument, uploadIdentityDocument } from '@/lib/stripe/identity';
import { verifyCookieValue } from '../auth/route';

export const runtime = 'nodejs';

async function authenticateAmbassador(req: NextRequest, code: string) {
  const cookieValue = req.cookies.get('amb_session')?.value;
  if (!cookieValue) return null;
  const secret = process.env.AMBASSADOR_SESSION_SECRET ?? null;
  if (!secret) return null;
  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return null;
  return ambassadorId;
}

// POST — upload an identity document for this ambassador's Stripe account.
// Used only when Stripe lists a verification document as required.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const ambassadorId = await authenticateAmbassador(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: amb } = await service
    .from('ambassadors')
    .select('stripe_account_id')
    .eq('id', ambassadorId)
    .maybeSingle();

  if (!amb?.stripe_account_id) {
    return NextResponse.json({ error: 'Aucun compte bancaire configuré' }, { status: 400 });
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }

  const front = await fileToDocument(formData.get('front'));
  if ('error' in front) {
    return NextResponse.json({ error: front.error }, { status: 400 });
  }

  const backRaw = formData.get('back');
  let back = null;
  if (backRaw instanceof File && backRaw.size > 0) {
    const parsed = await fileToDocument(backRaw);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    back = parsed;
  }

  try {
    await uploadIdentityDocument(amb.stripe_account_id, front, back);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Envoi du document échoué';
    console.error('ambassador identity-document upload failed', err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
