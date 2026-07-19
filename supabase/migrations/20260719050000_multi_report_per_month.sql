-- A company can now upload more than one report for the same month (e.g.
-- salaries, tier/category, kilometers), distinguished by a title. The old
-- one-report-per-month uniqueness becomes one-report-per-(month, title).
ALTER TABLE public.reports ADD COLUMN title text NOT NULL DEFAULT 'التقرير الرئيسي';

DROP INDEX IF EXISTS public.reports_company_month_year_uk;
CREATE UNIQUE INDEX reports_company_month_year_title_uk
  ON public.reports(company_id, month, year, title);

-- list_rider_reports must return the title so the rider UI can group
-- multiple reports under the same month.
DROP FUNCTION IF EXISTS public.list_rider_reports(uuid);

CREATE OR REPLACE FUNCTION public.list_rider_reports(_rider_id uuid)
RETURNS TABLE (
  report_id uuid,
  month smallint,
  year smallint,
  title text,
  file_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rep.id, rep.month, rep.year, rep.title, rep.file_name
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  WHERE rr.rider_id = _rider_id
  ORDER BY rep.year DESC, rep.month DESC, rep.title ASC
$$;
REVOKE ALL ON FUNCTION public.list_rider_reports(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_reports(uuid) TO anon, authenticated;

-- get_rider_report must return the title too, for display.
DROP FUNCTION IF EXISTS public.get_rider_report(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_rider_report(_rider_id uuid, _report_id uuid)
RETURNS TABLE (
  data jsonb,
  columns jsonb,
  month smallint,
  year smallint,
  title text,
  file_name text,
  note text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rr.data, rr.columns, rep.month, rep.year, rep.title, rep.file_name, rep.note
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  WHERE rr.rider_id = _rider_id AND rr.report_id = _report_id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_rider_report(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rider_report(uuid, uuid) TO anon, authenticated;
