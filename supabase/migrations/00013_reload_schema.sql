-- Force PostgREST to refresh its cached schema. Columns added in previous
-- migrations (00006 billing_fields, 00012 smarttag_order_encoding, etc.) were
-- missing from the cache, causing client errors like
-- "Could not find the 'legal_name' column of 'groups' in the schema cache".
NOTIFY pgrst, 'reload schema';
