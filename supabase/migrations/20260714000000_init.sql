-- Consolidated initial schema for a fresh, independent project.
--
-- This single migration recreates the full schema that previously existed
-- across 11 historical migrations against a different (now inaccessible)
-- Supabase project, but written directly in its final, correct form —
-- including the multi-tenant (company-scoped) model and the security fix
-- that closes public read access to riders/reports/rider_reports (only the
-- three SECURITY DEFINER RPCs at the bottom expose data to anon).
--
-- No data is seeded here. The first super admin is created separately via
-- the GoTrue signup endpoint + a one-row INSERT (see project setup notes).

-- ============================================================
-- 1. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ============================================================
-- 2. Enum
-- ============================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- ============================================================
-- 3. Tables, indexes, grants, RLS enable (policies added in section 5,
--    after the functions they depend on exist)
-- ============================================================

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.companies TO anon, authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  month SMALLINT NOT NULL,
  year SMALLINT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rider_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX reports_company_month_year_uk ON public.reports(company_id, month, year);
CREATE INDEX idx_reports_year_month ON public.reports(year DESC, month DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.riders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  iqama_number TEXT NOT NULL,
  rider_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX riders_company_iqama_uk ON public.riders(company_id, iqama_number);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.riders TO authenticated;
GRANT ALL ON public.riders TO service_role;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rider_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, rider_id)
);
CREATE INDEX idx_rider_reports_rider ON public.rider_reports(rider_id);
CREATE INDEX idx_rider_reports_report ON public.rider_reports(report_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rider_reports TO authenticated;
GRANT ALL ON public.rider_reports TO service_role;
ALTER TABLE public.rider_reports ENABLE ROW LEVEL SECURITY;

-- Note: unlike the old schema's history, anon is never granted SELECT on
-- reports/riders/rider_reports here — public access only ever goes through
-- the SECURITY DEFINER RPCs in section 4, which return the minimal fields a
-- lookup needs instead of raw table rows.

-- ============================================================
-- 4. Functions
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin' AND company_id IS NULL
  )
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_company(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT company_id FROM public.user_roles
  WHERE user_id = _user_id AND role = 'admin' AND company_id IS NOT NULL
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_user_company(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_company(uuid) TO authenticated, service_role;

-- No-op on purpose: company admin accounts are provisioned explicitly by a
-- super admin (see accounts.functions.ts createAccount), not auto-assigned
-- on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot delete self';
  END IF;
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_user_password(_user_id uuid, _password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF length(_password) < 6 THEN
    RAISE EXCEPTION 'password too short';
  END IF;
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_update_user_password(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_password(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_user_email(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE auth.users
  SET email = _email,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_update_user_email(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_email(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_accounts()
RETURNS TABLE (
  user_id uuid,
  email text,
  last_sign_in_at timestamptz,
  role public.app_role,
  company_id uuid,
  company_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, u.email::text, u.last_sign_in_at,
         ur.role, ur.company_id, c.name, ur.created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.companies c ON c.id = ur.company_id
  ORDER BY ur.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_accounts() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_accounts() TO authenticated;

-- Public rider lookup by iqama number, across all companies. A rider's
-- iqama number is only unique per company, so a lookup can legitimately
-- match more than one company — the client shows a disambiguation list.
CREATE OR REPLACE FUNCTION public.lookup_riders_by_iqama(_iqama text)
RETURNS TABLE (
  rider_id uuid,
  rider_name text,
  company_id uuid,
  company_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rider_name, r.company_id, c.name
  FROM public.riders r
  JOIN public.companies c ON c.id = r.company_id
  WHERE r.iqama_number = _iqama
$$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon, authenticated;

-- Report months available for one specific rider (identified by the opaque
-- rider_id returned above, never by iqama number directly).
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
  WHERE rr.rider_id = _rider_id
  ORDER BY rep.year DESC, rep.month DESC
$$;
REVOKE ALL ON FUNCTION public.list_rider_reports(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_reports(uuid) TO anon, authenticated;

-- The actual report payload for one rider + one report id.
CREATE OR REPLACE FUNCTION public.get_rider_report(_rider_id uuid, _report_id uuid)
RETURNS TABLE (
  data jsonb,
  columns jsonb,
  month smallint,
  year smallint,
  file_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rr.data, rr.columns, rep.month, rep.year, rep.file_name
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  WHERE rr.rider_id = _rider_id AND rr.report_id = _report_id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_rider_report(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rider_report(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- 5. RLS Policies
-- ============================================================

CREATE POLICY "Users can read their own roles" ON public.user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Super admin manages user_roles" ON public.user_roles
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admin manages companies"
  ON public.companies FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Public can read company names (needed to show the company on the rider
-- lookup page and in the disambiguation list).
CREATE POLICY "Anyone can read companies"
  ON public.companies FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage own company reports"
  ON public.reports FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company(auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company(auth.uid())
  );

CREATE POLICY "Admins manage own company riders"
  ON public.riders FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company(auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company(auth.uid())
  );

CREATE POLICY "Admins manage own company rider_reports"
  ON public.rider_reports FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company(auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company(auth.uid())
  );

-- ============================================================
-- 6. Storage (uploaded Excel report files)
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read report files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reports' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload report files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'reports' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete report files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'reports' AND public.has_role(auth.uid(), 'admin'));
