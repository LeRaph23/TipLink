-- Salon tracking: ambassadors claim a geographic zone, then track which salons
-- they have visited (flyer dropped, likelihood of conversion 1-3). Prevents
-- multiple ambassadors from harassing the same salon.

-- ─── salon_zones ─────────────────────────────────────────────────────────────
-- Geographic zones (typically arrondissements / communes, imported from OSM).
CREATE TABLE IF NOT EXISTS public.salon_zones (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  city            text        NOT NULL,
  name            text        NOT NULL,
  osm_relation_id bigint,
  bbox_min_lat    numeric,
  bbox_min_lon    numeric,
  bbox_max_lat    numeric,
  bbox_max_lon    numeric,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salon_zones_city_name_unique UNIQUE (city, name)
);

CREATE INDEX IF NOT EXISTS idx_salon_zones_city ON public.salon_zones(city);

-- ─── salons ──────────────────────────────────────────────────────────────────
-- Master directory of hair / beauty salons. Imported from OSM Overpass.
CREATE TABLE IF NOT EXISTS public.salons (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id     uuid        REFERENCES public.salon_zones(id) ON DELETE SET NULL,
  city        text        NOT NULL,
  name        text        NOT NULL,
  address     text,
  postal_code text,
  phone       text,
  website     text,
  lat         numeric,
  lon         numeric,
  osm_id      bigint,
  osm_type    text        CHECK (osm_type IN ('node', 'way', 'relation')),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salons_osm_unique UNIQUE (osm_type, osm_id)
);

CREATE INDEX IF NOT EXISTS idx_salons_zone ON public.salons(zone_id);
CREATE INDEX IF NOT EXISTS idx_salons_city ON public.salons(city);
CREATE INDEX IF NOT EXISTS idx_salons_active ON public.salons(is_active) WHERE is_active = true;

-- ─── ambassador_zone_claims ──────────────────────────────────────────────────
-- An ambassador claims one zone at a time. While released_at IS NULL the zone
-- is invisible to other ambassadors.
CREATE TABLE IF NOT EXISTS public.ambassador_zone_claims (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id uuid        NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
  zone_id       uuid        NOT NULL REFERENCES public.salon_zones(id) ON DELETE CASCADE,
  claimed_at    timestamptz NOT NULL DEFAULT now(),
  released_at   timestamptz,
  released_by_admin boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_zone_claims_ambassador
  ON public.ambassador_zone_claims(ambassador_id, claimed_at DESC);

-- One active claim per zone (zone occupied)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_claim_per_zone
  ON public.ambassador_zone_claims(zone_id)
  WHERE released_at IS NULL;

-- One active claim per ambassador (one zone at a time)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_claim_per_ambassador
  ON public.ambassador_zone_claims(ambassador_id)
  WHERE released_at IS NULL;

-- ─── salon_visits ────────────────────────────────────────────────────────────
-- Each ambassador visit to a salon. Multiple visits possible for follow-ups.
CREATE TABLE IF NOT EXISTS public.salon_visits (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id     uuid        NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
  salon_id          uuid        NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
  visited_at        timestamptz NOT NULL DEFAULT now(),
  flyer_left        boolean     NOT NULL DEFAULT false,
  convinced         text        NOT NULL DEFAULT 'no'
    CHECK (convinced IN ('yes', 'maybe', 'no')),
  likelihood_rating smallint    NOT NULL
    CHECK (likelihood_rating BETWEEN 1 AND 3),
  notes             text,
  follow_up_at      date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salon_visits_salon
  ON public.salon_visits(salon_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_salon_visits_ambassador
  ON public.salon_visits(ambassador_id, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_salon_visits_follow_up
  ON public.salon_visits(follow_up_at)
  WHERE follow_up_at IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_salon_visits_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_salon_visits_updated_at ON public.salon_visits;
CREATE TRIGGER trg_salon_visits_updated_at
  BEFORE UPDATE ON public.salon_visits
  FOR EACH ROW EXECUTE FUNCTION public.touch_salon_visits_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Ambassador access is via service-role API routes (matching ambassador_sales
-- pattern). Authenticated users see this data only as super_admin.
ALTER TABLE public.salons                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_zones             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_zone_claims  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_visits            ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salons_super_admin_all" ON public.salons
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "salon_zones_super_admin_all" ON public.salon_zones
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "ambassador_zone_claims_super_admin_all" ON public.ambassador_zone_claims
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "salon_visits_super_admin_all" ON public.salon_visits
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
