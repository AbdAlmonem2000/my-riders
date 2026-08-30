-- A blocked rider was hidden from the lookup entirely, which looked exactly
-- like "no data on file". Return them instead with an is_blocked flag so the
-- page can tell them their access was disabled. The two report RPCs
-- (list_rider_reports / get_rider_report) still hard-deny blocked riders, so
-- no report data is exposed.

DROP FUNCTION IF EXISTS public.lookup_riders_by_iqama(text);

CREATE OR REPLACE FUNCTION public.lookup_riders_by_iqama(_iqama text)
RETURNS TABLE (
  rider_id uuid,
  rider_name text,
  rider_photo_url text,
  rider_extra jsonb,
  rider_is_blocked boolean,
  company_id uuid,
  company_name text,
  company_logo_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rider_name, r.photo_url, r.extra, r.is_blocked,
         r.company_id, c.name, c.logo_url
  FROM public.riders r
  JOIN public.companies c ON c.id = r.company_id
  WHERE (r.iqama_number = _iqama OR r.id_number = _iqama)
    AND NOT c.is_suspended
    AND EXISTS (SELECT 1 FROM public.rider_reports rr WHERE rr.rider_id = r.id)
$$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon, authenticated;
