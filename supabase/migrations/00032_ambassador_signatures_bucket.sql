-- Private bucket for ambassador contract signature PNGs.
-- Accessed exclusively via service-role client; no public policies.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ambassador-signatures',
  'ambassador-signatures',
  false,
  524288,
  ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO NOTHING;
