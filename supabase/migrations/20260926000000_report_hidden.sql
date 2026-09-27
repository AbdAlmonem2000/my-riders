-- Lets a company hide a month's report from riders without deleting it (e.g.
-- while still double-checking the numbers). The admin dashboard keeps
-- showing it either way; riders just can't look it up while it's hidden.

ALTER TABLE public.reports ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.list_rider_reports(uuid, text);
CREATE OR REPLACE FUNCTION public.list_rider_reports(_rider_id uuid, _password text DEFAULT NULL)
RETURNS TABLE (report_id uuid, month smallint, year smallint, file_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rep.id, rep.month, rep.year, rep.file_name
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  JOIN public.riders rd ON rd.id = rr.rider_id
  WHERE rr.rider_id = _rider_id
    AND NOT rd.is_blocked
    AND NOT rep.is_hidden
    AND public.is_company_active(rep.company_id)
    AND public.rider_password_ok(_rider_id, _password)
  ORDER BY rep.year DESC, rep.month DESC
$$;
REVOKE ALL ON FUNCTION public.list_rider_reports(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_reports(uuid, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_rider_report(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.get_rider_report(_rider_id uuid, _report_id uuid, _password text DEFAULT NULL)
RETURNS TABLE (data jsonb, columns jsonb, month smallint, year smallint, file_name text, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rr.data, rr.columns, rep.month, rep.year, rep.file_name, rep.note
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  JOIN public.riders rd ON rd.id = rr.rider_id
  WHERE rr.rider_id = _rider_id AND rr.report_id = _report_id
    AND NOT rd.is_blocked
    AND NOT rep.is_hidden
    AND public.is_company_active(rep.company_id)
    AND public.rider_password_ok(_rider_id, _password)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_rider_report(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rider_report(uuid, uuid, text) TO anon, authenticated;
