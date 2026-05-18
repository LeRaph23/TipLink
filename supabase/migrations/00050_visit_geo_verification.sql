-- GPS check-in verification for salon visits.
--
-- Zones are no longer exclusively reserved: the app stops creating rows in
-- ambassador_zone_claims (the table is kept for history). Zones become a
-- browsing aid only — every ambassador can see and work any zone of their city.
--
-- To keep a proof that an ambassador physically went to a salon, the device
-- geolocation is captured when a visit is logged and the distance to the salon
-- is computed server-side. Visits logged close to the salon are flagged
-- location_verified; visits logged far away — or with geolocation denied, or
-- where the salon has no coordinates — stay unverified so a super-admin can
-- review them.

ALTER TABLE public.salon_visits
  ADD COLUMN IF NOT EXISTS gps_lat           numeric,
  ADD COLUMN IF NOT EXISTS gps_lon           numeric,
  ADD COLUMN IF NOT EXISTS gps_accuracy_m    numeric,
  ADD COLUMN IF NOT EXISTS distance_m        numeric,
  ADD COLUMN IF NOT EXISTS location_verified boolean NOT NULL DEFAULT false;
