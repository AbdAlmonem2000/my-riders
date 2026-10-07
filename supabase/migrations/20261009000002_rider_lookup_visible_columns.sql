-- Carries the company's rider_visible_columns whitelist (set from the new
-- Company Profile section) along on the same lookup every rider already
-- calls to find themselves by Iqama/ID — avoids a second round trip, and
-- riders aren't authenticated Supabase users so this has to stay a public
-- SECURITY DEFINER RPC like the rest of this function. Everything else is
-- unchanged from the previous version of this function.
DROP FUNCTION IF EXISTS public.lookup_riders_by_iqama(text);
CREATE OR REPLACE FUNCTION public.lookup_riders_by_iqama(_iqama text) RETURNS TABLE (
    rider_id uuid,
    rider_name text,
    rider_photo_url text,
    rider_photo_rotation smallint,
    rider_area text,
    rider_extra jsonb,
    rider_is_blocked boolean,
    rider_has_password boolean,
    company_id uuid,
    company_name text,
    company_logo_url text,
    company_rider_visible_columns jsonb
  ) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
SELECT r.id,
  r.rider_name,
  r.photo_url,
  r.photo_rotation,
  r.area,
  r.extra,
  r.is_blocked,
  (r.password_hash IS NOT NULL),
  r.company_id,
  c.name,
  c.logo_url,
  c.rider_visible_columns
FROM public.riders r
  JOIN public.companies c ON c.id = r.company_id
WHERE (
    r.iqama_number = _iqama
    OR r.id_number = _iqama
  )
  AND r.deleted_at IS NULL
  AND NOT c.is_suspended
  AND EXISTS (
    SELECT 1
    FROM public.rider_reports rr
    WHERE rr.rider_id = r.id
  ) $$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon,
  authenticated;
