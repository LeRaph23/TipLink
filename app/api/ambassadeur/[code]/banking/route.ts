import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { provisionMangopayAccount } from '@/lib/mangopay/onboarding';
import { getRecipient } from '@/lib/mangopay/recipients';
import { getBaseUrl } from '@/lib/env';
import { verifyCookieValue } from '../auth/route';
import { sendAmbassadorBankingConfirmation } from '@/lib/email';
import { validateIban } from '@/lib/banking/iban';

export const runtime = 'nodejs';

function getSecret(): string | null {
  return process.env.AMBASSADOR_SESSION_SECRET ?? null;
}

async function authenticateAmbassador(req: NextRequest, code: string) {
  const cookieValue = req.cookies.get('amb_session')?.value;
  if (!cookieValue) return null;
  const secret = getSecret();
  if (!secret) return null;
  const { valid, ambassadorId } = verifyCookieValue(cookieValue, code, secret);
  if (!valid || !ambassadorId) return null;
  return ambassadorId;
}

// SIRET format check: 14 digits only. No Luhn — see recruitment route for
// why (La Poste and a few other valid SIRETs fail standard Luhn).
function validateSiret(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  return /^\d{14}$/.test(clean) ? clean : null;
}

// POST — create the ambassador's Mangopay account (OWNER user + EUR wallet +
// IBAN Recipient) and return the hosted SCA redirect.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const ambassadorId = await authenticateAmbassador(req, code);
  if (!ambassadorId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    firstName, lastName, dob, address, iban, siret, email, phone, tosAccepted,
  } = body as {
    firstName?: string; lastName?: string;
    dob?: { day: number; month: number; year: number };
    address?: { line1: string; city: string; postal_code: string; country?: string };
    iban?: string; siret?: string; email?: string; phone?: string;
    tosAccepted?: boolean;
  };

  if (!firstName || !lastName) return NextResponse.json({ error: 'Nom complet requis' }, { status: 400 });
  if (!dob?.day || !dob.month || !dob.year) return NextResponse.json({ error: 'Date de naissance requise' }, { status: 400 });
  if (!address?.line1 || !address.city || !address.postal_code) {
    return NextResponse.json({ error: 'Adresse complète requise' }, { status: 400 });
  }
  const ibanResult = validateIban(iban);
  if (!ibanResult.ok) {
    return NextResponse.json({ error: ibanResult.error }, { status: 400 });
  }
  if (!email) return NextResponse.json({ error: 'Email requis' }, { status: 400 });
  if (!tosAccepted) return NextResponse.json({ error: 'Vous devez accepter les conditions Mangopay' }, { status: 400 });

  const siretClean = siret ? validateSiret(siret) : null;
  if (!siretClean) {
    return NextResponse.json({
      error: "SIRET invalide. Pas encore de SIRET ? Crée-le gratuitement sur autoentrepreneur.urssaf.fr avant de continuer.",
    }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: amb } = await service
    .from('ambassadors')
    .select('id, mangopay_user_id, name')
    .eq('id', ambassadorId)
    .maybeSingle();

  if (!amb) return NextResponse.json({ error: 'Ambassadeur introuvable' }, { status: 404 });
  if (amb.mangopay_user_id) {
    return NextResponse.json({ error: 'Compte bancaire déjà configuré' }, { status: 400 });
  }

  const result = await provisionMangopayAccount({
    firstName,
    lastName,
    email,
    dob,
    address: {
      line1: address.line1,
      city: address.city,
      postal_code: address.postal_code,
      country: address.country ?? ibanResult.country,
    },
    iban: ibanResult.normalized,
    walletDescription: `TipLink ambassadeur — ${firstName} ${lastName}`,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { error: dbErr } = await service
    .from('ambassadors')
    .update({
      mangopay_user_id: result.userId,
      mangopay_wallet_id: result.walletId,
      mangopay_recipient_id: result.recipientId,
      siret: siretClean,
      email,
      phone: phone ?? null,
      city: address.city,
      onboarding_status: 'pending',
    })
    .eq('id', ambassadorId);

  if (dbErr) {
    console.error('ambassador banking db update failed', dbErr);
    return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 });
  }

  await sendAmbassadorBankingConfirmation({ to: email, firstName }).catch(() => {});

  // The browser must finish the hosted SCA session to activate the Recipient.
  let scaRedirectUrl: string | null = null;
  if (result.scaRedirectUrl) {
    const returnUrl = `${getBaseUrl()}/ambassadeur/${code}`;
    const sep = result.scaRedirectUrl.includes('?') ? '&' : '?';
    scaRedirectUrl = `${result.scaRedirectUrl}${sep}returnUrl=${encodeURIComponent(returnUrl)}`;
  }

  return NextResponse.json({ ok: true, scaRedirectUrl });
}

// GET — banking status. Doubles as the SCA finalisation step: once the
// Recipient is active, the ambassador's SCA consent is recorded.
export async function GET(
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
    .select('mangopay_user_id, mangopay_recipient_id, mangopay_kyc_status, mangopay_sca_enrolled, onboarding_status, siret, email, phone, city')
    .eq('id', ambassadorId)
    .maybeSingle();

  let recipientActive = false;
  if (amb?.mangopay_recipient_id) {
    try {
      const recipient = await getRecipient(amb.mangopay_recipient_id);
      recipientActive = recipient.Status === 'ACTIVE';
    } catch (err) {
      console.error('ambassador recipient lookup failed', err);
    }
  }

  // Record SCA consent the first time we see the Recipient active.
  if (recipientActive && amb && !amb.mangopay_sca_enrolled) {
    await service
      .from('ambassadors')
      .update({ mangopay_sca_enrolled: true })
      .eq('id', ambassadorId);
  }

  const kycStatus = amb?.mangopay_kyc_status ?? 'none';
  return NextResponse.json({
    hasStripeAccount: !!amb?.mangopay_user_id,
    onboardingStatus: amb?.onboarding_status ?? 'not_started',
    siret: amb?.siret ?? null,
    email: amb?.email ?? null,
    phone: amb?.phone ?? null,
    city: amb?.city ?? null,
    needsIdentityDocument: !!amb?.mangopay_user_id && (kycStatus === 'none' || kycStatus === 'refused'),
    pendingVerification: kycStatus === 'pending',
    payoutsEnabled: recipientActive && kycStatus === 'validated',
  });
}
