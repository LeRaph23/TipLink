-- Support the new global per-code brute-force backstop (PIN auth routes).
--
-- The auth routes now also count PIN attempts for a code across ALL IPs (not
-- just per IP+code) to defeat IP rotation against the 4-digit PIN. The existing
-- indexes lead with ip_hash, so a code-only window count can't use them and
-- would seq-scan — exactly under an attack, when the table is largest. Add a
-- (code, attempted_at) index so the backstop count stays an index scan.

CREATE INDEX IF NOT EXISTS idx_ambassador_pin_attempts_code
  ON public.ambassador_pin_attempts (code, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_commercial_pin_attempts_code
  ON public.commercial_pin_attempts (code, attempted_at DESC);
