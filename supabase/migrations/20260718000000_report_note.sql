-- Lets a company admin attach a general note to a specific month's report
-- (e.g. "we'll pay commissions late this month"), shown to every rider of
-- that company when they open that month's report.

ALTER TABLE public.reports ADD COLUMN note text;

-- get_rider_report must return the note too; changing a TABLE return's
-- column list requires dropping the function first.
DROP FUNCTION IF EXISTS public.get_rider_report(uuid, uuid);

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
  WHERE rr.rider_id = _rider_id AND rr.report_id = _report_id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_rider_report(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rider_report(uuid, uuid) TO anon, authenticated;
