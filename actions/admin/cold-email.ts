'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { searchSirene, estimateBirthYearFromFirstName, type SireneSearchOptions } from '@/lib/sirene';
import type { Database } from '@/types/database';

type ProspectUpdate = Database['public']['Tables']['cold_email_prospects']['Update'];

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

// Strict Next.js rule: a 'use server' file may only export ASYNC FUNCTIONS.
// Even types must not be re-exported — older Next bundlers leave the export
// line in the .js output. Both `ColdTargetProgram` and `NAF_PRESETS` live in
// lib/cold-email/programs.ts; consumers import from there directly.
import type { ColdTargetProgram } from '@/lib/cold-email/programs';

export type SireneScrapeInput = {
  nafCodes: string[];
  monthsBack: number;          // creation_date >= NOW - monthsBack months
  postalCodePrefix?: string;
  maxPages: number;            // pages to fetch (each ~100 results)
  youngOnly?: boolean;         // if true, only keep prospects with birth_year_estimate set
  targetProgram?: ColdTargetProgram; // defaults to 'ambassador' for legacy callers
  /**
   * SIRENE `trancheEffectifsUniteLegale` codes to restrict to.
   * Pass `['NN','00','01','02']` to keep only ≤5 salariés ("à leur compte").
   * Omit to disable the size filter (all sizes accepted).
   */
  trancheEffectifs?: string[];
};

export async function scrapeSireneProspects(
  input: SireneScrapeInput
): Promise<
  | { ok: true; fetched: number; inserted: number; skippedYoung: number; skippedEmpty: number; skippedDuplicates: number; errors: string[] }
  | { ok: false; error: string }
> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    if (!input.nafCodes.length) return { ok: false, error: 'Aucun code NAF sélectionné.' };
    const maxPages = Math.min(Math.max(1, input.maxPages), 20);
    const monthsBack = Math.min(Math.max(1, input.monthsBack), 36);
    const targetProgram: ColdTargetProgram = input.targetProgram ?? 'ambassador';

    const createdAfter = new Date(Date.now() - monthsBack * 30 * 86400000)
      .toISOString().slice(0, 10);

    const baseQuery: SireneSearchOptions = {
      nafCodes: input.nafCodes,
      createdAfter,
      postalCodePrefix: input.postalCodePrefix?.trim() || undefined,
      // Commercial pros are typically legal entities (SASU / SARL / SAS /
      // EI) — restricting to personnes physiques would miss the bulk of
      // the audience. Ambassadeurs keep the AE-only filter.
      personnePhysiqueOnly: targetProgram === 'ambassador',
      trancheEffectifs: input.trancheEffectifs && input.trancheEffectifs.length > 0
        ? input.trancheEffectifs
        : undefined,
      pageSize: 100,
    };

    const errors: string[] = [];
    let fetched = 0;
    let inserted = 0;
    let skippedYoung = 0;
    let skippedEmpty = 0;
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
        // Drop rows where SIRENE masked everything ("[ND]" already cleaned
        // to null in mapEtablissement) — no name + no company = unusable.
        if (!item.companyName && !item.firstName && !item.lastName) {
          skippedEmpty++;
          continue;
        }

        const birthYear = estimateBirthYear(item.firstName);
        if (input.youngOnly && birthYear === null) { skippedYoung++; continue; }

        const notesParts = [
          `Source: SIRENE INSEE`,
          item.nafCode ? `NAF ${item.nafCode}` : null,
          item.postalCode ? `CP ${item.postalCode}` : null,
        ].filter(Boolean);

        const row = {
          siret: item.siret,
          company_name: item.companyName,
          email: null as string | null,
          first_name: item.firstName,
          city: item.city,
          naf_code: item.nafCode,
          creation_date: item.creationDate,
          birth_year_estimate: birthYear,
          target_program: targetProgram,
          notes: notesParts.join(' · '),
        };

        // Composite UNIQUE on (siret, target_program) allows the same SIRET to
        // exist in both programmes independently (rare but legitimate).
        const { error, count } = await service
          .from('cold_email_prospects')
          .upsert(row, { onConflict: 'siret,target_program', ignoreDuplicates: true, count: 'exact' });

        if (error) errors.push(`SIRET ${item.siret} : ${error.message}`);
        else if ((count ?? 0) === 0) skippedDuplicates++;
        else inserted++;
      }

      if (!pageResult.hasMore) break;
      await new Promise(r => setTimeout(r, 200));
    }

    await logAdminAction('cold_email.scrape_sirene', {
      nafCodes: input.nafCodes,
      targetProgram,
      monthsBack,
      maxPages,
      fetched,
      inserted,
      skippedYoung,
      skippedDuplicates,
      errorCount: errors.length,
    });

    return { ok: true, fetched, inserted, skippedYoung, skippedEmpty, skippedDuplicates, errors: errors.slice(0, 10) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export type ProspectStatus = 'not_contacted' | 'contacted' | 'in_discussion' | 'accepted' | 'refused';

export type ProspectRow = {
  id: string;
  siret: string | null;
  company_name: string | null;
  email: string | null;
  first_name: string | null;
  city: string | null;
  naf_code: string | null;
  creation_date: string | null;
  imported_at: string;
  notes: string | null;
  linkedin_url: string | null;
  website: string | null;
  status: ProspectStatus;
  target_program: ColdTargetProgram;
  sequence_step: number;
  last_sent_at: string | null;
  unsubscribed_at: string | null;
  replied_at: string | null;
  enrichment_attempted_at: string | null;
  enrichment_source: string | null;
};

export async function listProspects(
  filter?: { targetProgram?: ColdTargetProgram },
): Promise<{ ok: true; prospects: ProspectRow[] } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    let q = service
      .from('cold_email_prospects')
      .select('id, siret, company_name, email, first_name, city, naf_code, creation_date, imported_at, notes, linkedin_url, website, status, target_program, sequence_step, last_sent_at, unsubscribed_at, replied_at, enrichment_attempted_at, enrichment_source')
      .order('imported_at', { ascending: false })
      .limit(2000);
    if (filter?.targetProgram) q = q.eq('target_program', filter.targetProgram);
    const { data, error } = await q;
    if (error) return { ok: false, error: error.message };
    return { ok: true, prospects: (data ?? []) as ProspectRow[] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

const ALLOWED_STATUSES: ProspectStatus[] = ['not_contacted', 'contacted', 'in_discussion', 'accepted', 'refused'];

export async function updateProspect(
  id: string,
  patch: Partial<{ email: string | null; linkedin_url: string | null; website: string | null; notes: string | null; status: ProspectStatus; company_name: string | null; first_name: string | null }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    if (!id) return { ok: false, error: 'id requis' };

    const update: ProspectUpdate = {};
    if ('email' in patch) {
      const v = patch.email?.trim().toLowerCase() || null;
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, error: 'Email invalide' };
      update.email = v;
    }
    if ('linkedin_url' in patch) {
      const v = patch.linkedin_url?.trim() || null;
      if (v && !/^https?:\/\/(www\.)?linkedin\.com\//i.test(v)) return { ok: false, error: 'URL LinkedIn invalide' };
      update.linkedin_url = v;
    }
    if ('website' in patch) {
      let v = patch.website?.trim() || null;
      if (v) {
        // Accept "exemple.fr" — auto-prepend https:// and validate.
        if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
        try { new URL(v); } catch { return { ok: false, error: 'URL site web invalide' }; }
      }
      update.website = v;
    }
    if ('notes' in patch) update.notes = patch.notes?.trim() || null;
    if ('company_name' in patch) update.company_name = patch.company_name?.trim() || null;
    if ('first_name' in patch) update.first_name = patch.first_name?.trim() || null;
    if ('status' in patch && patch.status) {
      if (!ALLOWED_STATUSES.includes(patch.status)) return { ok: false, error: 'Statut invalide' };
      update.status = patch.status;
    }

    if (Object.keys(update).length === 0) return { ok: true };

    const service = createServiceClient();
    const { error } = await service.from('cold_email_prospects').update(update).eq('id', id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction('cold_email.update_prospect', { id, fields: Object.keys(update) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function createManualProspect(
  input: { company_name?: string; first_name?: string; email?: string; linkedin_url?: string; city?: string; notes?: string; targetProgram?: ColdTargetProgram }
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const company = input.company_name?.trim() || null;
    const firstName = input.first_name?.trim() || null;
    const email = input.email?.trim().toLowerCase() || null;
    const linkedin = input.linkedin_url?.trim() || null;
    const city = input.city?.trim() || null;
    const notes = input.notes?.trim() || null;

    if (!company && !firstName && !email && !linkedin) {
      return { ok: false, error: 'Renseigne au moins un nom, email ou LinkedIn' };
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Email invalide' };
    if (linkedin && !/^https?:\/\/(www\.)?linkedin\.com\//i.test(linkedin)) return { ok: false, error: 'URL LinkedIn invalide' };

    const { data, error } = await service
      .from('cold_email_prospects')
      .insert({
        siret: null,
        company_name: company,
        first_name: firstName,
        email,
        linkedin_url: linkedin,
        city,
        notes,
        status: 'not_contacted',
        target_program: input.targetProgram ?? 'ambassador',
      })
      .select('id')
      .single();

    if (error || !data) return { ok: false, error: error?.message ?? 'Erreur insertion' };
    await logAdminAction('cold_email.create_prospect', { id: data.id });
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function deleteProspect(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    if (!id) return { ok: false, error: 'id requis' };
    const service = createServiceClient();
    const { error } = await service.from('cold_email_prospects').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction('cold_email.delete_prospect', { id });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

// ─── Enrichment ─────────────────────────────────────────────────────────────

export type EnrichBatchResult = {
  considered: number;
  enriched: number;          // got either email or website
  withEmail: number;
  withWebsite: number;
  remaining: number;         // prospects still un-enriched after this batch
};

/**
 * Picks up to `limit` un-enriched prospects (no enrichment_attempted_at)
 * for the given programme and tries to find their website + email via
 * lib/cold-email/enrich. Each prospect's enrichment_attempted_at is set
 * unconditionally so we don't retry the same prospect forever, even on
 * failure. Concurrency capped at 5 to stay within Vercel function budget
 * and remain polite with the public APIs we hit.
 */
export async function enrichProspectsBatch(input: {
  targetProgram?: ColdTargetProgram;
  limit?: number;
}): Promise<{ ok: true; result: EnrichBatchResult } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const { enrichProspect } = await import('@/lib/cold-email/enrich');
    const service = createServiceClient();
    const program = input.targetProgram;
    const limit = Math.min(Math.max(1, input.limit ?? 25), 50);

    let q = service
      .from('cold_email_prospects')
      .select('id, siret, company_name, city')
      .is('enrichment_attempted_at', null)
      .is('unsubscribed_at', null)
      .is('replied_at', null)
      .order('imported_at', { ascending: false })
      .limit(limit);
    if (program) q = q.eq('target_program', program);
    const { data: rows, error: selErr } = await q;
    if (selErr) return { ok: false, error: selErr.message };

    let withEmail = 0;
    let withWebsite = 0;

    const CONCURRENCY = 5;
    const queue = [...(rows ?? [])];
    async function worker() {
      while (queue.length) {
        const row = queue.shift();
        if (!row) return;
        const r = await enrichProspect({
          siret: row.siret,
          companyName: row.company_name,
          city: row.city,
        }).catch(() => ({ email: null, website: null, source: 'error' }));
        const patch: ProspectUpdate = {
          enrichment_attempted_at: new Date().toISOString(),
          enrichment_source: r.source,
        };
        if (r.website) { patch.website = r.website; withWebsite++; }
        if (r.email) { patch.email = r.email; withEmail++; }
        await service.from('cold_email_prospects').update(patch).eq('id', row.id);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    // Count remaining prospects so the UI can keep clicking until 0.
    let remainingQ = service
      .from('cold_email_prospects')
      .select('id', { count: 'exact', head: true })
      .is('enrichment_attempted_at', null)
      .is('unsubscribed_at', null)
      .is('replied_at', null);
    if (program) remainingQ = remainingQ.eq('target_program', program);
    const { count: remaining } = await remainingQ;

    const considered = rows?.length ?? 0;
    await logAdminAction('cold_email.enrich_batch', {
      targetProgram: program ?? 'all',
      considered,
      withEmail,
      withWebsite,
      remaining: remaining ?? 0,
    });
    return {
      ok: true,
      result: {
        considered,
        enriched: withEmail + withWebsite - Math.min(withEmail, withWebsite), // distinct prospects touched
        withEmail,
        withWebsite,
        remaining: remaining ?? 0,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export type ColdEmailProgramStats = {
  total: number;
  step0: number;
  step1: number;
  step2: number;
  step3: number;
  unsubscribed: number;
  replied: number;
};

export async function getColdEmailStats(
  targetProgram?: ColdTargetProgram,
): Promise<{ ok: true; stats: ColdEmailProgramStats } | { ok: false; error: string }> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    const mk = () => {
      let q = service.from('cold_email_prospects').select('id', { count: 'exact', head: true });
      if (targetProgram) q = q.eq('target_program', targetProgram);
      return q;
    };

    const [total, step0, step1, step2, step3, unsub, replied] = await Promise.all([
      mk(),
      mk().eq('sequence_step', 0),
      mk().eq('sequence_step', 1),
      mk().eq('sequence_step', 2),
      mk().eq('sequence_step', 3),
      mk().not('unsubscribed_at', 'is', null),
      mk().not('replied_at', 'is', null),
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

/**
 * Manually fires a cold-email batch for one or both programmes from the admin
 * UI. Same `runColdEmailBatch` used by the daily cron, just gated by a small
 * cap so an accidental double-click can't drain a quota.
 */
export async function triggerColdEmailBatch(
  input: { targetProgram?: ColdTargetProgram; limit?: number } = {},
): Promise<
  | { ok: true; tallies: Array<{ program: ColdTargetProgram; considered: number; sent: number; skipped: number; failed: number }> }
  | { ok: false; error: string }
> {
  try {
    await requireSuperAdminUser();
    const { runColdEmailBatch } = await import('@/lib/cold-email/dispatch');
    const tallies = await runColdEmailBatch({
      program: input.targetProgram,
      limit: Math.min(Math.max(1, input.limit ?? 20), 100),
    });
    await logAdminAction('cold_email.trigger_batch', {
      targetProgram: input.targetProgram ?? 'all',
      tallies,
    });
    return { ok: true, tallies };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
