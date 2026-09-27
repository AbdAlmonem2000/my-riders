-- A display name on every user_roles row (admin, staff, or the super
-- admin's own row). Required going forward when a company admin creates a
-- staff account (enforced client-side, same as email/password); existing
-- rows are left NULL rather than backfilled with a guess.
--
-- Any signed-in user can rename themselves via update_my_display_name — the
-- row is theirs (auth.uid() = user_id), so no company/role check is needed,
-- unlike every other user_roles write in this app.

ALTER TABLE public.user_roles ADD COLUMN display_name text;

CREATE OR REPLACE FUNCTION public.update_my_display_name(_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(trim(_name)) = 0 THEN
    RAISE EXCEPTION 'الاسم مطلوب';
  END IF;
  IF length(_name) > 120 THEN
    RAISE EXCEPTION 'الاسم طويل جدًا';
  END IF;
  UPDATE public.user_roles SET display_name = trim(_name) WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الحساب غير مرتبط بأي صلاحية';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_display_name(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_display_name(text) TO authenticated;

-- Both listing RPCs gain the column — DROP first since RETURNS TABLE can't
-- be changed by CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.admin_list_accounts();
CREATE OR REPLACE FUNCTION public.admin_list_accounts()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
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
  SELECT ur.user_id, u.email::text, ur.display_name, u.last_sign_in_at,
         ur.role, ur.company_id, c.name, ur.created_at
  FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.companies c ON c.id = ur.company_id
  ORDER BY ur.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_accounts() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_accounts() TO authenticated;

DROP FUNCTION IF EXISTS public.company_admin_list_staff(uuid);
CREATE OR REPLACE FUNCTION public.company_admin_list_staff(_company_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
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
  SELECT ur.user_id, u.email::text, ur.display_name, u.last_sign_in_at, ur.allowed_areas,
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
