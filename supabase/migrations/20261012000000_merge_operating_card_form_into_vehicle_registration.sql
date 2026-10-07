-- The operating card's "استمارة" and the rider's own "استمارة السيارة"
-- (vehicle_registration) were always the same physical document — the admin
-- asked to stop treating them as two separate slots and keep only
-- vehicle_registration, which already existed as a normal per-rider
-- Documents page slot. The dedicated operating_card_extra_form slot is
-- retired entirely (see document-status.ts); every row that used it is
-- merged into vehicle_registration here first so no uploaded file is lost.

-- Riders who have a card form but no vehicle_registration row yet: create
-- one from the form's file.
INSERT INTO public.rider_documents
  (company_id, rider_id, doc_type, storage_path, file_name, expiry_date, needs_expiry, uploaded_at)
SELECT f.company_id, f.rider_id, 'vehicle_registration', f.storage_path, f.file_name, NULL, false, f.uploaded_at
FROM public.rider_documents f
WHERE f.doc_type = 'operating_card_extra_form'
  AND NOT EXISTS (
    SELECT 1 FROM public.rider_documents v
    WHERE v.rider_id = f.rider_id AND v.doc_type = 'vehicle_registration'
  );

-- Riders who already have a vehicle_registration row but never uploaded a
-- file to it: fill it in from their card form instead of leaving it empty.
-- A rider who already uploaded their OWN vehicle_registration file
-- independently keeps it untouched — their card form's file is simply
-- dropped below, same as addRiderToOperatingCard never overwrites one
-- either.
UPDATE public.rider_documents v
SET storage_path = f.storage_path,
    file_name = f.file_name,
    uploaded_at = f.uploaded_at
FROM public.rider_documents f
WHERE v.doc_type = 'vehicle_registration'
  AND f.doc_type = 'operating_card_extra_form'
  AND f.rider_id = v.rider_id
  AND v.storage_path IS NULL
  AND f.storage_path IS NOT NULL;

-- The slot itself is retired — every rider either already got migrated
-- above, or had no file to migrate in the first place. Storage objects
-- these rows referenced are NOT removed (Storage isn't reachable from plain
-- SQL) — a row that got merged still points at the same path from its new
-- vehicle_registration row, so only a row that was skipped (the rider
-- already had their own vehicle_registration) leaves its file orphaned.
DELETE FROM public.rider_documents WHERE doc_type = 'operating_card_extra_form';
