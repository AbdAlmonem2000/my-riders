-- Three finer-grained operating-cards permissions, each only meaningful
-- when operating_cards_access is already true: uploading a bulk Excel
-- sheet, exporting the table to Excel, and deleting a card. Defaults to
-- true so no existing staff member loses access they already had.

ALTER TABLE public.user_roles
  ADD COLUMN operating_cards_upload_access boolean NOT NULL DEFAULT true,
  ADD COLUMN operating_cards_export_access boolean NOT NULL DEFAULT true,
  ADD COLUMN operating_cards_delete_access boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_member_operating_cards_upload_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT operating_cards_upload_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_operating_cards_upload_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_operating_cards_upload_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_member_operating_cards_export_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT operating_cards_export_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_operating_cards_export_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_operating_cards_export_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_member_operating_cards_delete_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT operating_cards_delete_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_member_operating_cards_delete_access(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_operating_cards_delete_access(uuid) TO authenticated, service_role;

-- company_admin_list_staff gains the three new columns.
DROP FUNCTION IF EXISTS public.company_admin_list_staff(uuid);
CREATE OR REPLACE FUNCTION public.company_admin_list_staff(_company_id uuid)
RETURNS TABLE (
  user_id uuid, email text, display_name text, last_sign_in_at timestamptz,
  allowed_areas text[], overview_access boolean, riders_access text,
  riders_delete_access boolean, riders_block_access boolean, reports_access text,
  documents_access text, letters_access text, notifications_access boolean,
  operating_cards_access boolean, operating_cards_upload_access boolean,
  operating_cards_export_access boolean, operating_cards_delete_access boolean,
  created_at timestamptz
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
         ur.operating_cards_export_access, ur.operating_cards_delete_access, ur.created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.role = 'user' AND ur.company_id = _company_id
  ORDER BY ur.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) TO authenticated;
