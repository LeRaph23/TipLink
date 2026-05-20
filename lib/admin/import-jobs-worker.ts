// Chunk-processing engine for the admin import jobs.
//
// Each call to `processJobChunk(jobId)` does ~30s of work, persists progress
// in the row, and either re-pokes the worker route (more to do) or marks the
// job completed/failed. State across chunks lives in `result.cursor`.
//
// Budget choice: maxDuration on the worker route is 60s; we cap work at 35s
// so the surrounding response, audit write, and follow-up poke have headroom.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/service';
import {
  fetchZonesForCity,
  fetchSalonsInBbox,
  reverseGeocode,
} from '@/lib/osm-import';
import { findGooglePlaceForSalon } from '@/lib/google-places';
import { pokeWorker, type ImportJobParams } from '@/lib/admin/import-jobs';

const CHUNK_BUDGET_MS = 35_000;
const NOMINATIM_DELAY_MS = 1100;       // Nominatim policy: 1 req/s
const CANCEL_CHECK_EVERY_N = 10;       // re-read job.status every N items

type Service = SupabaseClient<Database>;

type Cursor = {
  zoneIndex?: number;
  offset?: number;
  phase?: 'osm' | 'addresses';
};

type ChunkOutcome = { done: true; error?: string } | { done: false };

// ─── Entry point ────────────────────────────────────────────────────────────

export async function processJobChunk(jobId: string): Promise<void> {
  const service = createServiceClient();

  const { data: job } = await service
    .from('import_jobs')
    .select('id, type, status, params, result, total, done, succeeded, failed_count, worker_token, created_by')
    .eq('id', jobId)
    .maybeSingle();

  if (!job) return;
  if (job.status !== 'running' && job.status !== 'pending') return;

  // Move pending → running once.
  if (job.status === 'pending') {
    await service.from('import_jobs').update({
      status: 'running',
      started_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', job.id);
  }

  const params = job.params as unknown as ImportJobParams;
  const result = (job.result ?? {}) as Record<string, unknown> & { cursor?: Cursor };
  const cursor: Cursor = result.cursor ?? {};

  let outcome: ChunkOutcome;
  try {
    switch (params.type) {
      case 'import_zones':
        outcome = await runImportZones(service, jobId, params, cursor, result);
        break;
      case 'import_salons':
        outcome = await runImportSalons(service, jobId, params, cursor, result);
        break;
      case 'enrich_addresses':
        outcome = await runEnrichAddresses(service, jobId, params, cursor, result);
        break;
      case 'enrich_google':
        outcome = await runEnrichGoogle(service, jobId, params, cursor, result);
        break;
      case 'full_import':
        outcome = await runFullImport(service, jobId, params, cursor, result);
        break;
      default:
        outcome = { done: true, error: `Type inconnu: ${(params as { type?: string }).type}` };
    }
  } catch (e) {
    outcome = { done: true, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }

  if (outcome.done) {
    await service.from('import_jobs').update({
      status: outcome.error ? 'failed' : 'completed',
      finished_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
      current_step: null,
      error: outcome.error ?? null,
    }).eq('id', jobId);
  } else {
    // Re-fetch worker_token for the next poke — the row was updated above.
    const { data: row } = await service
      .from('import_jobs')
      .select('worker_token, status')
      .eq('id', jobId)
      .maybeSingle();
    if (row && row.status === 'running') {
      await pokeWorker(jobId, row.worker_token);
    }
  }
}

// ─── import_zones ───────────────────────────────────────────────────────────
// Single-shot: pull all administrative boundaries for the city, upsert them.
// Overpass occasionally rate-limits and the library retries internally; this
// fits in one chunk even for départements with 300+ communes.

async function runImportZones(
  service: Service,
  jobId: string,
  params: Extract<ImportJobParams, { type: 'import_zones' }>,
  _cursor: Cursor,
  _result: Record<string, unknown>
): Promise<ChunkOutcome> {
  const city = params.city.trim();
  if (!city) return { done: true, error: 'Ville requise.' };

  await heartbeat(service, jobId, `Recherche des zones pour "${city}"…`);

  const zones = await fetchZonesForCity(city);
  if (zones.length === 0) {
    return { done: true, error: `Aucune zone trouvée pour "${city}".` };
  }

  await setTotal(service, jobId, zones.length, `0/${zones.length} zones`);

  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < zones.length; i++) {
    if (await isCancelled(service, jobId)) return { done: true, error: 'Annulé.' };

    const z = zones[i];
    const cityForZone = z.city || city;

    const { data: existing } = await service
      .from('salon_zones')
      .select('id')
      .eq('city', cityForZone)
      .eq('name', z.name)
      .maybeSingle();

    if (existing) {
      skipped += 1;
    } else {
      const { error } = await service.from('salon_zones').insert({
        city: cityForZone,
        name: z.name,
        osm_relation_id: z.osm_relation_id,
        bbox_min_lat: z.bbox.minLat,
        bbox_min_lon: z.bbox.minLon,
        bbox_max_lat: z.bbox.maxLat,
        bbox_max_lon: z.bbox.maxLon,
      });
      if (!error) inserted += 1;
    }

    if (i % 5 === 0 || i === zones.length - 1) {
      await service.from('import_jobs').update({
        done: i + 1,
        succeeded: inserted,
        failed_count: 0,
        current_step: `${cityForZone} · ${z.name}`,
        result: { inserted, skipped } as Json,
        last_heartbeat_at: new Date().toISOString(),
      }).eq('id', jobId);
    }
  }

  return { done: true };
}

// ─── import_salons ──────────────────────────────────────────────────────────
// One zone per chunk (Overpass call + bulk upsert). Self-reschedules until
// every zoneId in params is processed.

async function runImportSalons(
  service: Service,
  jobId: string,
  params: Extract<ImportJobParams, { type: 'import_salons' }>,
  cursor: Cursor,
  result: Record<string, unknown>
): Promise<ChunkOutcome> {
  const start = Date.now();
  const zoneIds = params.zoneIds;
  if (zoneIds.length === 0) return { done: true };

  let zoneIndex = cursor.zoneIndex ?? 0;
  let inserted = (result.inserted as number) ?? 0;
  let skipped  = (result.skipped  as number) ?? 0;
  let failed   = (result.failed   as number) ?? 0;

  if (zoneIndex === 0) {
    await setTotal(service, jobId, zoneIds.length, `0/${zoneIds.length} zones`);
  }

  while (zoneIndex < zoneIds.length) {
    if (Date.now() - start > CHUNK_BUDGET_MS) break;
    if (await isCancelled(service, jobId)) return { done: true, error: 'Annulé.' };

    const r = await importOneZone(service, zoneIds[zoneIndex]);
    if (r.ok) {
      inserted += r.inserted;
      skipped += r.skipped;
    } else {
      failed += 1;
    }

    zoneIndex += 1;

    await service.from('import_jobs').update({
      done: zoneIndex,
      succeeded: inserted,
      failed_count: failed,
      current_step: `${zoneIndex}/${zoneIds.length} · ${r.label}`,
      result: { ...result, inserted, skipped, failed, cursor: { zoneIndex } } as Json,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId);
  }

  return zoneIndex >= zoneIds.length ? { done: true } : { done: false };
}

// ─── enrich_addresses ───────────────────────────────────────────────────────
// Nominatim @ 1.1s/req. ~30 addresses per chunk (≈ 33s of wall time).

async function runEnrichAddresses(
  service: Service,
  jobId: string,
  params: Extract<ImportJobParams, { type: 'enrich_addresses' }>,
  cursor: Cursor,
  result: Record<string, unknown>
): Promise<ChunkOutcome> {
  const start = Date.now();
  const { zoneIds, force = false } = params;
  if (zoneIds.length === 0) return { done: true };

  // First chunk: compute the total set of candidates across all zones so the
  // progress bar has a reliable denominator.
  if (cursor.zoneIndex == null) {
    const total = await countAddressCandidates(service, zoneIds, force);
    await setTotal(service, jobId, total, `0/${total} adresses`);
    cursor.zoneIndex = 0;
    cursor.offset = 0;
  }

  let enriched = (result.enriched as number) ?? 0;
  let missing  = (result.missing  as number) ?? 0;
  let done     = ((result.done as number) ?? 0);

  let { zoneIndex = 0, offset = 0 } = cursor;
  let itemsThisChunk = 0;

  while (zoneIndex < zoneIds.length) {
    if (Date.now() - start > CHUNK_BUDGET_MS) break;

    const { data: salons } = await service
      .from('salons')
      .select('id, lat, lon, address')
      .eq('zone_id', zoneIds[zoneIndex])
      .eq('is_active', true)
      .order('id')
      .range(0, 9999);

    const candidates = (salons ?? []).filter(
      (s) => (force || !s.address) && s.lat != null && s.lon != null
    );

    while (offset < candidates.length) {
      if (Date.now() - start > CHUNK_BUDGET_MS) break;
      if (itemsThisChunk > 0 && itemsThisChunk % CANCEL_CHECK_EVERY_N === 0) {
        if (await isCancelled(service, jobId)) return { done: true, error: 'Annulé.' };
      }

      const c = candidates[offset];
      const r = await reverseGeocode(Number(c.lat), Number(c.lon));
      if (r.address || r.postal_code) {
        const update: { address?: string; postal_code?: string } = {};
        if (r.address) update.address = r.address;
        if (r.postal_code) update.postal_code = r.postal_code;
        const { error } = await service.from('salons').update(update).eq('id', c.id);
        if (error) missing += 1;
        else enriched += 1;
      } else {
        missing += 1;
      }
      offset += 1;
      done += 1;
      itemsThisChunk += 1;

      // Bump progress every 5 items to avoid hammering the DB.
      if (offset % 5 === 0 || offset === candidates.length) {
        await service.from('import_jobs').update({
          done,
          succeeded: enriched,
          failed_count: missing,
          current_step: `Zone ${zoneIndex + 1}/${zoneIds.length} · ${offset}/${candidates.length}`,
          result: { ...result, enriched, missing, done, cursor: { zoneIndex, offset } } as Json,
          last_heartbeat_at: new Date().toISOString(),
        }).eq('id', jobId);
      }

      if (offset < candidates.length) await sleep(NOMINATIM_DELAY_MS);
    }

    if (offset >= candidates.length) {
      zoneIndex += 1;
      offset = 0;
    }
  }

  await service.from('import_jobs').update({
    done,
    succeeded: enriched,
    failed_count: missing,
    result: { ...result, enriched, missing, done, cursor: { zoneIndex, offset } } as Json,
    last_heartbeat_at: new Date().toISOString(),
  }).eq('id', jobId);

  return zoneIndex >= zoneIds.length ? { done: true } : { done: false };
}

// ─── enrich_google ──────────────────────────────────────────────────────────
// Google Places allows ~10 QPS but Place Details is expensive — we go sequential
// to stay polite and to keep the heartbeat tight. ~15 lookups per 35s chunk.

async function runEnrichGoogle(
  service: Service,
  jobId: string,
  params: Extract<ImportJobParams, { type: 'enrich_google' }>,
  cursor: Cursor,
  result: Record<string, unknown>
): Promise<ChunkOutcome> {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return { done: true, error: 'GOOGLE_PLACES_API_KEY non configurée.' };
  }
  const start = Date.now();
  const { zoneIds, force = false } = params;
  if (zoneIds.length === 0) return { done: true };

  if (cursor.zoneIndex == null) {
    const total = await countGoogleCandidates(service, zoneIds, force);
    await setTotal(service, jobId, total, `0/${total} établissements`);
    cursor.zoneIndex = 0;
    cursor.offset = 0;
  }

  let matched = (result.matched as number) ?? 0;
  let closed  = (result.closed  as number) ?? 0;
  let missing = (result.missing as number) ?? 0;
  let done    = ((result.done as number) ?? 0);
  let firstError = (result.firstError as string | null) ?? null;

  let { zoneIndex = 0, offset = 0 } = cursor;
  let itemsThisChunk = 0;

  while (zoneIndex < zoneIds.length) {
    if (Date.now() - start > CHUNK_BUDGET_MS) break;

    const candidates = await loadGoogleCandidates(service, zoneIds[zoneIndex], force);

    while (offset < candidates.length) {
      if (Date.now() - start > CHUNK_BUDGET_MS) break;
      if (itemsThisChunk > 0 && itemsThisChunk % CANCEL_CHECK_EVERY_N === 0) {
        if (await isCancelled(service, jobId)) return { done: true, error: 'Annulé.' };
      }

      const c = candidates[offset];
      try {
        const place = await findGooglePlaceForSalon({
          name: c.name,
          lat: Number(c.lat),
          lon: Number(c.lon),
          city: c.city,
        });
        if (!place) {
          await service.from('salons')
            .update({ google_enriched_at: new Date().toISOString() })
            .eq('id', c.id);
          missing += 1;
        } else {
          const isClosed = place.businessStatus === 'CLOSED_PERMANENTLY';
          if (isClosed) closed += 1;
          const update: Database['public']['Tables']['salons']['Update'] = {
            google_place_id: place.placeId,
            business_status: place.businessStatus ?? undefined,
            opening_hours: (place.openingHours as Json | null) ?? null,
            google_rating: place.rating ?? null,
            google_user_ratings_total: place.userRatingCount ?? null,
            google_enriched_at: new Date().toISOString(),
          };
          if (isClosed) update.is_active = false;
          if (place.phoneNumber)      update.phone = place.phoneNumber;
          if (place.websiteUri)       update.website = place.websiteUri;
          if (place.formattedAddress) update.address = place.formattedAddress;
          const { error } = await service.from('salons').update(update).eq('id', c.id);
          if (!error) matched += 1;
        }
      } catch (e) {
        if (!firstError) firstError = e instanceof Error ? e.message : String(e);
        missing += 1;
      }
      offset += 1;
      done += 1;
      itemsThisChunk += 1;

      if (offset % 3 === 0 || offset === candidates.length) {
        await service.from('import_jobs').update({
          done,
          succeeded: matched,
          failed_count: missing,
          current_step: `Zone ${zoneIndex + 1}/${zoneIds.length} · ${offset}/${candidates.length}`,
          result: { ...result, matched, closed, missing, done, firstError, cursor: { zoneIndex, offset } } as Json,
          last_heartbeat_at: new Date().toISOString(),
        }).eq('id', jobId);
      }
    }

    if (offset >= candidates.length) {
      zoneIndex += 1;
      offset = 0;
    }
  }

  await service.from('import_jobs').update({
    done,
    succeeded: matched,
    failed_count: missing,
    result: { ...result, matched, closed, missing, done, firstError, cursor: { zoneIndex, offset } } as Json,
    last_heartbeat_at: new Date().toISOString(),
  }).eq('id', jobId);

  return zoneIndex >= zoneIds.length ? { done: true } : { done: false };
}

// ─── full_import ────────────────────────────────────────────────────────────
// Phase 1 imports salons from OSM for every zone, then phase 2 reverse-geocodes
// every salon left without an address. Each phase reuses the chunkers above by
// dispatching back through processJobChunk with a sub-state.

async function runFullImport(
  service: Service,
  jobId: string,
  params: Extract<ImportJobParams, { type: 'full_import' }>,
  cursor: Cursor,
  result: Record<string, unknown>
): Promise<ChunkOutcome> {
  const start = Date.now();
  const { zoneIds } = params;
  if (zoneIds.length === 0) return { done: true };

  const phase = cursor.phase ?? 'osm';
  let zoneIndex = cursor.zoneIndex ?? 0;

  if (cursor.phase == null) {
    // Phase 1 progress is per-zone; we'll switch the total to per-address
    // when phase 2 begins.
    await setTotal(service, jobId, zoneIds.length, `Étape 1/2 · 0/${zoneIds.length} zones`);
  }

  if (phase === 'osm') {
    let inserted = (result.inserted as number) ?? 0;
    let skipped  = (result.skipped  as number) ?? 0;
    let failed   = (result.failed   as number) ?? 0;

    while (zoneIndex < zoneIds.length) {
      if (Date.now() - start > CHUNK_BUDGET_MS) break;
      if (await isCancelled(service, jobId)) return { done: true, error: 'Annulé.' };

      const r = await importOneZone(service, zoneIds[zoneIndex]);
      if (r.ok) {
        inserted += r.inserted;
        skipped += r.skipped;
      } else {
        failed += 1;
      }
      zoneIndex += 1;

      await service.from('import_jobs').update({
        done: zoneIndex,
        succeeded: inserted,
        failed_count: failed,
        current_step: `Étape 1/2 · ${zoneIndex}/${zoneIds.length} · ${r.label}`,
        result: {
          ...result, inserted, skipped, failed,
          cursor: { phase: 'osm', zoneIndex },
        } as Json,
        last_heartbeat_at: new Date().toISOString(),
      }).eq('id', jobId);
    }

    if (zoneIndex < zoneIds.length) return { done: false };

    // Transition to phase 2 — reverse-geocode missing addresses.
    const totalAddrs = await countAddressCandidates(service, zoneIds, false);
    await service.from('import_jobs').update({
      total: totalAddrs,
      done: 0,
      current_step: `Étape 2/2 · 0/${totalAddrs} adresses`,
      result: {
        ...result, inserted, skipped, failed,
        cursor: { phase: 'addresses', zoneIndex: 0, offset: 0 },
      } as Json,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId);

    return { done: false };
  }

  // Phase 2: addresses (delegate to enrich_addresses logic with the same cursor).
  return runEnrichAddresses(
    service,
    jobId,
    { type: 'enrich_addresses', zoneIds, force: false },
    cursor,
    result
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function importOneZone(
  service: Service,
  zoneId: string
): Promise<{ ok: true; inserted: number; skipped: number; label: string } | { ok: false; label: string }> {
  const { data: zone } = await service
    .from('salon_zones')
    .select('id, city, name, bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon')
    .eq('id', zoneId)
    .maybeSingle();

  if (!zone) return { ok: false, label: '(zone introuvable)' };
  const label = `${zone.city} · ${zone.name}`;
  if (zone.bbox_min_lat == null || zone.bbox_min_lon == null
      || zone.bbox_max_lat == null || zone.bbox_max_lon == null) {
    return { ok: false, label };
  }

  let salons;
  try {
    salons = await fetchSalonsInBbox({
      minLat: Number(zone.bbox_min_lat),
      minLon: Number(zone.bbox_min_lon),
      maxLat: Number(zone.bbox_max_lat),
      maxLon: Number(zone.bbox_max_lon),
    });
  } catch {
    return { ok: false, label };
  }

  let inserted = 0;
  let skipped = 0;
  for (const s of salons) {
    const { data: ins, error } = await service.from('salons').upsert(
      {
        zone_id: zone.id,
        city: zone.city,
        category: s.category,
        name: s.name,
        address: s.address,
        postal_code: s.postal_code,
        phone: s.phone,
        website: s.website,
        lat: s.lat,
        lon: s.lon,
        osm_id: s.osm_id,
        osm_type: s.osm_type,
        is_active: true,
      },
      { onConflict: 'osm_type,osm_id', ignoreDuplicates: true }
    ).select('id');
    if (error) { skipped += 1; continue; }
    if (ins && ins.length > 0) inserted += 1;
    else {
      await service.from('salons')
        .update({ category: s.category })
        .eq('osm_type', s.osm_type)
        .eq('osm_id', s.osm_id);
      skipped += 1;
    }
  }
  return { ok: true, inserted, skipped, label };
}

async function countAddressCandidates(
  service: Service, zoneIds: string[], force: boolean
): Promise<number> {
  let total = 0;
  for (const id of zoneIds) {
    let q = service.from('salons')
      .select('id', { count: 'exact', head: true })
      .eq('zone_id', id)
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lon', 'is', null);
    if (!force) q = q.is('address', null);
    const { count } = await q;
    total += count ?? 0;
  }
  return total;
}

async function countGoogleCandidates(
  service: Service, zoneIds: string[], force: boolean
): Promise<number> {
  let total = 0;
  for (const id of zoneIds) {
    let q = service.from('salons')
      .select('id', { count: 'exact', head: true })
      .eq('zone_id', id)
      .eq('is_active', true)
      .not('lat', 'is', null)
      .not('lon', 'is', null);
    if (!force) {
      // Without `force`, count only salons not yet enriched in the last 30 days.
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      q = q.or(`google_enriched_at.is.null,google_enriched_at.lt.${cutoff}`);
    }
    const { count } = await q;
    total += count ?? 0;
  }
  return total;
}

async function loadGoogleCandidates(
  service: Service, zoneId: string, force: boolean
) {
  const { data } = await service.from('salons')
    .select('id, name, city, lat, lon, google_enriched_at, google_place_id')
    .eq('zone_id', zoneId)
    .eq('is_active', true)
    .not('lat', 'is', null)
    .not('lon', 'is', null)
    .order('id')
    .range(0, 9999);
  const cutoff = Date.now() - 30 * 86400000;
  return (data ?? []).filter((s) => {
    if (force) return true;
    if (s.google_place_id && s.google_enriched_at && new Date(s.google_enriched_at).getTime() > cutoff) {
      return false;
    }
    return true;
  });
}

async function isCancelled(service: Service, jobId: string): Promise<boolean> {
  const { data } = await service.from('import_jobs').select('status').eq('id', jobId).maybeSingle();
  return data?.status === 'cancelled';
}

async function heartbeat(service: Service, jobId: string, step: string): Promise<void> {
  await service.from('import_jobs').update({
    current_step: step,
    last_heartbeat_at: new Date().toISOString(),
  }).eq('id', jobId);
}

async function setTotal(
  service: Service, jobId: string, total: number, step: string
): Promise<void> {
  await service.from('import_jobs').update({
    total,
    current_step: step,
    last_heartbeat_at: new Date().toISOString(),
  }).eq('id', jobId);
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
