-- Lets a company admin scope a staff member to specific riders by id, the
-- same shape allowed_areas already has (NULL = no restriction, otherwise an
-- allow-list) but keyed on exact riders instead of the area text field —
-- for an admin who wants to hand one staff member a handful of named
-- riders rather than a whole area. ANDed onto every existing allowed_areas
-- check below, so a staff member scoped by both areas AND specific riders
-- only ever sees the intersection.
--
-- INSERT is the one exception: a freshly created rider's id is random, so
-- it can never already be in an admin-picked allow-list. Scoping a staff
-- member to specific existing riders therefore blocks them from creating
-- brand new ones outright (riders_create_access alone can't override this,
-- same way it can't put a new rider outside allowed_areas) — the admin can
-- still hand this staff member an unrestricted create permission by simply
-- leaving allowed_riders NULL.

ALTER TABLE public.user_roles
  ADD COLUMN allowed_riders uuid[];

CREATE OR REPLACE FUNCTION public.get_member_allowed_riders(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT allowed_riders FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_allowed_riders(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_allowed_riders(uuid) TO authenticated, service_role;

-- ============================================================
-- riders: SELECT / UPDATE / DELETE gain the allowed_riders check; INSERT
-- gains the NULL-only requirement explained above.
-- ============================================================

ALTER POLICY "Staff read own company riders within allowed areas"
  ON public.riders
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND company_id = public.get_member_company(auth.uid())
    AND (
      public.get_member_allowed_areas(auth.uid()) IS NULL
      OR area = ANY(public.get_member_allowed_areas(auth.uid()))
    )
    AND (
      public.get_member_allowed_riders(auth.uid()) IS NULL
      OR id = ANY(public.get_member_allowed_riders(auth.uid()))
    )
  );

ALTER POLICY "Full-access staff update own company riders within allowed areas"
  ON public.riders
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_riders_access(auth.uid()) = 'full'
    AND company_id = public.get_member_company(auth.uid())
    AND (
      public.get_member_allowed_areas(auth.uid()) IS NULL
      OR area = ANY(public.get_member_allowed_areas(auth.uid()))
    )
    AND (
      public.get_member_allowed_riders(auth.uid()) IS NULL
      OR id = ANY(public.get_member_allowed_riders(auth.uid()))
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
    AND (
      public.get_member_allowed_riders(auth.uid()) IS NULL
      OR id = ANY(public.get_member_allowed_riders(auth.uid()))
    )
  );

ALTER POLICY "Full-access staff delete own company riders within allowed areas"
  ON public.riders
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_riders_access(auth.uid()) = 'full'
    AND public.get_member_riders_delete_access(auth.uid())
    AND company_id = public.get_member_company(auth.uid())
    AND (
      public.get_member_allowed_areas(auth.uid()) IS NULL
      OR area = ANY(public.get_member_allowed_areas(auth.uid()))
    )
    AND (
      public.get_member_allowed_riders(auth.uid()) IS NULL
      OR id = ANY(public.get_member_allowed_riders(auth.uid()))
    )
  );

ALTER POLICY "Full-access staff create own company riders within allowed areas"
  ON public.riders
  WITH CHECK (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_riders_access(auth.uid()) = 'full'
    AND public.get_member_riders_create_access(auth.uid())
    AND company_id = public.get_member_company(auth.uid())
    AND (
      public.get_member_allowed_areas(auth.uid()) IS NULL
      OR area = ANY(public.get_member_allowed_areas(auth.uid()))
    )
    AND public.get_member_allowed_riders(auth.uid()) IS NULL
  );

-- ============================================================
-- rider_documents: both the view-tier SELECT policy and the full-tier
-- "manage" FOR ALL policy gain the check — rider_documents already carries
-- rider_id directly, so no join is needed (unlike the area check, which
-- has to reach into `riders` for the area column).
-- ============================================================

ALTER POLICY "Staff read own company rider_documents within allowed areas"
  ON public.rider_documents
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
    AND (
      public.get_member_allowed_riders(auth.uid()) IS NULL
      OR rider_documents.rider_id = ANY(public.get_member_allowed_riders(auth.uid()))
    )
  );

ALTER POLICY "Full-access staff manage own company rider_documents within allowed areas"
  ON public.rider_documents
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
    AND (
      public.get_member_allowed_riders(auth.uid()) IS NULL
      OR rider_documents.rider_id = ANY(public.get_member_allowed_riders(auth.uid()))
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
    AND (
      public.get_member_allowed_riders(auth.uid()) IS NULL
      OR rider_documents.rider_id = ANY(public.get_member_allowed_riders(auth.uid()))
    )
  );

-- ============================================================
-- company_letters: same pattern — rider_id lives directly on the table, so
-- the new check sits alongside the existing "rider_id IS NULL OR EXISTS
-- (area check)" clause instead of inside it.
-- ============================================================

ALTER POLICY "Letters-enabled staff read own company letters within allowed areas"
  ON public.company_letters
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
    AND (
      rider_id IS NULL
      OR public.get_member_allowed_riders(auth.uid()) IS NULL
      OR rider_id = ANY(public.get_member_allowed_riders(auth.uid()))
    )
  );

ALTER POLICY "Full-access staff manage own company letters within allowed areas"
  ON public.company_letters
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
    AND (
      rider_id IS NULL
      OR public.get_member_allowed_riders(auth.uid()) IS NULL
      OR rider_id = ANY(public.get_member_allowed_riders(auth.uid()))
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
    AND (
      rider_id IS NULL
      OR public.get_member_allowed_riders(auth.uid()) IS NULL
      OR rider_id = ANY(public.get_member_allowed_riders(auth.uid()))
    )
  );

-- ============================================================
-- admin_set_rider_password: the staff branch of its authorization check
-- gains the same allowed_riders condition the other full-access staff
-- policies above just got.
-- ============================================================

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
      AND (
        public.get_member_allowed_riders(auth.uid()) IS NULL
        OR _rider_id = ANY(public.get_member_allowed_riders(auth.uid()))
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
-- company_admin_list_staff gains the new column.
-- ============================================================

DROP FUNCTION IF EXISTS public.company_admin_list_staff(uuid);
CREATE OR REPLACE FUNCTION public.company_admin_list_staff(_company_id uuid)
RETURNS TABLE (
  user_id uuid, email text, display_name text, last_sign_in_at timestamptz,
  allowed_areas text[], allowed_riders uuid[], overview_access boolean, riders_access text,
  riders_delete_access boolean, riders_block_access boolean, riders_create_access boolean,
  reports_access text, documents_access text, letters_access text, notifications_access boolean,
  operating_cards_access boolean, operating_cards_upload_access boolean,
  operating_cards_export_access boolean, operating_cards_delete_access boolean,
  expiry_alerts_access boolean, dashboard_filters_edit_access boolean, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  IF public.get_user_company(auth.uid()) IS NULL
     OR public.get_user_company(auth.uid()) != _company_id THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, u.email::text, ur.display_name, u.last_sign_in_at, ur.allowed_areas,
         ur.allowed_riders, ur.overview_access, ur.riders_access, ur.riders_delete_access,
         ur.riders_block_access, ur.riders_create_access, ur.reports_access, ur.documents_access,
         ur.letters_access, ur.notifications_access, ur.operating_cards_access,
         ur.operating_cards_upload_access, ur.operating_cards_export_access,
         ur.operating_cards_delete_access, ur.expiry_alerts_access,
         ur.dashboard_filters_edit_access, ur.created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'user' AND ur.company_id = _company_id
  ORDER BY ur.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) TO authenticated;
