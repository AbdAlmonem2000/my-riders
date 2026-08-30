-- Lets a company admin block a specific rider from looking up or viewing
-- their own reports (left the company, payment dispute, etc.). Reversible at
-- any time. A blocked rider simply gets "not found" — the public lookup and
-- the two report RPCs all exclude them.

ALTER TABLE public.riders ADD COLUMN is_blocked boolean NOT NULL DEFAULT false;

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
    AND NOT r.is_blocked
    AND EXISTS (SELECT 1 FROM public.rider_reports rr WHERE rr.rider_id = r.id)
$$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_rider_reports(_rider_id uuid)
RETURNS TABLE (
  report_id uuid,
  month smallint,
  year smallint,
  file_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rep.id, rep.month, rep.year, rep.file_name
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  JOIN public.riders rd ON rd.id = rr.rider_id
  WHERE rr.rider_id = _rider_id
    AND NOT rd.is_blocked
    AND public.is_company_active(rep.company_id)
  ORDER BY rep.year DESC, rep.month DESC
$$;
REVOKE ALL ON FUNCTION public.list_rider_reports(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_reports(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_rider_report(_rider_id uuid, _report_id uuid)
RETURNS TABLE (
  data jsonb,
  columns jsonb,
  month smallint,
  year smallint,
  file_name text,
  note text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rr.data, rr.columns, rep.month, rep.year, rep.file_name, rep.note
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  JOIN public.riders rd ON rd.id = rr.rider_id
  WHERE rr.rider_id = _rider_id AND rr.report_id = _report_id
    AND NOT rd.is_blocked
    AND public.is_company_active(rep.company_id)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_rider_report(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rider_report(uuid, uuid) TO anon, authenticated;
