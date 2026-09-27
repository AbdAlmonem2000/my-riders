-- Company-level "plan" page permissions, set only by the super admin —
-- gates what pages a COMPANY'S OWN ADMIN (and, transitively, any staff it
-- creates) can use, the same five pages/tiers already used for staff
-- (see 20260920020000): overview (bool), riders/reports/letters
-- ('none'|'view'|'full'), documents ('none'|'view_only'|'full').
--
-- DELIBERATE, IMMEDIATE ROLLOUT: every company — existing and new — is
-- reset to the restrictive default (reports view-only, nothing else) the
-- moment this migration runs, not just companies created going forward.
-- Confirmed explicitly before writing this migration.
--
-- Implementation choice: rather than dropping and rewriting the six
-- existing "Admins manage own company X" policies (the foundational grant
-- every company currently depends on for everything), this adds NEW
-- RESTRICTIVE policies on top of them instead. A restrictive policy can
-- only ever narrow what a permissive policy already allows (they're ANDed
-- together) — it cannot grant anything by itself. That means this
-- migration cannot break any currently-working access path by mistake;
-- the worst a bug here could do is be over-restrictive, never open a hole
-- or (like the last incident) lock everyone out via recursion — every
-- function below is SECURITY DEFINER and only ever queries `companies`,
-- which has no policies that query these tables back, so there's no
-- self-referential loop possible.
--
-- Staff (role='user') policies are intersected with the same company plan
-- further down, so a company on a restricted plan can't be routed around
-- by creating a staff account with broader personal permissions.

ALTER TABLE public.companies
  ADD COLUMN plan_overview_access boolean NOT NULL DEFAULT false,
  ADD COLUMN plan_riders_access text NOT NULL DEFAULT 'none'
    CHECK (plan_riders_access IN ('none', 'view', 'full')),
  ADD COLUMN plan_reports_access text NOT NULL DEFAULT 'view'
    CHECK (plan_reports_access IN ('none', 'view', 'full')),
  ADD COLUMN plan_documents_access text NOT NULL DEFAULT 'none'
    CHECK (plan_documents_access IN ('none', 'view_only', 'full')),
  ADD COLUMN plan_letters_access text NOT NULL DEFAULT 'none'
    CHECK (plan_letters_access IN ('none', 'view', 'full'));

CREATE OR REPLACE FUNCTION public.get_company_plan_overview_access(_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT plan_overview_access FROM public.companies WHERE id = _company_id
$$;
REVOKE EXECUTE ON FUNCTION public.get_company_plan_overview_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_plan_overview_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_company_plan_riders_access(_company_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT plan_riders_access FROM public.companies WHERE id = _company_id
$$;
REVOKE EXECUTE ON FUNCTION public.get_company_plan_riders_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_plan_riders_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_company_plan_reports_access(_company_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT plan_reports_access FROM public.companies WHERE id = _company_id
$$;
REVOKE EXECUTE ON FUNCTION public.get_company_plan_reports_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_plan_reports_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_company_plan_documents_access(_company_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT plan_documents_access FROM public.companies WHERE id = _company_id
$$;
REVOKE EXECUTE ON FUNCTION public.get_company_plan_documents_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_plan_documents_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_company_plan_letters_access(_company_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT plan_letters_access FROM public.companies WHERE id = _company_id
$$;
REVOKE EXECUTE ON FUNCTION public.get_company_plan_letters_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_company_plan_letters_access(uuid) TO authenticated, service_role;

-- The Overview page is built from reports, rider_reports and riders (top
-- performers, the rider search, the trend chart), so a plan that opens it
-- also has to allow READING those three tables — otherwise it would open
-- to an empty dashboard of unnamed numbers. Writes stay tied to their own
-- page's tier.

-- ============================================================
-- reports — plan_reports_access
-- ============================================================
CREATE POLICY "Company plan gates reports read" ON public.reports
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) IN ('view', 'full')
  OR public.get_company_plan_overview_access(company_id)
);
CREATE POLICY "Company plan gates reports insert" ON public.reports
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates reports update" ON public.reports
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates reports delete" ON public.reports
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) = 'full'
);

-- ============================================================
-- riders — plan_riders_access
-- ============================================================
CREATE POLICY "Company plan gates riders read" ON public.riders
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_riders_access(company_id) IN ('view', 'full')
  OR public.get_company_plan_overview_access(company_id)
);
CREATE POLICY "Company plan gates riders insert" ON public.riders
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_riders_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates riders update" ON public.riders
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_riders_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates riders delete" ON public.riders
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_riders_access(company_id) = 'full'
);

-- ============================================================
-- rider_reports — same tier as reports (per-rider rows of a report)
-- ============================================================
CREATE POLICY "Company plan gates rider_reports read" ON public.rider_reports
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) IN ('view', 'full')
  OR public.get_company_plan_overview_access(company_id)
);
CREATE POLICY "Company plan gates rider_reports insert" ON public.rider_reports
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates rider_reports update" ON public.rider_reports
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates rider_reports delete" ON public.rider_reports
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) = 'full'
);

-- ============================================================
-- report_sheets — same tier as reports
-- ============================================================
CREATE POLICY "Company plan gates report_sheets read" ON public.report_sheets
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) IN ('view', 'full')
);
CREATE POLICY "Company plan gates report_sheets insert" ON public.report_sheets
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates report_sheets update" ON public.report_sheets
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates report_sheets delete" ON public.report_sheets
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_reports_access(company_id) = 'full'
);

-- ============================================================
-- rider_documents — plan_documents_access
-- ============================================================
CREATE POLICY "Company plan gates rider_documents read" ON public.rider_documents
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_documents_access(company_id) IN ('view_only', 'full')
);
CREATE POLICY "Company plan gates rider_documents insert" ON public.rider_documents
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_documents_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates rider_documents update" ON public.rider_documents
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_documents_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates rider_documents delete" ON public.rider_documents
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_documents_access(company_id) = 'full'
);

-- ============================================================
-- company_letters — plan_letters_access
-- ============================================================
CREATE POLICY "Company plan gates company_letters read" ON public.company_letters
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_letters_access(company_id) IN ('view', 'full')
);
CREATE POLICY "Company plan gates company_letters insert" ON public.company_letters
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_letters_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates company_letters update" ON public.company_letters
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_letters_access(company_id) = 'full'
);
CREATE POLICY "Company plan gates company_letters delete" ON public.company_letters
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.get_company_plan_letters_access(company_id) = 'full'
);

-- ============================================================
-- Staff (role='user') storage policies for rider-documents: also require
-- the company's plan to allow it, on top of the staff member's own tier —
-- otherwise a company on a restricted plan could bypass it by giving a
-- staff account full personal documents_access.
-- ============================================================

DROP POLICY IF EXISTS "Staff read rider document files" ON storage.objects;
CREATE POLICY "Staff read rider document files" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'rider-documents'
  AND public.get_member_role(auth.uid()) = 'user'
  AND public.get_member_documents_access(auth.uid()) IN ('view_only', 'full')
);

CREATE POLICY "Company plan gates staff rider document file reads" ON storage.objects
AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  bucket_id != 'rider-documents'
  OR public.is_super_admin(auth.uid())
  OR public.get_member_role(auth.uid()) != 'user'
  OR public.get_company_plan_documents_access(public.get_member_company(auth.uid())) IN ('view_only', 'full')
);

CREATE POLICY "Company plan gates staff rider document file writes" ON storage.objects
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id != 'rider-documents'
  OR public.is_super_admin(auth.uid())
  OR public.get_member_role(auth.uid()) != 'user'
  OR public.get_company_plan_documents_access(public.get_member_company(auth.uid())) = 'full'
);

CREATE POLICY "Company plan gates staff rider document file deletes" ON storage.objects
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  bucket_id != 'rider-documents'
  OR public.is_super_admin(auth.uid())
  OR public.get_member_role(auth.uid()) != 'user'
  OR public.get_company_plan_documents_access(public.get_member_company(auth.uid())) = 'full'
);
