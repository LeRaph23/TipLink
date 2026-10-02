-- SVG is a document, not an image: it can carry <script>, and the bucket is
-- public, so an uploaded logo opened at its raw URL ran that script (seventh
-- QA run). Uploads are rasterised client-side; the bucket now refuses SVG.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp']
WHERE id = 'public-media';
