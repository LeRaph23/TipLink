-- Per-zone establishment counts for the ambassador zone picker.
--
-- The /zones endpoint must not read salon_zones / salons through PostgREST and
-- count client-side: with ~2000 zones it both blows the row cap and ships
-- thousands of ids through an in(...) filter that silently fails. This
-- function returns, in one SQL pass, exactly the zones that have at least one
-- active salon — with their metadata and counts.
--   salon_count = active salons in the zone
--   todo_count  = active salons in the zone with no visit logged by anyone

DROP FUNCTION IF EXISTS public.ambassador_zone_counts();

CREATE FUNCTION public.ambassador_zone_counts()
RETURNS TABLE (
  zone_id uuid,
  city text,
  name text,
  bbox_min_lat numeric,
  bbox_min_lon numeric,
  bbox_max_lat numeric,
  bbox_max_lon numeric,
  salon_count bigint,
  todo_count bigint
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT z.id, z.city, z.name,
         z.bbox_min_lat, z.bbox_min_lon, z.bbox_max_lat, z.bbox_max_lon,
         count(s.id) AS salon_count,
         count(s.id) FILTER (WHERE vis.salon_id IS NULL) AS todo_count
  FROM public.salon_zones z
  JOIN public.salons s ON s.zone_id = z.id AND s.is_active
  LEFT JOIN (SELECT DISTINCT salon_id FROM public.salon_visits) vis
    ON vis.salon_id = s.id
  WHERE z.is_active
  GROUP BY z.id, z.city, z.name,
           z.bbox_min_lat, z.bbox_min_lon, z.bbox_max_lat, z.bbox_max_lon;
$$;
