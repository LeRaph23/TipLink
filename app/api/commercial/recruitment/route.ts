import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/service';
import {
  sendCommercialApplicationConfirmation,
  sendCommercialApplicationAdmin,
} from '@/lib/email';
import { getSuperAdminEmails } from '@/lib/admin/super-admins';

export const runtime = 'nodejs';

const ALLOWED_LEGAL_FORMS = new Set([
  'sarl','sas','sasu','ei','auto_entrepreneur','eurl','sa','autre',
]);
const ALLOWED_VRP_STATUSES = new Set([
  'vrp_exclusif','vrp_multicarte','agent_commercial','independant','autre',
]);
const VAT_RE = /^[A-Z]{2}[A-Z0-9]{2,12}$/;

function cleanSiret(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  return /^\d{14}$/.test(clean) ? clean : null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    firstName, lastName, email, phone, city, sector,
    companyName, legalForm, siret, vatNumber, vrpStatus,
    notes, noFraudPledge,
  } = body as Record<string, string | boolean | undefined>;

  // Required string fields
  for (const [k, v] of Object.entries({ firstName, lastName, email, phone, city, companyName, legalForm, vrpStatus, siret })) {
    if (!v || typeof v !== 'string' || !v.trim()) {
      return NextResponse.json({ error: `Champ requis manquant : ${k}` }, { status: 400 });
    }
  }

  if (!noFraudPledge) {
    return NextResponse.json({ error: "Vous devez accepter l'engagement de non-fraude." }, { status: 400 });
  }

  if (!String(email).includes('@')) {
    return NextResponse.json({ error: 'Email invalide.' }, { status: 400 });
  }

  if (!ALLOWED_LEGAL_FORMS.has(String(legalForm))) {
    return NextResponse.json({ error: 'Forme juridique invalide.' }, { status: 400 });
  }
  if (!ALLOWED_VRP_STATUSES.has(String(vrpStatus))) {
    return NextResponse.json({ error: 'Statut commercial invalide.' }, { status: 400 });
  }

  const siretClean = cleanSiret(String(siret));
  if (!siretClean) {
    return NextResponse.json({ error: 'SIRET invalide — 14 chiffres requis.' }, { status: 400 });
  }

  let vatClean: string | null = null;
  if (vatNumber !== undefined && String(vatNumber).trim() !== '') {
    const candidate = String(vatNumber).replace(/\s+/g, '').toUpperCase();
    if (!VAT_RE.test(candidate)) {
      return NextResponse.json({ error: 'N° TVA intracommunautaire invalide.' }, { status: 400 });
    }
    vatClean = candidate;
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const ipHash = crypto.createHash('sha256').update(ip).digest('hex');

  const service = createServiceClient();

  // Rate limit: max 3 applications per IP per 24h — same shape as ambassador route.
  const { count } = await service
    .from('commercial_recruitment_applications')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', new Date(Date.now() - 86400000).toISOString());
  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'Trop de candidatures depuis cette adresse, veuillez réessayer demain.' },
      { status: 429 },
    );
  }

  const firstNameStr = String(firstName).trim();
  const lastNameStr = String(lastName).trim();
  const emailStr = String(email).trim();
  const phoneStr = String(phone).trim();
  const cityStr = String(city).trim();
  const companyStr = String(companyName).trim();
  const sectorStr = sector ? String(sector).trim() : null;
  const notesStr = notes ? String(notes).slice(0, 2000) : null;

  const { error } = await service.from('commercial_recruitment_applications').insert({
    first_name: firstNameStr,
    last_name: lastNameStr,
    email: emailStr,
    phone: phoneStr,
    city: cityStr,
    sector: sectorStr,
    company_name: companyStr,
    legal_form: String(legalForm),
    vat_number: vatClean,
    siret: siretClean,
    vrp_status: String(vrpStatus),
    notes: notesStr,
    no_fraud_pledge: true,
    ip_hash: ipHash,
  });

  if (error) {
    console.error('commercial recruitment insert failed', error);
    return NextResponse.json({ error: 'Erreur enregistrement' }, { status: 500 });
  }

  // Notify candidate + super admins (best effort, never block the response).
  const superAdminEmails = await getSuperAdminEmails(service).catch(() => []);
  const adminRecipients = [
    ...new Set([
      ...superAdminEmails,
      ...(process.env.ADMIN_NOTIFICATION_EMAIL ? [process.env.ADMIN_NOTIFICATION_EMAIL] : []),
    ]),
  ];

  await Promise.all([
    sendCommercialApplicationConfirmation({ to: emailStr, firstName: firstNameStr }).catch(() => {}),
    sendCommercialApplicationAdmin({
      to: adminRecipients,
      firstName: firstNameStr,
      lastName: lastNameStr,
      email: emailStr,
      phone: phoneStr,
      city: cityStr,
      sector: sectorStr,
      companyName: companyStr,
      legalForm: String(legalForm),
      vatNumber: vatClean,
      siret: siretClean,
      vrpStatus: String(vrpStatus),
      notes: notesStr,
    }).catch(() => {}),
  ]);

  return NextResponse.json({ ok: true });
}
