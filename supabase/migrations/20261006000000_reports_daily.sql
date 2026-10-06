-- Reports move from one upload per (company, month, year) to one upload per
-- (company, month, year, day) — a company can now upload a separate report
-- for each day of the month instead of one file covering the whole month.
-- `day` is nullable so every report uploaded before this migration (which
-- genuinely represents "the whole month", not any specific day) keeps
-- working exactly as it did — it's never backfilled or reinterpreted.
-- Postgres treats each NULL as distinct in a unique index, so those old
-- whole-month rows never collide with each other or with a new day-scoped
-- upload for the same month.
ALTER TABLE public.reports ADD COLUMN day smallint;
ALTER TABLE public.reports ADD CONSTRAINT reports_day_range CHECK (day IS NULL OR (day >= 1 AND day <= 31));

DROP INDEX IF EXISTS public.reports_company_month_year_uk;
CREATE UNIQUE INDEX reports_company_month_year_day_uk
  ON public.reports(company_id, month, year, day);

-- Both RPCs the public rider lookup uses need to surface `day` too, so a
-- rider can see (and the page can label) each day's report individually
-- instead of only "<month> <year>".
DROP FUNCTION IF EXISTS public.list_rider_reports(uuid, text);
CREATE OR REPLACE FUNCTION public.list_rider_reports(_rider_id uuid, _password text DEFAULT NULL)
RETURNS TABLE (report_id uuid, month smallint, year smallint, day smallint, file_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rep.id, rep.month, rep.year, rep.day, rep.file_name
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  JOIN public.riders rd ON rd.id = rr.rider_id
  WHERE rr.rider_id = _rider_id
    AND NOT rd.is_blocked
    AND NOT rep.is_hidden
    AND public.is_company_active(rep.company_id)
    AND public.rider_password_ok(_rider_id, _password)
  ORDER BY rep.year DESC, rep.month DESC, rep.day DESC NULLS LAST
$$;
REVOKE ALL ON FUNCTION public.list_rider_reports(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_reports(uuid, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_rider_report(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.get_rider_report(_rider_id uuid, _report_id uuid, _password text DEFAULT NULL)
RETURNS TABLE (data jsonb, columns jsonb, month smallint, year smallint, day smallint, file_name text, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rr.data, rr.columns, rep.month, rep.year, rep.day, rep.file_name, rep.note
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
