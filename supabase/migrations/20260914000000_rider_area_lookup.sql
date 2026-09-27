-- Surface a rider's area in the public lookup RPC, so it shows up next to
-- their other details on the rider lookup page (same place rider_extra is
-- shown), not just in the company's admin tables.

DROP FUNCTION IF EXISTS public.lookup_riders_by_iqama(text);
CREATE OR REPLACE FUNCTION public.lookup_riders_by_iqama(_iqama text)
RETURNS TABLE (
  rider_id uuid,
  rider_name text,
  rider_photo_url text,
  rider_area text,
  rider_extra jsonb,
  rider_is_blocked boolean,
  rider_has_password boolean,
  company_id uuid,
  company_name text,
  company_logo_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rider_name, r.photo_url, r.area, r.extra, r.is_blocked,
         (r.password_hash IS NOT NULL),
         r.company_id, c.name, c.logo_url
  FROM public.riders r
  JOIN public.companies c ON c.id = r.company_id
  WHERE (r.iqama_number = _iqama OR r.id_number = _iqama)
    AND NOT c.is_suspended
    AND EXISTS (SELECT 1 FROM public.rider_reports rr WHERE rr.rider_id = r.id)
$$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon, authenticated;
