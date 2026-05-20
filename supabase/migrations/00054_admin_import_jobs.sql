-- Background-job queue for the super-admin "Établissements & zones" page.
--
-- Before this table, the OSM import / address enrichment / Google enrichment
-- ran inside server actions driven by the client: closing the browser tab
-- killed everything. Now any of these actions creates a row here, a worker
-- route processes it in chunks (self-rescheduling via fetch to bypass the
-- Vercel function timeout), and the page polls this table to render live
-- progress bars. Crucially, the job lives on even if the admin leaves.
--
-- Job types:
--   - import_zones      : pull admin boundaries for a city/département from OSM
--   - import_salons     : pull establishments inside one or more zones from OSM
--   - enrich_addresses  : reverse-geocode missing addresses via Nominatim (1 req/s)
--   - enrich_google     : enrich via Google Places (hours, status, rating)
--   - full_import       : import_salons → enrich_addresses, chained
--
-- Status flow: pending → running → completed | failed | cancelled.
-- A worker re-checks `status` at every chunk boundary and stops cleanly when
-- it reads "cancelled".

CREATE TYPE public.import_job_type AS ENUM (
  'import_zones',
  'import_salons',
  'enrich_addresses',
  'enrich_google',
  'full_import'
);

CREATE TYPE public.import_job_status AS ENUM (
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TABLE public.import_jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type                public.import_job_type   NOT NULL,
  status              public.import_job_status NOT NULL DEFAULT 'pending',

  -- What the worker should do. Shape depends on `type`:
  --   import_zones    → { city: text }
  --   import_salons   → { zoneIds: uuid[] }
  --   enrich_addresses→ { zoneIds: uuid[], force?: bool }
  --   enrich_google   → { zoneIds: uuid[], force?: bool }
  --   full_import     → { zoneIds: uuid[] }            -- OSM + addresses
  params              jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Progress tracking. `total` is set when the worker first knows it
  -- (e.g. after counting candidate salons). Until then it stays 0 and the
  -- UI shows an indeterminate spinner.
  total               integer NOT NULL DEFAULT 0,
  done                integer NOT NULL DEFAULT 0,
  succeeded           integer NOT NULL DEFAULT 0,
  failed_count        integer NOT NULL DEFAULT 0,

  -- Free-text label the UI shows under the progress bar — e.g.
  -- "Mulhouse · 12/240 · adresses". Updated at every chunk.
  current_step        text,

  -- Aggregate result counters the worker accumulates (inserted, skipped,
  -- enriched, matched, closed, missing…). Shape mirrors what the legacy
  -- server actions returned, so existing UI labels keep working.
  result              jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Timing & liveness. `last_heartbeat_at` is bumped on every chunk; the UI
  -- can mark a job "stalled" if it hasn't moved in > 2 min (we don't auto-fail
  -- to avoid double-runs).
  created_at          timestamptz NOT NULL DEFAULT now(),
  started_at          timestamptz,
  finished_at         timestamptz,
  last_heartbeat_at   timestamptz,

  -- Optional terminal error message (set on failed; null otherwise).
  error               text,

  -- Owner — the super-admin who started the job. Kept for audit / future
  -- filtering ("show me only my jobs"); the worker doesn't rely on it.
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Per-job random secret the worker route requires in its body. Lets us
  -- expose the worker route without the cron secret (each job authenticates
  -- itself). Generated at insert.
  worker_token        text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex')
);

CREATE INDEX import_jobs_status_idx       ON public.import_jobs (status, created_at DESC);
CREATE INDEX import_jobs_created_by_idx   ON public.import_jobs (created_by, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- Reads + writes are super-admin only. The worker route uses the service
-- role client, which bypasses RLS, so no policy needed for it.
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_jobs_super_admin_all" ON public.import_jobs
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());
