-- Lets the super admin suspend a company: its own admin(s) lose all
-- access to their dashboard/data, and its riders stop being able to look
-- up or view any report — reversible at any time by un-suspending.
ALTER TABLE public.companies ADD COLUMN is_suspended boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_company_active(_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT COALESCE((SELECT is_suspended FROM public.companies WHERE id = _company_id), false)
$$;
REVOKE ALL ON FUNCTION public.is_company_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_active(uuid) TO anon, authenticated;

-- Company admin RLS: block all reads/writes on the suspended company's own
-- reports/riders/rider_reports. Super admin is unaffected (short-circuits
-- via is_super_admin() before the active-company check).
DROP POLICY IF EXISTS "Admins manage own company reports" ON public.reports;
CREATE POLICY "Admins manage own company reports" ON public.reports FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (company_id = public.get_user_company(auth.uid()) AND public.is_company_active(company_id))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (company_id = public.get_user_company(auth.uid()) AND public.is_company_active(company_id))
);

DROP POLICY IF EXISTS "Admins manage own company riders" ON public.riders;
CREATE POLICY "Admins manage own company riders" ON public.riders FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (company_id = public.get_user_company(auth.uid()) AND public.is_company_active(company_id))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (company_id = public.get_user_company(auth.uid()) AND public.is_company_active(company_id))
);

DROP POLICY IF EXISTS "Admins manage own company rider_reports" ON public.rider_reports;
CREATE POLICY "Admins manage own company rider_reports" ON public.rider_reports FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (company_id = public.get_user_company(auth.uid()) AND public.is_company_active(company_id))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (company_id = public.get_user_company(auth.uid()) AND public.is_company_active(company_id))
);

-- Public rider lookup: a suspended company's riders become invisible to
-- the public search entirely.
DROP FUNCTION IF EXISTS public.lookup_riders_by_iqama(text);

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
  WHERE (r.iqama_number = _iqama OR r.id_number = _iqama)
    AND NOT c.is_suspended
    AND EXISTS (SELECT 1 FROM public.rider_reports rr WHERE rr.rider_id = r.id)
$$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon, authenticated;

-- Defense in depth: a bookmarked report link also stops working the
-- moment the company is suspended, not just fresh lookups.
DROP FUNCTION IF EXISTS public.list_rider_reports(uuid);

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
  WHERE rr.rider_id = _rider_id AND public.is_company_active(rep.company_id)
  ORDER BY rep.year DESC, rep.month DESC
$$;
REVOKE ALL ON FUNCTION public.list_rider_reports(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_reports(uuid) TO anon, authenticated;

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
    AND public.is_company_active(rep.company_id)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_rider_report(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rider_report(uuid, uuid) TO anon, authenticated;
