import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { sendAmbassadorApplicationConfirmation, sendAmbassadorApplicationAdmin } from '@/lib/email';

export const runtime = 'nodejs';

function validateSiret(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  if (!/^\d{14}$/.test(clean)) return null;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = parseInt(clean[i], 10);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0 ? clean : null;
}

export async function POST(req: NextRequest) {
  const expectedToken = process.env.AMBASSADOR_RECRUITMENT_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: 'Recrutement non configuré' }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    token, firstName, lastName, city, phone, email, siret, noFraudPledge, notes,
  } = body as Record<string, string | boolean | undefined>;

  if (token !== expectedToken) {
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
  });

  if (error) {
    console.error('recruitment insert failed', error);
    return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 });
  }

  const firstNameStr = String(firstName).trim();
  await Promise.all([
    sendAmbassadorApplicationConfirmation({
      to: String(email).trim(),
      firstName: firstNameStr,
    }).catch(() => {}),
    sendAmbassadorApplicationAdmin({
      firstName: firstNameStr,
      lastName: String(lastName).trim(),
      city: String(city).trim(),
      phone: String(phone).trim(),
      email: String(email).trim(),
      siret: siretClean,
      notes: notes ? String(notes) : null,
    }).catch(() => {}),
  ]);

  return NextResponse.json({ ok: true });
}
