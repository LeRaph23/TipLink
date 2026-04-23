-- ============================================================
-- Public media bucket: avatars, group logos, etc.
-- Public read, authenticated write limited to the first path segment
-- matching one of: avatars/, logos/, public/.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-media',
  'public-media',
  true,
  2 * 1024 * 1024,
  ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read.
DROP POLICY IF EXISTS "public_media_read" ON storage.objects;
CREATE POLICY "public_media_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'public-media');

-- Authenticated users can upload into avatars/ and logos/.
DROP POLICY IF EXISTS "public_media_insert" ON storage.objects;
CREATE POLICY "public_media_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'public-media'
    AND (storage.foldername(name))[1] IN ('avatars', 'logos')
  );

-- Owners can update / delete their own uploads.
DROP POLICY IF EXISTS "public_media_update_own" ON storage.objects;
CREATE POLICY "public_media_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'public-media' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'public-media' AND owner = auth.uid());

DROP POLICY IF EXISTS "public_media_delete_own" ON storage.objects;
CREATE POLICY "public_media_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'public-media' AND owner = auth.uid());
