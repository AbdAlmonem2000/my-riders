-- A rider can be identified by two different numbers on the same uploaded
-- sheet — an Iqama number and a separate ID (e.g. national ID, employee
-- ID). iqama_number stays the stable per-rider key (unique per company,
-- used for upsert-on-reupload); id_number is a secondary, optional number
-- for the same rider row so they're searchable by either one.
ALTER TABLE public.riders ADD COLUMN id_number text;

CREATE INDEX idx_riders_id_number ON public.riders(company_id, id_number)
WHERE id_number IS NOT NULL;

DROP FUNCTION IF EXISTS public.lookup_riders_by_iqama(text);

CREATE OR REPLACE FUNCTION public.lookup_riders_by_iqama(_iqama text)
RETURNS TABLE (
  rider_id uuid,
  rider_name text,
  company_id uuid,
  company_name text,
  company_logo_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rider_name, r.company_id, c.name, c.logo_url
  FROM public.riders r
  JOIN public.companies c ON c.id = r.company_id
  WHERE (r.iqama_number = _iqama OR r.id_number = _iqama)
    AND EXISTS (SELECT 1 FROM public.rider_reports rr WHERE rr.rider_id = r.id)
$$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon, authenticated;
