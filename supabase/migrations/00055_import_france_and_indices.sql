-- Performance + capability upgrade for the OSM import pipeline.
--
-- 1) Extends import_job_type with `import_france` — a new job that fans out
--    over a selection of metropolitan regions, runs zones → salons → addresses
--    in chained phases, and survives the chunk-by-chunk worker loop via a
--    richer cursor (deptIndex, phase, accumulated zoneIds).
--
-- 2) Adds two indices that drive hot paths the new code introduces:
--    - the cron `/api/cron/import-jobs-resume` polls every minute for jobs
--      with stale heartbeats; a partial index on (last_heartbeat_at) WHERE
--      status IN ('pending','running') keeps that scan cheap as the table
--      grows (jobs are kept forever for audit).
--    - the address-enrichment phase repeatedly counts/loads salons with
--      missing addresses per zone; a partial index on zone_id covering the
--      common "active + missing address" predicate avoids a full table scan
--      for every chunk.
--
-- ALTER TYPE … ADD VALUE cannot run inside a transaction with other DDL on
-- the same type. Supabase migrations execute each file in its own tx, so
-- this enum addition gets its own file is unnecessary: the only object we
-- touch in this file that depends on the new value is the index — none does.

-- ─── Extend job type enum ────────────────────────────────────────────────────
ALTER TYPE public.import_job_type ADD VALUE IF NOT EXISTS 'import_france';

-- ─── Cron-friendly partial index for stalled job recovery ───────────────────
-- The cron route `/api/cron/import-jobs-resume` runs every minute and reads:
--   SELECT id, worker_token FROM import_jobs
--   WHERE status IN ('pending','running')
--     AND (last_heartbeat_at IS NULL OR last_heartbeat_at < now() - interval '90s')
-- A partial index keeps this O(stalled-jobs) rather than O(all-jobs-ever).
CREATE INDEX IF NOT EXISTS import_jobs_active_heartbeat_idx
  ON public.import_jobs (last_heartbeat_at)
  WHERE status IN ('pending', 'running');

-- ─── Address-enrichment hot path ─────────────────────────────────────────────
-- runEnrichAddresses() loads candidates per zone with:
--   WHERE zone_id = $1 AND is_active = true AND address IS NULL
--     AND lat IS NOT NULL AND lon IS NOT NULL
-- Partial index on zone_id matching that predicate makes per-zone load O(matches).
CREATE INDEX IF NOT EXISTS idx_salons_zone_missing_address
  ON public.salons (zone_id)
  WHERE is_active = true AND address IS NULL AND lat IS NOT NULL AND lon IS NOT NULL;
