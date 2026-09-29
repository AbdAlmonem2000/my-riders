-- A configurable lead time for the "document about to expire" in-app alert,
-- separate from the fixed 30-day visual warning badge on each document row.
-- The company sets a default for everyone; any individual user (admin or
-- staff) may override it for themselves. NULL on user_roles means "use the
-- company's default" — never a hardcoded number in application code.

ALTER TABLE public.companies
  ADD COLUMN expiry_notify_days integer NOT NULL DEFAULT 30;

ALTER TABLE public.user_roles
  ADD COLUMN expiry_notify_days integer NULL;

-- Self-service, same reasoning as update_my_display_name: the row is theirs
-- (auth.uid() = user_id), so no company/role check is needed. Passing NULL
-- clears a personal override back to the company default.
CREATE OR REPLACE FUNCTION public.update_my_expiry_notify_days(_days integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _days IS NOT NULL AND (_days < 1 OR _days > 365) THEN
    RAISE EXCEPTION 'عدد الأيام لازم يكون بين 1 و 365';
  END IF;
  UPDATE public.user_roles SET expiry_notify_days = _days WHERE user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الحساب غير مرتبط بأي صلاحية';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_my_expiry_notify_days(integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_expiry_notify_days(integer) TO authenticated;
