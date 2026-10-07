-- The dashboard's column filters (which metric columns drive the KPI
-- tiles/comparison, and which column each breakdown chart slices by) are
-- moving from per-browser localStorage to a single shared value stored on
-- the company itself (see the next migration), so every user in the
-- company sees the same picks on every device. Only the company's real
-- admin could change it before; this lets the admin delegate that to a
-- specific staff member too. Defaults to false (unlike
-- expiry_alerts_access's default true) because this is a brand-new
-- capability being handed out selectively, not an existing one being kept
-- for users who already had it.

ALTER TABLE public.user_roles
  ADD COLUMN dashboard_filters_edit_access boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_member_dashboard_filters_edit_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT dashboard_filters_edit_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_dashboard_filters_edit_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_dashboard_filters_edit_access(uuid) TO authenticated, service_role;

-- company_admin_list_staff gains the new column.
DROP FUNCTION IF EXISTS public.company_admin_list_staff(uuid);
CREATE OR REPLACE FUNCTION public.company_admin_list_staff(_company_id uuid)
RETURNS TABLE (
  user_id uuid, email text, display_name text, last_sign_in_at timestamptz,
  allowed_areas text[], overview_access boolean, riders_access text,
  riders_delete_access boolean, riders_block_access boolean, reports_access text,
  documents_access text, letters_access text, notifications_access boolean,
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
         ur.reports_access, ur.documents_access, ur.letters_access, ur.notifications_access,
         ur.operating_cards_access, ur.operating_cards_upload_access,
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
