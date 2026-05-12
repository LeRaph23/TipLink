'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';

async function requireSuperAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'super_admin')
    .limit(1);
  if (!roles?.length) throw new Error('Forbidden');
  return user;
}

function validateSiret(raw: string): string | null {
  const clean = raw.replace(/\s+/g, '');
  if (!/^\d{14}$/.test(clean)) return null;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let d = parseInt(clean[i], 10);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0 ? clean : null;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
    if (c === '"') { inQuotes = !inQuotes; continue; }
    if (c === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

// Rough heuristic: a first name's birth year estimate based on common
// French naming trends. Returns null when unknown. The exact mapping is
// pragmatic, not authoritative — used only as a filter signal.
const YOUNG_FIRST_NAMES = new Set([
  'EMMA','LEA','LÉA','LOUISE','CHLOE','CHLOÉ','INES','INÈS','LINA','MILA','JADE','JULIA','JULIETTE','ROSE','EVA','ELENA','ALICE','LILOU','LOLA','MIA',
  'LUCAS','GABRIEL','RAPHAEL','RAPHAËL','ADAM','ARTHUR','LOUIS','JULES','LIAM','HUGO','LEO','LÉO','NOAH','TIMEO','TIMÉO','MAEL','MAËL','TOM','ETHAN','NATHAN','THEO','THÉO','SACHA','AARON','ELIAS','ELIOTT','ENZO',
]);

function estimateBirthYear(firstName: string | null | undefined): number | null {
  if (!firstName) return null;
  const upper = firstName.toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (YOUNG_FIRST_NAMES.has(upper)) return 2003;
  return null;
}

export type CsvRow = {
  siret?: string; company_name?: string; email?: string;
  first_name?: string; city?: string; naf_code?: string; creation_date?: string;
};

export async function importColdEmailProspects(
  csvText: string
): Promise<
  | { ok: true; inserted: number; skipped: number; errors: string[] }
  | { ok: false; error: string }
> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return { ok: false, error: 'CSV vide ou sans en-tête.' };

    const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const idx = {
      siret: col('siret'),
      company_name: col('company_name'),
      email: col('email'),
      first_name: col('first_name'),
      city: col('city'),
      naf_code: col('naf_code'),
      creation_date: col('creation_date'),
    };
    if (idx.siret === -1) return { ok: false, error: 'Colonne siret manquante.' };

    const errors: string[] = [];
    let inserted = 0;
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      const rawSiret = cells[idx.siret]?.trim() ?? '';
      const siret = validateSiret(rawSiret);
      if (!siret) { errors.push(`Ligne ${i + 1} : SIRET invalide`); skipped++; continue; }

      const firstName = idx.first_name >= 0 ? (cells[idx.first_name]?.trim() || null) : null;
      const birthYearEstimate = estimateBirthYear(firstName);

      const row = {
        siret,
        company_name: idx.company_name >= 0 ? (cells[idx.company_name]?.trim() || null) : null,
        email: idx.email >= 0 ? (cells[idx.email]?.trim().toLowerCase() || null) : null,
        first_name: firstName,
        city: idx.city >= 0 ? (cells[idx.city]?.trim() || null) : null,
        naf_code: idx.naf_code >= 0 ? (cells[idx.naf_code]?.trim() || null) : null,
        creation_date: idx.creation_date >= 0 ? (cells[idx.creation_date]?.trim() || null) : null,
        birth_year_estimate: birthYearEstimate,
      };

      const { error } = await service
        .from('cold_email_prospects')
        .upsert(row, { onConflict: 'siret', ignoreDuplicates: true });

      if (error) { errors.push(`Ligne ${i + 1} : ${error.message}`); skipped++; }
      else { inserted++; }
    }

    await logAdminAction('cold_email.import', { inserted, skipped, errorCount: errors.length });

    return { ok: true, inserted, skipped, errors: errors.slice(0, 20) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function getColdEmailStats(): Promise<
  | { ok: true; stats: { total: number; step0: number; step1: number; step2: number; step3: number; unsubscribed: number; replied: number } }
  | { ok: false; error: string }
> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const [total, step0, step1, step2, step3, unsub, replied] = await Promise.all([
      service.from('cold_email_prospects').select('id', { count: 'exact', head: true }),
      service.from('cold_email_prospects').select('id', { count: 'exact', head: true }).eq('sequence_step', 0),
      service.from('cold_email_prospects').select('id', { count: 'exact', head: true }).eq('sequence_step', 1),
      service.from('cold_email_prospects').select('id', { count: 'exact', head: true }).eq('sequence_step', 2),
      service.from('cold_email_prospects').select('id', { count: 'exact', head: true }).eq('sequence_step', 3),
      service.from('cold_email_prospects').select('id', { count: 'exact', head: true }).not('unsubscribed_at', 'is', null),
      service.from('cold_email_prospects').select('id', { count: 'exact', head: true }).not('replied_at', 'is', null),
    ]);

    return {
      ok: true,
      stats: {
        total: total.count ?? 0,
        step0: step0.count ?? 0,
        step1: step1.count ?? 0,
        step2: step2.count ?? 0,
        step3: step3.count ?? 0,
        unsubscribed: unsub.count ?? 0,
        replied: replied.count ?? 0,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
