-- Expands staff (role='user') accounts from "Documents page only" into a
-- general per-page permission set a company admin can configure:
--  - overview_access: can see the Overview page (boolean — that page has no
--    write actions of its own, so there's no tier to it)
--  - riders_access: 'none' | 'view' | 'full' — 'full' additionally allows
--    editing a rider's data and resetting their lookup password, both
--    scoped to allowed_areas
--  - reports_access: 'none' | 'view' | 'full' — 'full' additionally allows
--    uploading/merging/deleting reports. Reports are inherently a
--    whole-company bulk artifact (one sheet covers every area at once), so
--    unlike riders/documents/letters this is NOT area-scoped.
--  - letters_access: 'none' | 'view' | 'full' — 'full' additionally allows
--    creating/editing/sending/deleting letters for riders in allowed_areas
--  - documents_access: unchanged in meaning, just widened to also accept
--    'none' (previously only 'full' / 'view_only')
--
-- Every helper function below is SECURITY DEFINER from the start (the
-- previous migration's mistake was adding a user_roles policy that called a
-- SECURITY INVOKER function which queried user_roles again, re-triggering
-- RLS on user_roles recursively until Postgres hit its stack depth limit —
-- already fixed in 20260920010000). SECURITY DEFINER makes each function's
-- internal query bypass RLS entirely instead of re-triggering it. The
-- _user_id = auth.uid() guard keeps the same privacy property the old
-- SECURITY INVOKER versions had for free (you can only ever resolve your
-- OWN row through these RPCs).

ALTER TABLE public.user_roles
  ADD COLUMN overview_access boolean NOT NULL DEFAULT false,
  ADD COLUMN riders_access text NOT NULL DEFAULT 'none'
    CHECK (riders_access IN ('none', 'view', 'full')),
  ADD COLUMN reports_access text NOT NULL DEFAULT 'none'
    CHECK (reports_access IN ('none', 'view', 'full')),
  ADD COLUMN letters_access text NOT NULL DEFAULT 'none'
    CHECK (letters_access IN ('none', 'view', 'full'));

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_documents_access_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_documents_access_check
    CHECK (documents_access IN ('none', 'view_only', 'full'));

CREATE OR REPLACE FUNCTION public.get_member_overview_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT overview_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_member_riders_access(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT riders_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_member_reports_access(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT reports_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_member_letters_access(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT letters_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;

-- ============================================================
-- Tightens the two staff policies from the previous migration, from
-- before documents_access could be 'none': they granted read access to
-- ANY staff role regardless of tier. Now that 'none' is a real value,
-- both need to actually check it.
-- ============================================================

DROP POLICY IF EXISTS "Staff read own company rider_documents within allowed areas"
  ON public.rider_documents;
CREATE POLICY "Staff read own company rider_documents within allowed areas"
  ON public.rider_documents FOR SELECT TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_documents_access(auth.uid()) IN ('view_only', 'full')
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

DROP POLICY IF EXISTS "Staff read rider document files" ON storage.objects;
CREATE POLICY "Staff read rider document files" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'rider-documents'
  AND public.get_member_role(auth.uid()) = 'user'
  AND public.get_member_documents_access(auth.uid()) IN ('view_only', 'full')
);

-- ============================================================
-- riders: staff with riders_access='full' may also UPDATE (edit rider
-- data) within their allowed areas. SELECT stays as-is (unconditional for
-- any staff role — Documents/Letters/Reports all need to resolve rider
-- names/areas regardless of whether the Riders page itself is granted).
-- ============================================================

CREATE POLICY "Full-access staff update own company riders within allowed areas"
  ON public.riders FOR UPDATE TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_riders_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
    AND (
      public.get_member_allowed_areas(auth.uid()) IS NULL
      OR area = ANY(public.get_member_allowed_areas(auth.uid()))
    )
  )
  WITH CHECK (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_riders_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
    AND (
      public.get_member_allowed_areas(auth.uid()) IS NULL
      OR area = ANY(public.get_member_allowed_areas(auth.uid()))
    )
  );

-- admin_set_rider_password: extend the existing admin-only check to also
-- accept full-access riders staff whose allowed areas include this rider.
CREATE OR REPLACE FUNCTION public.admin_set_rider_password(_rider_id uuid, _password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  cid uuid;
  rider_area text;
BEGIN
  SELECT company_id, area INTO cid, rider_area FROM public.riders WHERE id = _rider_id;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;
  IF NOT (
    public.is_super_admin(auth.uid())
    OR cid = public.get_user_company(auth.uid())
    OR (
      cid = public.get_member_company(auth.uid())
      AND public.get_member_role(auth.uid()) = 'user'
      AND public.get_member_riders_access(auth.uid()) = 'full'
      AND (
        public.get_member_allowed_areas(auth.uid()) IS NULL
        OR rider_area = ANY(public.get_member_allowed_areas(auth.uid()))
      )
    )
  ) THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  UPDATE public.riders
  SET password_hash = CASE
    WHEN coalesce(_password, '') = '' THEN NULL
    ELSE extensions.crypt(_password, extensions.gen_salt('bf'))
  END
  WHERE id = _rider_id;
END;
$$;

-- ============================================================
-- reports / rider_reports / report_sheets: staff with reports_access —
-- company-wide (never area-scoped: a report is one bulk sheet covering
-- every area at once, so splitting it by area doesn't make sense).
-- ============================================================

CREATE POLICY "Staff read own company reports"
  ON public.reports FOR SELECT TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_reports_access(auth.uid()) IN ('view', 'full')
    AND company_id = public.get_member_company(auth.uid())
  );

CREATE POLICY "Full-access staff manage own company reports"
  ON public.reports FOR ALL TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_reports_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
  )
  WITH CHECK (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_reports_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
  );

CREATE POLICY "Staff read own company rider_reports"
  ON public.rider_reports FOR SELECT TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_reports_access(auth.uid()) IN ('view', 'full')
    AND company_id = public.get_member_company(auth.uid())
  );

CREATE POLICY "Full-access staff manage own company rider_reports"
  ON public.rider_reports FOR ALL TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_reports_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
  )
  WITH CHECK (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_reports_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
  );

CREATE POLICY "Staff read own company report_sheets"
  ON public.report_sheets FOR SELECT TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_reports_access(auth.uid()) IN ('view', 'full')
    AND company_id = public.get_member_company(auth.uid())
  );

CREATE POLICY "Full-access staff manage own company report_sheets"
  ON public.report_sheets FOR ALL TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_reports_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
  )
  WITH CHECK (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_reports_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
  );

-- ============================================================
-- company_letters: staff with letters_access, scoped to allowed_areas via
-- the letter's rider (a still-unlinked draft has rider_id NULL and is
-- allowed through, matching the existing save-then-send flow).
-- ============================================================

CREATE POLICY "Letters-enabled staff read own company letters within allowed areas"
  ON public.company_letters FOR SELECT TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_letters_access(auth.uid()) IN ('view', 'full')
    AND company_id = public.get_member_company(auth.uid())
    AND (
      rider_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.riders r WHERE r.id = company_letters.rider_id
          AND (
            public.get_member_allowed_areas(auth.uid()) IS NULL
            OR r.area = ANY(public.get_member_allowed_areas(auth.uid()))
          )
      )
    )
  );

CREATE POLICY "Full-access staff manage own company letters within allowed areas"
  ON public.company_letters FOR ALL TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_letters_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
    AND (
      rider_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.riders r WHERE r.id = company_letters.rider_id
          AND (
            public.get_member_allowed_areas(auth.uid()) IS NULL
            OR r.area = ANY(public.get_member_allowed_areas(auth.uid()))
          )
      )
    )
  )
  WITH CHECK (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_letters_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
    AND (
      rider_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.riders r WHERE r.id = company_letters.rider_id
          AND (
            public.get_member_allowed_areas(auth.uid()) IS NULL
            OR r.area = ANY(public.get_member_allowed_areas(auth.uid()))
          )
      )
    )
  );

-- ============================================================
-- company_admin_list_staff: widen the returned columns to the new
-- permission fields, so the Users page can show/edit all of them.
-- Postgres won't let CREATE OR REPLACE change a function's return column
-- set, so the old signature has to be dropped first.
-- ============================================================

DROP FUNCTION IF EXISTS public.company_admin_list_staff(uuid);
CREATE OR REPLACE FUNCTION public.company_admin_list_staff(_company_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  last_sign_in_at timestamptz,
  allowed_areas text[],
  overview_access boolean,
  riders_access text,
  reports_access text,
  documents_access text,
  letters_access text,
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
         ur.overview_access, ur.riders_access, ur.reports_access,
         ur.documents_access, ur.letters_access, ur.created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'user' AND ur.company_id = _company_id
  ORDER BY ur.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) TO authenticated;
