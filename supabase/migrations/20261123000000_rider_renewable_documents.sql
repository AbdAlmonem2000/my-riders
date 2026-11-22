-- Lets a rider renew their own "الإقامة" (iqama_photo) and "رخصة القيادة"
-- (driving_license) documents from their own lookup page — upload a new
-- photo/scan and set its expiry date themselves, the same signed-upload-URL
-- + password-verification pattern as the existing self-service photo
-- upload (see rider-photo.functions.ts). Writes land in the exact same
-- rider_documents row the admin's own Documents page reads/writes, so
-- whichever side updates it next shows up on the other immediately.
--
-- last_updated_by records which side wrote the row last, so the admin's
-- Documents page can flag "a rider renewed this themselves" instead of it
-- silently looking like the admin's own work. Every existing row defaults
-- to 'admin' (true for every row that exists before this migration runs).
ALTER TABLE public.rider_documents
  ADD COLUMN last_updated_by text NOT NULL DEFAULT 'admin'
    CHECK (last_updated_by IN ('admin', 'rider'));
