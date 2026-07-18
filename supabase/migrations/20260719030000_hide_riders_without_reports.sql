-- A rider row can exist for a company (created the moment their iqama
-- appears in an uploaded Excel file) before that company has any report
-- containing actual data for them, or after all their reports get deleted.
-- Such entries shouldn't show up as a company choice on the public lookup —
-- only companies where this iqama has at least one real report should.
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
  WHERE r.iqama_number = _iqama
    AND EXISTS (SELECT 1 FROM public.rider_reports rr WHERE rr.rider_id = r.id)
$$;
