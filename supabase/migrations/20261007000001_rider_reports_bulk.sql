-- The public rider lookup now groups daily reports by calendar month
-- instead of listing every day — a rider picks "October 2026" and sees the
-- whole month's totals, not a day-by-day list. That means fetching every
-- day's data within the picked month in one call instead of one row at a
-- time (get_rider_report stays as-is, still used nowhere now but kept for
-- any other caller that wants a single day).
CREATE OR REPLACE FUNCTION public.get_rider_reports_bulk(
  _rider_id uuid, _report_ids uuid[], _password text DEFAULT NULL
)
RETURNS TABLE (report_id uuid, data jsonb, columns jsonb, day smallint, file_name text, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rr.report_id, rr.data, rr.columns, rep.day, rep.file_name, rep.note
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  JOIN public.riders rd ON rd.id = rr.rider_id
  WHERE rr.rider_id = _rider_id
    AND rr.report_id = ANY(_report_ids)
    AND NOT rd.is_blocked
    AND NOT rep.is_hidden
    AND public.is_company_active(rep.company_id)
    AND public.rider_password_ok(_rider_id, _password)
$$;
REVOKE ALL ON FUNCTION public.get_rider_reports_bulk(uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rider_reports_bulk(uuid, uuid[], text) TO anon, authenticated;
