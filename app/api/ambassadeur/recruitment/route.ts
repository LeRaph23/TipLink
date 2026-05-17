import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import {
  sendAmbassadorApplicationConfirmation,
  sendAmbassadorApplicationAdmin,
  sendReferralWelcomeToCandidate,
} from '@/lib/email';
import { resolveReferralCode } from '@/lib/referrals';
import { getSuperAdminEmails } from '@/lib/admin/super-admins';

export const runtime = 'nodejs';

// SIRET format check: 14 digits, whitespace tolerated. We intentionally do
// NOT enforce a Luhn checksum here — La Poste (SIREN 356 000 000) and a few
// other legitimate SIRETs fail standard Luhn, and the canonical existence
// check is done downstream via the SIRENE API and admin review.
function validateSiret(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  return /^\d{14}$/.test(clean) ? clean : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    token, firstName, lastName, city, phone, email, siret, noFraudPledge, notes,
    referrerCode, source,
  } = body as Record<string, string | boolean | undefined>;

  const expectedToken = process.env.AMBASSADOR_RECRUITMENT_TOKEN;
  const isPrivateInvite = expectedToken && token === expectedToken;
  const isPublicLanding = !token;

  if (!isPrivateInvite && !isPublicLanding) {
    return NextResponse.json({ error: 'Lien invalide' }, { status: 403 });
  }

  if (!firstName || !lastName || !city || !phone || !email || !siret) {
    return NextResponse.json({ error: 'Tous les champs sont obligatoires.' }, { status: 400 });
  }
  if (!noFraudPledge) {
    return NextResponse.json({ error: 'Vous devez accepter l\'engagement de non-fraude.' }, { status: 400 });
  }

  const siretClean = validateSiret(String(siret));
  if (!siretClean) {
    return NextResponse.json({
      error: "SIRET invalide. Pas encore de SIRET ? Crée-le gratuitement sur autoentrepreneur.urssaf.fr.",
    }, { status: 400 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

  const service = createServiceClient();

  if (isPublicLanding) {
    const { count } = await service
      .from('ambassador_recruitment_applications')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', new Date(Date.now() - 86400000).toISOString());
    if ((count ?? 0) >= 3) {
      return NextResponse.json({ error: 'Trop de candidatures depuis cette adresse, réessaie demain.' }, { status: 429 });
    }
  }

  let referrer: { id: string; name: string } | null = null;
  if (typeof referrerCode === 'string' && referrerCode.trim()) {
    referrer = await resolveReferralCode(service, referrerCode);
  }

  const resolvedSource = typeof source === 'string' && source
    ? source
    : isPrivateInvite ? 'private_token' : referrer ? 'referral' : 'landing';

  const { error } = await service.from('ambassador_recruitment_applications').insert({
    first_name: String(firstName).trim(),
    last_name: String(lastName).trim(),
    city: String(city).trim(),
    phone: String(phone).trim(),
    email: String(email).trim(),
    siret: siretClean,
    no_fraud_pledge: true,
    notes: notes ? String(notes).slice(0, 1000) : null,
    ip_hash: ipHash,
    referrer_ambassador_id: referrer?.id ?? null,
    referrer_code_used: referrer ? String(referrerCode).trim().toUpperCase() : null,
    source: resolvedSource,
  });

  if (error) {
    console.error('recruitment insert failed', error);
    return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 });
  }

  const firstNameStr = String(firstName).trim();
  const lastNameStr = String(lastName).trim();
  const cityStr = String(city).trim();
  const phoneStr = String(phone).trim();
  const emailStr = String(email).trim();

  // Notify every super admin so a new application is never missed, even if
  // nobody is watching the dashboard. ADMIN_NOTIFICATION_EMAIL is kept as an
  // extra recipient when set.
  const superAdminEmails = await getSuperAdminEmails(service).catch(() => []);
  const adminRecipients = [
    ...new Set([
      ...superAdminEmails,
      ...(process.env.ADMIN_NOTIFICATION_EMAIL ? [process.env.ADMIN_NOTIFICATION_EMAIL] : []),
    ]),
  ];

  await Promise.all([
    referrer
      ? sendReferralWelcomeToCandidate({ to: emailStr, firstName: firstNameStr, parrainName: referrer.name }).catch(() => {})
      : sendAmbassadorApplicationConfirmation({ to: emailStr, firstName: firstNameStr }).catch(() => {}),
    sendAmbassadorApplicationAdmin({
      to: adminRecipients,
      firstName: firstNameStr,
      lastName: lastNameStr,
      city: cityStr,
      phone: phoneStr,
      email: emailStr,
      siret: siretClean,
      notes: notes ? String(notes) : null,
    }).catch(() => {}),
  ]);

  return NextResponse.json({ ok: true });
}
