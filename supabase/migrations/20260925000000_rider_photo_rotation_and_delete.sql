-- Two independent additions to `riders`:
--
-- 1. photo_rotation: the 0/90/180/270 rotation a company chose for a
--    photo that was saved sideways or upside down — saved once, applied
--    everywhere that photo is shown, instead of resetting every time.
--
-- 2. deleted_at: a soft delete. A company can remove a rider two ways —
--    permanently, which cascades and takes their reports/documents/letters
--    with them (the existing ON DELETE CASCADE foreign keys), or just from
--    the roster while keeping their historical report rows intact. The
--    latter can't be a real row delete (rider_reports.rider_id is NOT
--    NULL), so it's a soft delete instead: the rider disappears from every
--    roster/search screen and can no longer look themselves up, but rows
--    that already reference them are untouched.
ALTER TABLE public.riders
ADD COLUMN photo_rotation smallint NOT NULL DEFAULT 0 CHECK (photo_rotation IN (0, 90, 180, 270)),
  ADD COLUMN deleted_at timestamptz;
-- A soft-deleted rider's Iqama number must be free again for a new (or
-- corrected) entry — the old unique index blocked that.
DROP INDEX IF EXISTS public.riders_company_iqama_uk;
CREATE UNIQUE INDEX riders_company_iqama_uk ON public.riders(company_id, iqama_number)
WHERE deleted_at IS NULL;
-- The public lookup must never find a soft-deleted rider, and must show
-- the photo the company already straightened out (rider_photo_rotation) —
-- a rider can't rotate their own photo, so this can't ever go stale on
-- their own page the way a client-only rotation would.
DROP FUNCTION IF EXISTS public.lookup_riders_by_iqama(text);
CREATE OR REPLACE FUNCTION public.lookup_riders_by_iqama(_iqama text) RETURNS TABLE (
    rider_id uuid,
    rider_name text,
    rider_photo_url text,
    rider_photo_rotation smallint,
    rider_area text,
    rider_extra jsonb,
    rider_is_blocked boolean,
    rider_has_password boolean,
    company_id uuid,
    company_name text,
    company_logo_url text
  ) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
SELECT r.id,
  r.rider_name,
  r.photo_url,
  r.photo_rotation,
  r.area,
  r.extra,
  r.is_blocked,
  (r.password_hash IS NOT NULL),
  r.company_id,
  c.name,
  c.logo_url
FROM public.riders r
  JOIN public.companies c ON c.id = r.company_id
WHERE (
    r.iqama_number = _iqama
    OR r.id_number = _iqama
  )
  AND r.deleted_at IS NULL
  AND NOT c.is_suspended
  AND EXISTS (
    SELECT 1
    FROM public.rider_reports rr
    WHERE rr.rider_id = r.id
  ) $$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon,
  authenticated;
-- Deleting a rider is now its own permission — separate from
-- riders_access='full' (which already allows editing a rider's data), so a
-- company admin can let a staff member manage riders without trusting them
-- to also remove one. Only meaningful when riders_access is 'full'; checked
-- together in code, not with a CHECK constraint (simpler to express there).
ALTER TABLE public.user_roles
ADD COLUMN riders_delete_access boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.get_member_riders_delete_access(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
SELECT riders_delete_access
FROM public.user_roles
WHERE user_id = _user_id
  AND role = 'user'
  AND company_id IS NOT NULL
  AND _user_id = auth.uid()
LIMIT 1 $$;
REVOKE EXECUTE ON FUNCTION public.get_member_riders_delete_access(uuid)
FROM anon,
  PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_member_riders_delete_access(uuid) TO authenticated,
  service_role;
-- company_admin_list_staff gains the new column.
DROP FUNCTION IF EXISTS public.company_admin_list_staff(uuid);
CREATE OR REPLACE FUNCTION public.company_admin_list_staff(_company_id uuid) RETURNS TABLE (
    user_id uuid,
    email text,
    display_name text,
    last_sign_in_at timestamptz,
    allowed_areas text [],
    overview_access boolean,
    riders_access text,
    riders_delete_access boolean,
    reports_access text,
    documents_access text,
    letters_access text,
    created_at timestamptz
  ) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public,
  auth AS $$ BEGIN IF public.get_user_company(auth.uid()) IS NULL
  OR public.get_user_company(auth.uid()) != _company_id THEN RAISE EXCEPTION 'not authorized';
END IF;
RETURN QUERY
SELECT ur.user_id,
  u.email::text,
  ur.display_name,
  u.last_sign_in_at,
  ur.allowed_areas,
  ur.overview_access,
  ur.riders_access,
  ur.riders_delete_access,
  ur.reports_access,
  ur.documents_access,
  ur.letters_access,
  ur.created_at
FROM public.user_roles ur
  LEFT JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'user'
  AND ur.company_id = _company_id
ORDER BY ur.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.company_admin_list_staff(uuid)
FROM anon;
GRANT EXECUTE ON FUNCTION public.company_admin_list_staff(uuid) TO authenticated;