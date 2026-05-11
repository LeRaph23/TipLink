-- Add a per-ambassador random salt for PIN hashing.
--
-- Previously the salt was ambassador.id (a fixed UUID), which means the same
-- PIN always produces the same hash for the same ambassador — enabling
-- targeted precomputation attacks if IDs are exposed.
--
-- The new column stores a cryptographically random hex string generated at
-- PIN-creation time. Existing ambassadors get a NULL salt; the application
-- will treat NULL as the legacy (ambassador.id) scheme during verification
-- and re-hash with a new salt on the next successful login.

ALTER TABLE ambassadors ADD COLUMN IF NOT EXISTS pin_salt TEXT;
