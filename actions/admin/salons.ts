'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logAdminAction } from '@/lib/admin/audit';
import { fetchZonesForCity, fetchSalonsInBbox } from '@/lib/osm-import';

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
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
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
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
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
