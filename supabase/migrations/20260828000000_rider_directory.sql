-- Rider directory (master data). A company uploads one sheet that establishes
-- each rider's identity: an Iqama number and/or a separate ID number, plus the
-- name, a photo (kept as the external link exactly as given in the sheet) and
-- any other columns the sheet happens to carry. Once a rider is on file, a
-- monthly report row only needs to carry ONE of the two numbers — the system
-- resolves the rest — and the report never overwrites directory-owned data, it
-- only backfills blank fields.

-- Photo link + free-form extra columns captured from the directory sheet.
ALTER TABLE public.riders ADD COLUMN photo_url text;
ALTER TABLE public.riders ADD COLUMN extra jsonb NOT NULL DEFAULT '{}'::jsonb;

-- A rider may now be known by only an ID (no Iqama), so iqama_number is no
-- longer required — but at least one identifier must be present. Existing rows
-- all carry an Iqama number, so the CHECK validates cleanly.
ALTER TABLE public.riders ALTER COLUMN iqama_number DROP NOT NULL;
ALTER TABLE public.riders ADD CONSTRAINT riders_identifier_present
  CHECK (iqama_number IS NOT NULL OR id_number IS NOT NULL);

-- The existing UNIQUE (company_id, iqama_number) index keeps working with a
-- nullable column — Postgres treats NULLs as distinct, so ID-only riders
-- (iqama_number IS NULL) never collide with each other.

-- lookup_riders_by_iqama must return the photo + extra fields so the public
-- rider page can show them; changing a TABLE return's columns needs a drop.
DROP FUNCTION IF EXISTS public.lookup_riders_by_iqama(text);

CREATE OR REPLACE FUNCTION public.lookup_riders_by_iqama(_iqama text)
RETURNS TABLE (
  rider_id uuid,
  rider_name text,
  rider_photo_url text,
  rider_extra jsonb,
  company_id uuid,
  company_name text,
  company_logo_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rider_name, r.photo_url, r.extra, r.company_id, c.name, c.logo_url
  FROM public.riders r
  JOIN public.companies c ON c.id = r.company_id
  WHERE (r.iqama_number = _iqama OR r.id_number = _iqama)
    AND NOT c.is_suspended
    AND EXISTS (SELECT 1 FROM public.rider_reports rr WHERE rr.rider_id = r.id)
$$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon, authenticated;
