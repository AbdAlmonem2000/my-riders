-- Let a company attach documents beyond the 7 required ones, each with an
-- admin-typed name (`label`). A custom document uses doc_type
-- 'custom:<uuid>' (generated client-side) instead of one of the 7 fixed
-- keys, so the old CHECK constraint that only allowed those 7 values has to
-- go — validation for both the fixed and custom shapes now happens in
-- uploadRiderDocument instead.

ALTER TABLE public.rider_documents DROP CONSTRAINT IF EXISTS rider_documents_doc_type_check;
ALTER TABLE public.rider_documents ADD COLUMN label text;
