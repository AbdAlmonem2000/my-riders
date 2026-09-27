-- Lets a company admin create restricted "staff" accounts for their own
-- company. Reuses the 'user' value of app_role, which existed in the enum
-- from the start but was never actually assigned to anyone until now.
--
-- Each staff row carries:
--  - allowed_areas: which rider areas (riders.area) the staff member can see
--    at all. NULL means no restriction (sees every area).
--  - documents_access: 'full' (upload / replace / edit date / delete) or
--    'view_only' (view + download only) on the Documents page — the one
--    page staff accounts are scoped to; they get no access to any other
--    admin page or table beyond what's granted below.

ALTER TABLE public.user_roles
  ADD COLUMN allowed_areas text[],
  ADD COLUMN documents_access text NOT NULL DEFAULT 'full'
    CHECK (documents_access IN ('full', 'view_only'));

-- Company for BOTH admin and staff roles. get_user_company() stays
-- admin-only on purpose — it guards company-management actions (creating
-- reports, editing company profile, creating staff, ...) that staff must
-- never reach.
CREATE OR REPLACE FUNCTION public.get_member_company(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT company_id FROM public.user_roles
  WHERE user_id = _user_id AND role IN ('admin', 'user') AND company_id IS NOT NULL
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_company(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_company(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_member_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id AND company_id IS NOT NULL
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_role(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_role(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_member_documents_access(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT documents_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_documents_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_documents_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_member_allowed_areas(_user_id uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT allowed_areas FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_allowed_areas(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_allowed_areas(uuid) TO authenticated, service_role;

-- ============================================================
-- RLS: company admins manage their own company's staff rows directly
-- ============================================================

CREATE POLICY "Admins manage own company staff roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (role = 'user' AND company_id = public.get_user_company(auth.uid()))
  WITH CHECK (role = 'user' AND company_id = public.get_user_company(auth.uid()));

-- ============================================================
-- RLS: staff read riders / manage rider_documents, scoped to their
-- company and allowed areas
-- ============================================================

CREATE POLICY "Staff read own company riders within allowed areas"
  ON public.riders FOR SELECT TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND company_id = public.get_member_company(auth.uid())
    AND (
      public.get_member_allowed_areas(auth.uid()) IS NULL
      OR area = ANY(public.get_member_allowed_areas(auth.uid()))
    )
  );

CREATE POLICY "Staff read own company rider_documents within allowed areas"
  ON public.rider_documents FOR SELECT TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND company_id = public.get_member_company(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.riders r
      WHERE r.id = rider_documents.rider_id
        AND (
          public.get_member_allowed_areas(auth.uid()) IS NULL
          OR r.area = ANY(public.get_member_allowed_areas(auth.uid()))
        )
    )
  );

CREATE POLICY "Full-access staff manage own company rider_documents within allowed areas"
  ON public.rider_documents FOR ALL TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_documents_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.riders r
      WHERE r.id = rider_documents.rider_id
        AND (
          public.get_member_allowed_areas(auth.uid()) IS NULL
          OR r.area = ANY(public.get_member_allowed_areas(auth.uid()))
        )
    )
  )
  WITH CHECK (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_documents_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.riders r
      WHERE r.id = rider_documents.rider_id
        AND (
          public.get_member_allowed_areas(auth.uid()) IS NULL
          OR r.area = ANY(public.get_member_allowed_areas(auth.uid()))
        )
    )
  );

-- ============================================================
-- Storage: staff read (both tiers) / write (full tier only) document files
-- — mirrors the existing admin-only policies on this bucket exactly, just
-- gated by staff role/access instead of the 'admin' role.
-- ============================================================

CREATE POLICY "Staff read rider document files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'rider-documents' AND public.get_member_role(auth.uid()) = 'user');

CREATE POLICY "Full-access staff upload rider document files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'rider-documents'
  AND public.get_member_role(auth.uid()) = 'user'
  AND public.get_member_documents_access(auth.uid()) = 'full'
);

CREATE POLICY "Full-access staff delete rider document files" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'rider-documents'
  AND public.get_member_role(auth.uid()) = 'user'
  AND public.get_member_documents_access(auth.uid()) = 'full'
);

-- ============================================================
-- Company-scoped staff account management (mirrors the super-admin-only
-- admin_list_accounts / admin_update_user_password / admin_update_user_email
-- / admin_delete_user RPCs, but each verifies the target is a 'user'-role
-- row in the CALLING company admin's own company before touching it).
-- ============================================================

CREATE OR REPLACE FUNCTION public.company_admin_list_staff(_company_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  last_sign_in_at timestamptz,
  allowed_areas text[],
  documents_access text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF public.get_user_company(auth.uid()) IS NULL
     OR public.get_user_company(auth.uid()) != _company_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, u.email::text, u.last_sign_in_at, ur.allowed_areas,
         ur.documents_access, ur.created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'user' AND ur.company_id = _company_id
  ORDER BY ur.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.company_admin_update_staff_password(_user_id uuid, _password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _caller_company uuid;
  _target_company uuid;
BEGIN
  SELECT public.get_user_company(auth.uid()) INTO _caller_company;
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT company_id INTO _target_company
  FROM public.user_roles WHERE user_id = _user_id AND role = 'user';
  IF _target_company IS NULL OR _target_company != _caller_company THEN
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
REVOKE EXECUTE ON FUNCTION public.company_admin_update_staff_password(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_admin_update_staff_password(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.company_admin_update_staff_email(_user_id uuid, _email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _caller_company uuid;
  _target_company uuid;
BEGIN
  SELECT public.get_user_company(auth.uid()) INTO _caller_company;
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT company_id INTO _target_company
  FROM public.user_roles WHERE user_id = _user_id AND role = 'user';
  IF _target_company IS NULL OR _target_company != _caller_company THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE auth.users
  SET email = _email,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.company_admin_update_staff_email(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_admin_update_staff_email(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.company_admin_delete_staff(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _caller_company uuid;
  _target_company uuid;
BEGIN
  SELECT public.get_user_company(auth.uid()) INTO _caller_company;
  IF _caller_company IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT company_id INTO _target_company
  FROM public.user_roles WHERE user_id = _user_id AND role = 'user';
  IF _target_company IS NULL OR _target_company != _caller_company THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.company_admin_delete_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_admin_delete_staff(uuid) TO authenticated;
