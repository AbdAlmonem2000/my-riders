-- Optional per-rider password. A rider looks up with their Iqama/ID, and if a
-- password is set they must also enter it to see any report. The rider can set
-- their own the first time (no current password needed) and change it later;
-- the company admin can set / change / clear it from their dashboard.
--
-- Stored as a bcrypt hash via pgcrypto (same as auth user passwords). The hash
-- is never returned to the browser — only a boolean "has a password".

ALTER TABLE public.riders ADD COLUMN password_hash text;

-- ── lookup now also reports whether a password is required ──────────────────
DROP FUNCTION IF EXISTS public.lookup_riders_by_iqama(text);
CREATE OR REPLACE FUNCTION public.lookup_riders_by_iqama(_iqama text)
RETURNS TABLE (
  rider_id uuid,
  rider_name text,
  rider_photo_url text,
  rider_extra jsonb,
  rider_is_blocked boolean,
  rider_has_password boolean,
  company_id uuid,
  company_name text,
  company_logo_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rider_name, r.photo_url, r.extra, r.is_blocked,
         (r.password_hash IS NOT NULL),
         r.company_id, c.name, c.logo_url
  FROM public.riders r
  JOIN public.companies c ON c.id = r.company_id
  WHERE (r.iqama_number = _iqama OR r.id_number = _iqama)
    AND NOT c.is_suspended
    AND EXISTS (SELECT 1 FROM public.rider_reports rr WHERE rr.rider_id = r.id)
$$;
REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon, authenticated;

-- ── password check helper: true when no password is set, or it matches ─────
CREATE OR REPLACE FUNCTION public.rider_password_ok(_rider_id uuid, _password text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT CASE
    WHEN (SELECT password_hash FROM public.riders WHERE id = _rider_id) IS NULL THEN true
    WHEN coalesce(_password, '') = '' THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.riders
      WHERE id = _rider_id
        AND password_hash = extensions.crypt(_password, password_hash)
    )
  END
$$;
REVOKE ALL ON FUNCTION public.rider_password_ok(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rider_password_ok(uuid, text) TO anon, authenticated;

-- ── the two report RPCs gain an optional password that must check out ──────
DROP FUNCTION IF EXISTS public.list_rider_reports(uuid);
CREATE OR REPLACE FUNCTION public.list_rider_reports(_rider_id uuid, _password text DEFAULT NULL)
RETURNS TABLE (report_id uuid, month smallint, year smallint, file_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rep.id, rep.month, rep.year, rep.file_name
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  JOIN public.riders rd ON rd.id = rr.rider_id
  WHERE rr.rider_id = _rider_id
    AND NOT rd.is_blocked
    AND public.is_company_active(rep.company_id)
    AND public.rider_password_ok(_rider_id, _password)
  ORDER BY rep.year DESC, rep.month DESC
$$;
REVOKE ALL ON FUNCTION public.list_rider_reports(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_reports(uuid, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_rider_report(uuid, uuid);
CREATE OR REPLACE FUNCTION public.get_rider_report(_rider_id uuid, _report_id uuid, _password text DEFAULT NULL)
RETURNS TABLE (data jsonb, columns jsonb, month smallint, year smallint, file_name text, note text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rr.data, rr.columns, rep.month, rep.year, rep.file_name, rep.note
  FROM public.rider_reports rr
  JOIN public.reports rep ON rep.id = rr.report_id
  JOIN public.riders rd ON rd.id = rr.rider_id
  WHERE rr.rider_id = _rider_id AND rr.report_id = _report_id
    AND NOT rd.is_blocked
    AND public.is_company_active(rep.company_id)
    AND public.rider_password_ok(_rider_id, _password)
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_rider_report(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rider_report(uuid, uuid, text) TO anon, authenticated;

-- ── rider sets / changes their own password ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_rider_password(
  _rider_id uuid,
  _new_password text,
  _current_password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE cur text;
BEGIN
  IF length(coalesce(_new_password, '')) < 4 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تكون 4 أحرف على الأقل';
  END IF;
  SELECT password_hash INTO cur FROM public.riders WHERE id = _rider_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;
  IF cur IS NOT NULL AND (
    coalesce(_current_password, '') = '' OR cur <> extensions.crypt(_current_password, cur)
  ) THEN
    RAISE EXCEPTION 'كلمة المرور الحالية غير صحيحة';
  END IF;
  UPDATE public.riders
  SET password_hash = extensions.crypt(_new_password, extensions.gen_salt('bf'))
  WHERE id = _rider_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_rider_password(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_rider_password(uuid, text, text) TO anon, authenticated;

-- ── company admin sets / clears a rider's password ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_rider_password(_rider_id uuid, _password text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE cid uuid;
BEGIN
  SELECT company_id INTO cid FROM public.riders WHERE id = _rider_id;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR cid = public.get_user_company(auth.uid())) THEN
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
REVOKE ALL ON FUNCTION public.admin_set_rider_password(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_rider_password(uuid, text) TO authenticated;
