'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { fetchZonesForCity, fetchSalonsInBbox, reverseGeocodeBatch } from '@/lib/osm-import';
import { enrichSalonsViaGoogle } from '@/lib/google-places';
import type { Json } from '@/types/database';

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

type ErrorResult = { ok: false; error: string };
type Result<T = unknown> = ({ ok: true } & T) | ErrorResult;
type VoidResult = { ok: true } | ErrorResult;

// ─── Zones: import from OSM ──────────────────────────────────────────────────
export async function importZonesFromOsm(
  city: string
): Promise<Result<{ inserted: number; skipped: number }>> {
  try {
    await requireSuperAdminUser();
    const trimmed = city.trim();
    if (!trimmed) return { ok: false, error: 'Ville requise.' };

    const zones = await fetchZonesForCity(trimmed);
    if (zones.length === 0) {
      return { ok: false, error: 'Aucune zone trouvée pour cette ville sur OpenStreetMap.' };
    }

    const service = createServiceClient();
    let inserted = 0;
    let skipped = 0;

    for (const z of zones) {
      const { data: existing } = await service
        .from('salon_zones')
        .select('id')
        .eq('city', trimmed)
        .eq('name', z.name)
        .maybeSingle();

      if (existing) {
        skipped += 1;
        continue;
      }

      const { error } = await service.from('salon_zones').insert({
        city: trimmed,
        name: z.name,
        osm_relation_id: z.osm_relation_id,
        bbox_min_lat: z.bbox.minLat,
        bbox_min_lon: z.bbox.minLon,
        bbox_max_lat: z.bbox.maxLat,
        bbox_max_lon: z.bbox.maxLon,
      });
      if (!error) inserted += 1;
    }

    await logAdminAction('salons.import_zones', { city: trimmed, inserted, skipped });
    revalidatePath('/dashboard/admin/salons', 'page');
    return { ok: true, inserted, skipped };
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Erreur inconnue';
    const friendly = raw.includes('429')
      ? 'OpenStreetMap nous rate-limit (trop de requêtes). Réessaie dans 1-2 minutes.'
      : raw;
    return { ok: false, error: friendly };
  }
}

// ─── Salons: import from OSM into a zone ─────────────────────────────────────
export async function importSalonsForZone(
  zoneId: string
): Promise<Result<{ inserted: number; skipped: number }>> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: zone } = await service
      .from('salon_zones')
      .select('id, city, name, bbox_min_lat, bbox_min_lon, bbox_max_lat, bbox_max_lon')
      .eq('id', zoneId)
      .maybeSingle();

    if (!zone) return { ok: false, error: 'Zone introuvable.' };
    if (zone.bbox_min_lat == null || zone.bbox_min_lon == null
        || zone.bbox_max_lat == null || zone.bbox_max_lon == null) {
      return { ok: false, error: 'Cette zone n\'a pas de bbox géographique. Crée-la via l\'import OSM.' };
    }

    const salons = await fetchSalonsInBbox({
      minLat: Number(zone.bbox_min_lat),
      minLon: Number(zone.bbox_min_lon),
      maxLat: Number(zone.bbox_max_lat),
      maxLon: Number(zone.bbox_max_lon),
    });

    let inserted = 0;
    let skipped = 0;

    for (const s of salons) {
      const { error } = await service.from('salons').upsert(
        {
          zone_id: zone.id,
          city: zone.city,
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
      );
      if (error) skipped += 1;
      else inserted += 1;
    }

    await logAdminAction('salons.import_salons', {
      zoneId, city: zone.city, zone: zone.name, inserted, skipped,
    });
    revalidatePath('/dashboard/admin/salons', 'page');
    return { ok: true, inserted, skipped };
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Erreur inconnue';
    const friendly = raw.includes('429')
      ? 'OpenStreetMap nous rate-limit (trop de requêtes). Réessaie dans 1-2 minutes.'
      : raw;
    return { ok: false, error: friendly };
  }
}

// ─── Manual zone CRUD ────────────────────────────────────────────────────────
export async function createZone(
  city: string,
  name: string
): Promise<Result<{ id: string }>> {
  try {
    await requireSuperAdminUser();
    const c = city.trim(); const n = name.trim();
    if (!c || !n) return { ok: false, error: 'Ville et nom requis.' };

    const service = createServiceClient();
    const { data, error } = await service
      .from('salon_zones')
      .insert({ city: c, name: n })
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'Erreur DB' };

    await logAdminAction('salons.zone_create', { city: c, name: n });
    revalidatePath('/dashboard/admin/salons', 'page');
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function toggleZoneActive(
  zoneId: string,
  isActive: boolean
): Promise<VoidResult> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    const { error } = await service
      .from('salon_zones')
      .update({ is_active: isActive })
      .eq('id', zoneId);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(isActive ? 'salons.zone_activate' : 'salons.zone_deactivate', { zoneId });
    revalidatePath('/dashboard/admin/salons', 'page');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function releaseZoneClaim(zoneId: string): Promise<VoidResult> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    const { error } = await service
      .from('ambassador_zone_claims')
      .update({ released_at: new Date().toISOString(), released_by_admin: true })
      .eq('zone_id', zoneId)
      .is('released_at', null);
    if (error) return { ok: false, error: error.message };

    await logAdminAction('salons.zone_release', { zoneId });
    revalidatePath('/dashboard/admin/salons', 'page');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

// ─── Manual salon CRUD ───────────────────────────────────────────────────────
export type CreateSalonInput = {
  zoneId: string | null;
  city: string;
  name: string;
  address?: string | null;
  postalCode?: string | null;
  phone?: string | null;
};

export async function createSalon(input: CreateSalonInput): Promise<Result<{ id: string }>> {
  try {
    await requireSuperAdminUser();
    const name = input.name.trim();
    const city = input.city.trim();
    if (!name || !city) return { ok: false, error: 'Nom et ville requis.' };

    const service = createServiceClient();
    const { data, error } = await service
      .from('salons')
      .insert({
        zone_id: input.zoneId,
        city,
        name,
        address: input.address?.trim() || null,
        postal_code: input.postalCode?.trim() || null,
        phone: input.phone?.trim() || null,
      })
      .select('id')
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'Erreur DB' };

    await logAdminAction('salons.salon_create', { city, name });
    revalidatePath('/dashboard/admin/salons', 'page');
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

export async function toggleSalonActive(
  salonId: string,
  isActive: boolean
): Promise<VoidResult> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();
    const { error } = await service
      .from('salons')
      .update({ is_active: isActive })
      .eq('id', salonId);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(isActive ? 'salons.salon_activate' : 'salons.salon_deactivate', { salonId });
    revalidatePath('/dashboard/admin/salons', 'page');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

// ─── Reverse-geocode missing addresses via Nominatim ─────────────────────────
// Throttled to 1 req/s — Nominatim public-instance policy. Call per zone.
export async function enrichSalonAddressesForZone(
  zoneId: string,
  opts: { force?: boolean } = {}
): Promise<Result<{ enriched: number; total: number; skipped: number }>> {
  try {
    await requireSuperAdminUser();
    const service = createServiceClient();

    const { data: salons } = await service
      .from('salons')
      .select('id, lat, lon, address, postal_code')
      .eq('zone_id', zoneId)
      .eq('is_active', true);

    if (!salons || salons.length === 0) {
      return { ok: true, enriched: 0, total: 0, skipped: 0 };
    }

    // force=true ⇒ reverse-geocode every salon (overwrite stale addresses).
    const needsAddress = salons.filter(
      (s) => (opts.force || !s.address) && s.lat != null && s.lon != null
    );

    if (needsAddress.length === 0) {
      return { ok: true, enriched: 0, total: salons.length, skipped: 0 };
    }

    const results = await reverseGeocodeBatch(
      needsAddress.map((s) => ({
        id: s.id,
        lat: Number(s.lat),
        lon: Number(s.lon),
      }))
    );

    let enriched = 0;
    let skipped = 0;

    for (const [salonId, r] of results) {
      if (!r.address && !r.postal_code) {
        skipped += 1;
        continue;
      }
      const update: { address?: string; postal_code?: string } = {};
      if (r.address) update.address = r.address;
      if (r.postal_code) update.postal_code = r.postal_code;
      const { error } = await service.from('salons').update(update).eq('id', salonId);
      if (error) skipped += 1;
      else enriched += 1;
    }

    await logAdminAction('salons.enrich_addresses', { zoneId, enriched, skipped });
    revalidatePath('/dashboard/admin/salons', 'page');
    return { ok: true, enriched, total: needsAddress.length, skipped };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}


// ─── Google Places enrichment ────────────────────────────────────────────────
// For each salon in the zone, do a text+location search against Google Places.
// Stores opening hours, business status, rating. Salons flagged
// CLOSED_PERMANENTLY are deactivated (is_active = false).
export async function enrichSalonsViaGoogleForZone(
  zoneId: string,
  opts: { force?: boolean } = {}
): Promise<Result<{ enriched: number; matched: number; closed: number; missing: number; total: number; apiError: string | null }>> {
  try {
    await requireSuperAdminUser();
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      return { ok: false, error: 'GOOGLE_PLACES_API_KEY non configurée sur Vercel.' };
    }
    const service = createServiceClient();

    const { data: salons } = await service
      .from('salons')
      .select('id, name, city, lat, lon, is_active, google_enriched_at, google_place_id')
      .eq('zone_id', zoneId)
      .eq('is_active', true);

    if (!salons || salons.length === 0) {
      return { ok: true, enriched: 0, matched: 0, closed: 0, missing: 0, total: 0, apiError: null };
    }

    // When force=true, re-enrich every salon (used by the "Réenrichir" admin
    // button). Otherwise: skip salons that were SUCCESSFULLY enriched (have a
    // google_place_id) in the last 30 days, but always retry salons without
    // a place_id so algorithm improvements take effect on the next click.
    const cutoff = Date.now() - 30 * 86400000;
    const candidates = salons.filter((s) => {
      if (s.lat == null || s.lon == null) return false;
      if (opts.force) return true;
      const matched = !!s.google_place_id;
      if (matched && s.google_enriched_at && new Date(s.google_enriched_at).getTime() > cutoff) {
        return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      return { ok: true, enriched: 0, matched: 0, closed: 0, missing: 0, total: salons.length, apiError: null };
    }

    const { results, firstError } = await enrichSalonsViaGoogle(
      candidates.map((s) => ({
        id: s.id,
        name: s.name,
        city: s.city,
        lat: Number(s.lat),
        lon: Number(s.lon),
      }))
    );

    // If every salon failed and we have an API error, surface it instead
    // of silently writing "0 matched, N missing".
    if (firstError && Array.from(results.values()).every((v) => v === null)) {
      return { ok: false, error: `Google Places: ${firstError}` };
    }

    let matched = 0;
    let closed = 0;
    let missing = 0;

    for (const [salonId, place] of results) {
      if (!place) {
        // No usable Google match — still mark as enriched so we don't keep
        // re-spending API quota on this salon for the next 30 days.
        await service
          .from('salons')
          .update({ google_enriched_at: new Date().toISOString() })
          .eq('id', salonId);
        missing += 1;
        continue;
      }

      matched += 1;
      const isClosed = place.businessStatus === 'CLOSED_PERMANENTLY';
      if (isClosed) closed += 1;

      const update: {
        google_place_id?: string;
        business_status?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
        opening_hours?: Json | null;
        google_rating?: number | null;
        google_user_ratings_total?: number | null;
        google_enriched_at: string;
        is_active?: boolean;
        // Backfill OSM-missing data when Google has it
        phone?: string | null;
        website?: string | null;
        address?: string | null;
      } = {
        google_place_id: place.placeId,
        business_status: place.businessStatus ?? undefined,
        opening_hours: (place.openingHours as unknown as Json) ?? null,
        google_rating: place.rating ?? null,
        google_user_ratings_total: place.userRatingCount ?? null,
        google_enriched_at: new Date().toISOString(),
      };
      if (isClosed) update.is_active = false;
      if (place.phoneNumber) update.phone = place.phoneNumber;
      if (place.websiteUri) update.website = place.websiteUri;
      if (place.formattedAddress) update.address = place.formattedAddress;

      const { error } = await service.from('salons').update(update).eq('id', salonId);
      if (error) matched -= 1; // count only successful writes
    }

    await logAdminAction('salons.enrich_google', {
      zoneId, candidates: candidates.length, matched, closed, missing,
      firstError: firstError ?? null,
    });
    revalidatePath('/dashboard/admin/salons', 'page');
    return {
      ok: true,
      enriched: matched,
      matched,
      closed,
      missing,
      total: candidates.length,
      apiError: firstError,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
