-- Creating a brand-new rider is now its own staff permission — separate
-- from riders_access='full' (which already allows editing an existing
-- rider) and from riders_delete_access/riders_block_access — so a company
-- admin can let a staff member edit riders without also trusting them to
-- add new ones. Only meaningful when riders_access is 'full'; checked
-- together in code, same as riders_delete_access/riders_block_access.

ALTER TABLE public.user_roles
  ADD COLUMN riders_create_access boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_member_riders_create_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT riders_create_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_riders_create_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_riders_create_access(uuid) TO authenticated, service_role;

-- A staff account previously had no RLS path to INSERT into `riders` at all
-- — only the admin-only "Admins manage own company riders" FOR ALL policy
-- covered writes, and get_user_company (which it keys on) never resolves
-- for a role='user' account. This is the first permissive INSERT policy
-- for staff, same shape as the existing UPDATE one (20260920020000), gated
-- on the new permission and the staff member's allowed_areas.
CREATE POLICY "Full-access staff create own company riders within allowed areas"
  ON public.riders FOR INSERT TO authenticated
  WITH CHECK (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_riders_access(auth.uid()) = 'full'
    AND public.get_member_riders_create_access(auth.uid())
    AND company_id = public.get_member_company(auth.uid())
    AND (
      public.get_member_allowed_areas(auth.uid()) IS NULL
      OR area = ANY(public.get_member_allowed_areas(auth.uid()))
    )
  );

-- company_admin_list_staff gains the new column.
DROP FUNCTION IF EXISTS public.company_admin_list_staff(uuid);
CREATE OR REPLACE FUNCTION public.company_admin_list_staff(_company_id uuid)
RETURNS TABLE (
  user_id uuid, email text, display_name text, last_sign_in_at timestamptz,
  allowed_areas text[], overview_access boolean, riders_access text,
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
         ur.overview_access, ur.riders_access, ur.riders_delete_access, ur.riders_block_access,
         ur.riders_create_access, ur.reports_access, ur.documents_access, ur.letters_access,
         ur.notifications_access, ur.operating_cards_access, ur.operating_cards_upload_access,
         ur.operating_cards_export_access, ur.operating_cards_delete_access,
         ur.expiry_alerts_access, ur.dashboard_filters_edit_access, ur.created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'user' AND ur.company_id = _company_id
  ORDER BY ur.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) TO authenticated;
