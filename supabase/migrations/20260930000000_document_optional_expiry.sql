-- Two document slots (personal photo, vehicle registration form) never
-- expire, so they no longer carry an expiry date at all — the column has to
-- allow null for them. Every other slot still gets a real date, enforced in
-- application code (resolveExpiryDate in documents.functions.ts) rather than
-- a CHECK constraint, since which slots need one isn't fixed at the DB layer
-- (custom admin-added documents always do).
ALTER TABLE public.rider_documents ALTER COLUMN expiry_date DROP NOT NULL;
