'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { searchSirene, estimateBirthYearFromFirstName, type SireneSearchOptions } from '@/lib/sirene';

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

// Birth-year heuristic shared with the SIRENE scraper (see lib/sirene.ts).
const estimateBirthYear = estimateBirthYearFromFirstName;

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

export async function enrichProspectEmails(
  csvText: string
): Promise<
  | { ok: true; updated: number; notFound: number; errors: string[] }
  | { ok: false; error: string }
> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return { ok: false, error: 'CSV vide.' };

    let updated = 0;
    let notFound = 0;
    const errors: string[] = [];

    const startIdx = /siret/i.test(lines[0]) ? 1 : 0;
    for (let i = startIdx; i < lines.length; i++) {
      const cells = parseCsvLine(lines[i]);
      const siret = validateSiret(cells[0] ?? '');
      const email = (cells[1] ?? '').trim().toLowerCase();
      if (!siret) { errors.push(`Ligne ${i + 1} : SIRET invalide`); continue; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Ligne ${i + 1} : email invalide`); continue; }

      const { count, error } = await service
        .from('cold_email_prospects')
        .update({ email })
        .eq('siret', siret)
        .is('email', null);

      if (error) errors.push(`SIRET ${siret} : ${error.message}`);
      else if ((count ?? 0) === 0) notFound++;
      else updated += count ?? 0;
    }

    await logAdminAction('cold_email.enrich_emails', { updated, notFound, errorCount: errors.length });
    return { ok: true, updated, notFound, errors: errors.slice(0, 10) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export type SireneScrapeInput = {
  nafCodes: string[];
  monthsBack: number;          // creation_date >= NOW - monthsBack months
  postalCodePrefix?: string;
  maxPages: number;            // pages to fetch (each ~100 results)
  youngOnly?: boolean;         // if true, only keep prospects with birth_year_estimate set
};

export async function scrapeSireneProspects(
  input: SireneScrapeInput
): Promise<
  | { ok: true; fetched: number; inserted: number; skippedYoung: number; skippedDuplicates: number; errors: string[] }
  | { ok: false; error: string }
> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    if (!input.nafCodes.length) return { ok: false, error: 'Aucun code NAF sélectionné.' };
    const maxPages = Math.min(Math.max(1, input.maxPages), 20);
    const monthsBack = Math.min(Math.max(1, input.monthsBack), 36);

    const createdAfter = new Date(Date.now() - monthsBack * 30 * 86400000)
      .toISOString().slice(0, 10);

    const baseQuery: SireneSearchOptions = {
      nafCodes: input.nafCodes,
      createdAfter,
      postalCodePrefix: input.postalCodePrefix?.trim() || undefined,
      personnePhysiqueOnly: true,
      pageSize: 100,
    };

    const errors: string[] = [];
    let fetched = 0;
    let inserted = 0;
    let skippedYoung = 0;
    let skippedDuplicates = 0;

    for (let page = 0; page < maxPages; page++) {
      let pageResult;
      try {
        pageResult = await searchSirene({ ...baseQuery, page });
      } catch (e) {
        errors.push(`Page ${page} : ${e instanceof Error ? e.message : 'erreur SIRENE'}`);
        break;
      }
      fetched += pageResult.results.length;

      for (const item of pageResult.results) {
        const birthYear = estimateBirthYear(item.firstName);
        if (input.youngOnly && birthYear === null) { skippedYoung++; continue; }

        const row = {
          siret: item.siret,
          company_name: item.companyName,
          email: null as string | null,
          first_name: item.firstName,
          city: item.city,
          naf_code: item.nafCode,
          creation_date: item.creationDate,
          birth_year_estimate: birthYear,
          notes: `Source: SIRENE INSEE · NAF ${item.nafCode ?? '?'} · ${item.postalCode ?? ''}`,
        };

        const { error, count } = await service
          .from('cold_email_prospects')
          .upsert(row, { onConflict: 'siret', ignoreDuplicates: true, count: 'exact' });

        if (error) errors.push(`SIRET ${item.siret} : ${error.message}`);
        else if ((count ?? 0) === 0) skippedDuplicates++;
        else inserted++;
      }

      if (!pageResult.hasMore) break;
      await new Promise(r => setTimeout(r, 200));
    }

    await logAdminAction('cold_email.scrape_sirene', {
      nafCodes: input.nafCodes,
      monthsBack,
      maxPages,
      fetched,
      inserted,
      skippedYoung,
      skippedDuplicates,
      errorCount: errors.length,
    });

    return { ok: true, fetched, inserted, skippedYoung, skippedDuplicates, errors: errors.slice(0, 10) };
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
