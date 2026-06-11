-- Speed up the super-admin global search (lib/admin/search.ts).
--
-- That search runs `ILIKE '%term%'` (substring, not prefix) against several
-- tables. A plain btree — even text_pattern_ops — cannot serve a leading-%
-- pattern, so every keystroke triggers a sequential scan of groups,
-- establishments, staff_profiles, nfc_stickers and transactions. On the larger
-- tables (staff_profiles, nfc_stickers, transactions) that is increasingly slow
-- as the France import grows the dataset.
--
-- pg_trgm GIN indexes are the right tool for arbitrary substring ILIKE: they
-- index 3-grams so `%term%` becomes an index scan. gin_trgm_ops also supports
-- case-insensitive matching, so ILIKE is covered directly.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_groups_name_trgm
  ON public.groups USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_establishments_name_trgm
  ON public.establishments USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_staff_profiles_full_name_trgm
  ON public.staff_profiles USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_nfc_stickers_short_id_trgm
  ON public.nfc_stickers USING gin (short_id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_transactions_pi_trgm
  ON public.transactions USING gin (stripe_payment_intent_id gin_trgm_ops);

NOTIFY pgrst, 'reload schema';
