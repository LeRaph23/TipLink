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
  reverseGeocodeBatchBan,
  type OsmSalon,
  type OsmZone,
} from '@/lib/osm-import';
import { findGooglePlaceForSalon } from '@/lib/google-places';
import { pokeWorker, type ImportJobParams } from '@/lib/admin/import-jobs';
import { departmentsForRegions } from '@/lib/admin/french-regions';

const CHUNK_BUDGET_MS = 35_000;
const NOMINATIM_DELAY_MS = 1100;       // Nominatim policy: 1 req/s (fallback only)
const CANCEL_CHECK_EVERY_N = 10;       // re-read job.status every N items
const SALON_UPSERT_BATCH = 500;        // batch size for the bulk salon upsert
const OVERPASS_CONCURRENCY = 3;        // parallel Overpass calls inside a chunk
const BAN_BATCH_SIZE = 500;            // reverse-geocode batch per BAN call

type Service = SupabaseClient<Database>;

// Cursor — the shape of persisted progress between chunks. All fields are
// optional because each job type uses a subset.
type Cursor = {
  // import_salons / enrich_addresses / enrich_google: index into zoneIds[]
  zoneIndex?: number;
  // enrich_addresses / enrich_google: index into the current zone's candidates
  offset?: number;
  // full_import phase ('osm' then 'addresses')
  phase?: 'osm' | 'addresses';
  // import_france: which department we're on + which phase (zones→salons→addrs)
  deptIndex?: number;
  francePhase?: 'zones' | 'salons' | 'addresses';
  // import_france: zone IDs accumulated during the 'zones' phase, consumed by
  // 'salons' + 'addresses'. Persisted so a crashed chunk can resume cleanly.
  zoneIds?: string[];
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
        outcome = await runImportZones(service, jobId, params);
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
      case 'import_france':
        outcome = await runImportFrance(service, jobId, params, cursor, result);
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
): Promise<ChunkOutcome> {
  const city = params.city.trim();
  if (!city) return { done: true, error: 'Ville requise.' };

  await heartbeat(service, jobId, `Recherche des zones pour "${city}"…`);

  const zones = await fetchZonesForCity(city);
  if (zones.length === 0) {
    return { done: true, error: `Aucune zone trouvée pour "${city}".` };
  }

  const { inserted, skipped } = await upsertZonesBulk(service, city, zones);

  await service.from('import_jobs').update({
    total: zones.length,
    done: zones.length,
    succeeded: inserted,
    failed_count: 0,
    current_step: `${zones.length} zones traitées`,
    result: { inserted, skipped } as Json,
    last_heartbeat_at: new Date().toISOString(),
  }).eq('id', jobId);

  return { done: true };
}

// Bulk-insert zones into salon_zones. Per-row INSERT was 100+ round-trips for a
// département; this collapses them into 1-2. ON CONFLICT relies on the existing
// UNIQUE (city, name) constraint to make this idempotent.
async function upsertZonesBulk(
  service: Service,
  fallbackCity: string,
  zones: OsmZone[]
): Promise<{ inserted: number; skipped: number; insertedIds: string[] }> {
  if (zones.length === 0) return { inserted: 0, skipped: 0, insertedIds: [] };

  const rows = zones.map((z) => ({
    city: z.city || fallbackCity,
    name: z.name,
    osm_relation_id: z.osm_relation_id,
    bbox_min_lat: z.bbox.minLat,
    bbox_min_lon: z.bbox.minLon,
    bbox_max_lat: z.bbox.maxLat,
    bbox_max_lon: z.bbox.maxLon,
  }));

  let inserted = 0;
  const insertedIds: string[] = [];
  for (const page of chunkArray(rows, SALON_UPSERT_BATCH)) {
    const { data, error } = await service
      .from('salon_zones')
      .upsert(page, { onConflict: 'city,name', ignoreDuplicates: true })
      .select('id');
    if (error) continue;
    inserted += data?.length ?? 0;
    for (const r of data ?? []) insertedIds.push(r.id);
  }
  const skipped = zones.length - inserted;
  return { inserted, skipped, insertedIds };
}

// ─── import_salons ──────────────────────────────────────────────────────────
// Multi-zone per chunk with parallel Overpass fetches. Batches salon upserts
// so a 500-salon zone takes ~2s of DB instead of ~25s.

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

    const batchSize = Math.min(OVERPASS_CONCURRENCY, zoneIds.length - zoneIndex);
    const batch = zoneIds.slice(zoneIndex, zoneIndex + batchSize);
    const results = await Promise.all(batch.map((id) => importOneZone(service, id)));

    for (const r of results) {
      if (r.ok) { inserted += r.inserted; skipped += r.skipped; }
      else      { failed += 1; }
    }
    zoneIndex += batchSize;

    const lastLabel = results[results.length - 1].label;
    await service.from('import_jobs').update({
      done: zoneIndex,
      succeeded: inserted,
      failed_count: failed,
      current_step: `${zoneIndex}/${zoneIds.length} · ${lastLabel}`,
      result: { ...result, inserted, skipped, failed, cursor: { zoneIndex } } as Json,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId);
  }

  return zoneIndex >= zoneIds.length ? { done: true } : { done: false };
}

// ─── enrich_addresses ───────────────────────────────────────────────────────
// BAN batch CSV @ ~500 addresses per call (~3-10s wall time). Fallback to
// per-row Nominatim (1.1 s each) for the few coords BAN cannot resolve.
// Result: ~500-3000 addresses per chunk instead of ~30.

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

  // First chunk: count candidates across all zones for an honest denominator.
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

  while (zoneIndex < zoneIds.length) {
    if (Date.now() - start > CHUNK_BUDGET_MS) break;
    if (await isCancelled(service, jobId)) return { done: true, error: 'Annulé.' };

    // Load candidates for the current zone. Defer the full payload to a single
    // query per zone (vs once per address).
    const { data: salons } = await service
      .from('salons')
      .select('id, lat, lon, address')
      .eq('zone_id', zoneIds[zoneIndex])
      .eq('is_active', true)
      .order('id')
      .range(0, 49999);

    const candidates = (salons ?? []).filter(
      (s) => (force || !s.address) && s.lat != null && s.lon != null
    );

    while (offset < candidates.length) {
      if (Date.now() - start > CHUNK_BUDGET_MS) break;

      const slice = candidates.slice(offset, offset + BAN_BATCH_SIZE);

      // 1) Bulk via BAN.
      const coords = slice.map((c) => ({
        id: String(c.id),
        lat: Number(c.lat),
        lon: Number(c.lon),
      }));
      let banResults: Map<string, { address: string | null; postal_code: string | null }>;
      try {
        banResults = await reverseGeocodeBatchBan(coords);
      } catch (e) {
        // Network/BAN failure → empty map, fall through to Nominatim per row.
        banResults = new Map();
        await heartbeat(service, jobId, `BAN indisponible (${e instanceof Error ? e.message : 'erreur'}), fallback Nominatim…`);
      }

      // 2) Apply BAN hits in one batched UPDATE per zone.
      const banUpdates: Array<{ id: string; address: string | null; postal_code: string | null }> = [];
      for (const c of slice) {
        const r = banResults.get(String(c.id));
        if (r && (r.address || r.postal_code)) {
          banUpdates.push({ id: String(c.id), address: r.address, postal_code: r.postal_code });
        }
      }
      if (banUpdates.length > 0) {
        const applied = await applyAddressUpdates(service, banUpdates);
        enriched += applied;
      }

      // 3) Fallback: Nominatim for each coord BAN didn't resolve. Bounded by
      // remaining chunk budget at 1.1 s/req — we may not finish all of them
      // in this chunk; the cursor stays at the current offset and the next
      // chunk picks up from the same zone with whatever's still pending.
      let nominatimDone = 0;
      // Collect resolved rows and flush them in one batched UPDATE per chunk
      // (via applyAddressUpdates) instead of one round-trip per row interleaved
      // with the rate-limit sleep. The geocoding stays serial (Nominatim QPS).
      const nominatimUpdates: Array<{ id: string; address: string | null; postal_code: string | null }> = [];
      for (const c of slice) {
        if (Date.now() - start > CHUNK_BUDGET_MS) break;
        if (banResults.has(String(c.id))) continue;

        if (nominatimDone > 0 && nominatimDone % CANCEL_CHECK_EVERY_N === 0) {
          if (await isCancelled(service, jobId)) return { done: true, error: 'Annulé.' };
        }

        const r = await reverseGeocode(Number(c.lat), Number(c.lon));
        if (r.address || r.postal_code) {
          nominatimUpdates.push({ id: String(c.id), address: r.address, postal_code: r.postal_code });
        } else {
          missing += 1;
        }
        nominatimDone += 1;
        await sleep(NOMINATIM_DELAY_MS);
      }
      if (nominatimUpdates.length > 0) {
        const applied = await applyAddressUpdates(service, nominatimUpdates);
        enriched += applied;
        missing += nominatimUpdates.length - applied; // rows whose UPDATE errored
      }

      // 4) Anything BAN didn't return *and* we didn't get to with Nominatim
      // remains in `candidates` for the next chunk — but we've already updated
      // the rows BAN matched. Advance offset past the rows we've fully handled
      // (= BAN hits + Nominatim attempts in this slice).
      const handledThisIter = banUpdates.length + nominatimDone;
      offset += handledThisIter;
      done += handledThisIter;

      await service.from('import_jobs').update({
        done,
        succeeded: enriched,
        failed_count: missing,
        current_step: `Zone ${zoneIndex + 1}/${zoneIds.length} · ${offset}/${candidates.length}`,
        result: { ...result, enriched, missing, done, cursor: { ...cursor, zoneIndex, offset } } as Json,
        last_heartbeat_at: new Date().toISOString(),
      }).eq('id', jobId);

      // If nothing got handled this iteration (BAN failed AND no chunk budget
      // left for Nominatim), break so we don't spin forever on the same slice.
      if (handledThisIter === 0) break;
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
    result: { ...result, enriched, missing, done, cursor: { ...cursor, zoneIndex, offset } } as Json,
    last_heartbeat_at: new Date().toISOString(),
  }).eq('id', jobId);

  return zoneIndex >= zoneIds.length ? { done: true } : { done: false };
}

// One PostgREST round-trip per (address, postal_code) pair. We group rows by
// the same (address|postal_code) values to batch them with `.in('id', ids)`.
// In practice BAN returns near-unique values per row, so each group is small,
// but updating one-by-one still beats the per-row Nominatim path we replaced.
async function applyAddressUpdates(
  service: Service,
  rows: Array<{ id: string; address: string | null; postal_code: string | null }>
): Promise<number> {
  if (rows.length === 0) return 0;

  type Key = string;
  const groups = new Map<Key, { address: string | null; postal_code: string | null; ids: string[] }>();
  for (const r of rows) {
    const k: Key = `${r.address ?? ''}${r.postal_code ?? ''}`;
    const g = groups.get(k);
    if (g) g.ids.push(r.id);
    else groups.set(k, { address: r.address, postal_code: r.postal_code, ids: [r.id] });
  }

  let applied = 0;
  for (const g of groups.values()) {
    const update: { address?: string; postal_code?: string } = {};
    if (g.address)     update.address     = g.address;
    if (g.postal_code) update.postal_code = g.postal_code;
    if (Object.keys(update).length === 0) continue;

    for (const idChunk of chunkArray(g.ids, 200)) {
      const { error } = await service.from('salons').update(update).in('id', idChunk);
      if (!error) applied += idChunk.length;
    }
  }
  return applied;
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
    await setTotal(service, jobId, zoneIds.length, `Étape 1/2 · 0/${zoneIds.length} zones`);
  }

  if (phase === 'osm') {
    let inserted = (result.inserted as number) ?? 0;
    let skipped  = (result.skipped  as number) ?? 0;
    let failed   = (result.failed   as number) ?? 0;

    while (zoneIndex < zoneIds.length) {
      if (Date.now() - start > CHUNK_BUDGET_MS) break;
      if (await isCancelled(service, jobId)) return { done: true, error: 'Annulé.' };

      const batchSize = Math.min(OVERPASS_CONCURRENCY, zoneIds.length - zoneIndex);
      const batch = zoneIds.slice(zoneIndex, zoneIndex + batchSize);
      const results = await Promise.all(batch.map((id) => importOneZone(service, id)));

      for (const r of results) {
        if (r.ok) { inserted += r.inserted; skipped += r.skipped; }
        else      { failed += 1; }
      }
      zoneIndex += batchSize;

      const lastLabel = results[results.length - 1].label;
      await service.from('import_jobs').update({
        done: zoneIndex,
        succeeded: inserted,
        failed_count: failed,
        current_step: `Étape 1/2 · ${zoneIndex}/${zoneIds.length} · ${lastLabel}`,
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

// ─── import_france ──────────────────────────────────────────────────────────
// Fan-out job: resolve zones for every département of the picked regions,
// import their salons, then optionally enrich addresses. 3 phases driven by
// `cursor.francePhase`.

async function runImportFrance(
  service: Service,
  jobId: string,
  params: Extract<ImportJobParams, { type: 'import_france' }>,
  cursor: Cursor,
  result: Record<string, unknown>
): Promise<ChunkOutcome> {
  const start = Date.now();
  const depts = departmentsForRegions(params.regions);
  if (depts.length === 0) return { done: true, error: 'Aucun département sélectionné.' };

  const enrich = params.enrich;
  const phaseLabel = enrich ? '3' : '2';
  const francePhase = cursor.francePhase ?? 'zones';

  // ── Phase 1: resolve zones for each département ──────────────────────────
  if (francePhase === 'zones') {
    let deptIndex = cursor.deptIndex ?? 0;
    let inserted = (result.inserted as number) ?? 0;
    let skipped  = (result.skipped  as number) ?? 0;
    let deptFailures = (result.deptFailures as number) ?? 0;
    const zoneIds: string[] = (cursor.zoneIds as string[]) ?? [];

    if (deptIndex === 0) {
      await setTotal(service, jobId, depts.length, `Étape 1/${phaseLabel} · 0/${depts.length} départements`);
    }

    while (deptIndex < depts.length) {
      if (Date.now() - start > CHUNK_BUDGET_MS) break;
      if (await isCancelled(service, jobId)) return { done: true, error: 'Annulé.' };

      const dept = depts[deptIndex];
      try {
        const zones = await fetchZonesForCity(dept);
        const upserted = await upsertZonesBulk(service, dept, zones);
        inserted += upserted.inserted;
        skipped  += upserted.skipped;

        // We need the IDs of *all* matching zones (existing or freshly inserted)
        // for the next phase, not just the inserted ones. Re-select by (city, name).
        if (zones.length > 0) {
          const ids = await loadZoneIdsForCity(service, dept, zones);
          for (const id of ids) zoneIds.push(id);
        }
      } catch (err) {
        // Continue with the next département — a flaky Overpass call shouldn't
        // sink the whole France import — but count and log it so a systematic
        // failure (Overpass down/rate-limited) doesn't pass unnoticed.
        deptFailures += 1;
        console.error('[import] département zone fetch failed', {
          jobId, dept, err: err instanceof Error ? err.message : 'unknown',
        });
      }
      deptIndex += 1;

      await service.from('import_jobs').update({
        done: deptIndex,
        succeeded: inserted,
        failed_count: deptFailures,
        current_step: `Étape 1/${phaseLabel} · ${deptIndex}/${depts.length} · ${dept}`,
        result: {
          ...result, inserted, skipped, deptFailures,
          cursor: { francePhase: 'zones', deptIndex, zoneIds },
        } as Json,
        last_heartbeat_at: new Date().toISOString(),
      }).eq('id', jobId);
    }

    if (deptIndex < depts.length) return { done: false };

    // Transition to phase 2.
    await service.from('import_jobs').update({
      total: zoneIds.length,
      done: 0,
      current_step: `Étape 2/${phaseLabel} · 0/${zoneIds.length} zones`,
      result: {
        ...result, inserted, skipped,
        cursor: { francePhase: 'salons', zoneIndex: 0, zoneIds },
      } as Json,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId);

    return { done: false };
  }

  // ── Phase 2: import salons for every accumulated zone ────────────────────
  const zoneIds = (cursor.zoneIds as string[]) ?? [];
  if (zoneIds.length === 0) return { done: true, error: 'Aucune zone à traiter (phase 1 vide).' };

  if (francePhase === 'salons') {
    // Delegate to the salons chunker, but preserve our cursor so the next chunk
    // sees francePhase='salons' and resumes here.
    const sub = await runImportSalons(
      service,
      jobId,
      { type: 'import_salons', zoneIds },
      { zoneIndex: cursor.zoneIndex ?? 0 },
      result
    );

    // Re-stamp the cursor with our francePhase prefix so the next chunk routes
    // back into runImportFrance (not directly into runImportSalons).
    const fresh = await service
      .from('import_jobs')
      .select('result, done, succeeded, failed_count, total')
      .eq('id', jobId)
      .maybeSingle();
    const subResult = (fresh.data?.result ?? {}) as Record<string, unknown> & { cursor?: Cursor };
    const subCursor = subResult.cursor ?? {};
    await service.from('import_jobs').update({
      current_step: `Étape 2/${phaseLabel} · ${subCursor.zoneIndex ?? 0}/${zoneIds.length} zones`,
      result: {
        ...subResult,
        cursor: { francePhase: 'salons', zoneIndex: subCursor.zoneIndex ?? 0, zoneIds },
      } as Json,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId);

    if (!sub.done) return { done: false };
    if (sub.done && sub.error) return sub;

    // Salons done. Move on to enrichment if requested, else complete.
    if (!enrich) return { done: true };

    const totalAddrs = await countAddressCandidates(service, zoneIds, false);
    await service.from('import_jobs').update({
      total: totalAddrs,
      done: 0,
      current_step: `Étape 3/${phaseLabel} · 0/${totalAddrs} adresses`,
      result: {
        ...subResult,
        cursor: { francePhase: 'addresses', zoneIndex: 0, offset: 0, zoneIds },
      } as Json,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId);
    return { done: false };
  }

  // ── Phase 3: enrich addresses via BAN ────────────────────────────────────
  if (francePhase === 'addresses') {
    const sub = await runEnrichAddresses(
      service,
      jobId,
      { type: 'enrich_addresses', zoneIds, force: false },
      { zoneIndex: cursor.zoneIndex ?? 0, offset: cursor.offset ?? 0 },
      result
    );

    const fresh = await service
      .from('import_jobs')
      .select('result')
      .eq('id', jobId)
      .maybeSingle();
    const subResult = (fresh.data?.result ?? {}) as Record<string, unknown> & { cursor?: Cursor };
    const subCursor = subResult.cursor ?? {};
    await service.from('import_jobs').update({
      current_step: `Étape 3/${phaseLabel} · zone ${(subCursor.zoneIndex ?? 0) + 1}/${zoneIds.length}`,
      result: {
        ...subResult,
        cursor: {
          francePhase: 'addresses',
          zoneIndex: subCursor.zoneIndex ?? 0,
          offset: subCursor.offset ?? 0,
          zoneIds,
        },
      } as Json,
      last_heartbeat_at: new Date().toISOString(),
    }).eq('id', jobId);

    return sub;
  }

  return { done: true, error: `Phase France inconnue: ${francePhase}` };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Look up zone IDs for a département from the zones we just (idempotently)
// upserted. Returns the union of pre-existing + freshly inserted zone IDs.
async function loadZoneIdsForCity(
  service: Service,
  fallbackCity: string,
  zones: OsmZone[]
): Promise<string[]> {
  const names = zones.map((z) => z.name);
  const cities = Array.from(new Set(zones.map((z) => z.city || fallbackCity)));
  if (names.length === 0) return [];
  // Two scopes: zones imported under their own commune name (département flow)
  // and zones imported under a parent city (commune flow). Match on either.
  const { data } = await service
    .from('salon_zones')
    .select('id, city, name')
    .in('name', names)
    .in('city', cities);
  return (data ?? []).map((r) => r.id);
}

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

  let salons: OsmSalon[];
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

  if (salons.length === 0) {
    return { ok: true, inserted: 0, skipped: 0, label };
  }

  // Batch upsert — collapses 500 round-trips into 1-2 (~30-50× speedup).
  const rows = salons.map((s) => ({
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
  }));

  let inserted = 0;
  let skipped = 0;
  for (const page of chunkArray(rows, SALON_UPSERT_BATCH)) {
    // ignoreDuplicates:true keeps the existing row untouched on conflict (we
    // don't want to overwrite a manual edit). We then run a targeted update
    // to fix categories on rows that already existed (legacy ones lacked it).
    const { data, error } = await service
      .from('salons')
      .upsert(page, { onConflict: 'osm_type,osm_id', ignoreDuplicates: true })
      .select('id');
    if (error) { skipped += page.length; continue; }
    const insertedIds = new Set((data ?? []).map((r) => r.id));
    inserted += insertedIds.size;
    skipped  += page.length - insertedIds.size;
  }
  return { ok: true, inserted, skipped, label };
}

async function countAddressCandidates(
  service: Service, zoneIds: string[], force: boolean
): Promise<number> {
  let total = 0;
  // Count in pages of 200 zones — Postgres tolerates a long IN list, but we
  // keep individual queries short to stay under PostgREST limits.
  for (const page of chunkArray(zoneIds, 200)) {
    for (const id of page) {
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

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
