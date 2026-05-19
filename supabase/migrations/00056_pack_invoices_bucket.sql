-- ============================================================
-- 00056 — pack-invoices storage bucket
--
-- Private bucket holding the in-app generated SmartTag pack invoice PDFs
-- (lib/mangopay/invoice-pdf.ts) — the Stripe-hosted invoice has no Mangopay
-- equivalent. Access is service-role only: invoices are written by the
-- webhook and served through long-lived signed URLs, so no public or
-- authenticated storage.objects policy is needed.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pack-invoices',
  'pack-invoices',
  false,
  5 * 1024 * 1024,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
