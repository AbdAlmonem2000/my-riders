-- Split rider notifications into two kinds: a regular notification and a
-- more serious "warning" (إنذار) — the rider page shows each under its own
-- indicator so a warning never gets lost among routine notices.

ALTER TABLE public.rider_notifications
  ADD COLUMN kind text NOT NULL DEFAULT 'notification'
  CHECK (kind IN ('notification', 'warning'));

DROP FUNCTION IF EXISTS public.list_rider_notifications(uuid);
CREATE OR REPLACE FUNCTION public.list_rider_notifications(_rider_id uuid)
RETURNS TABLE (
  notification_id uuid,
  title text,
  body text,
  kind text,
  created_at timestamptz,
  is_read boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.title, n.body, n.kind, n.created_at,
         EXISTS (
           SELECT 1 FROM public.rider_notification_reads rd
           WHERE rd.notification_id = n.id AND rd.rider_id = _rider_id
         )
  FROM public.rider_notifications n
  JOIN public.riders r ON r.id = _rider_id
  JOIN public.companies c ON c.id = r.company_id
  WHERE n.company_id = r.company_id
    AND (n.target_rider_id IS NULL OR n.target_rider_id = _rider_id)
    AND NOT r.is_blocked
    AND NOT c.is_suspended
  ORDER BY n.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.list_rider_notifications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_notifications(uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.admin_list_rider_notifications();
CREATE OR REPLACE FUNCTION public.admin_list_rider_notifications()
RETURNS TABLE (
  notification_id uuid,
  target_rider_id uuid,
  target_rider_name text,
  title text,
  body text,
  kind text,
  created_at timestamptz,
  read_count bigint,
  target_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  cid := public.get_user_company(auth.uid());
  IF cid IS NULL THEN
    RAISE EXCEPTION 'هذا الحساب غير مرتبط بشركة';
  END IF;
  RETURN QUERY
  SELECT n.id, n.target_rider_id, rd.rider_name, n.title, n.body, n.kind, n.created_at,
    (SELECT count(*) FROM public.rider_notification_reads x WHERE x.notification_id = n.id),
    CASE WHEN n.target_rider_id IS NOT NULL THEN 1::bigint
         ELSE (SELECT count(*) FROM public.riders r2 WHERE r2.company_id = n.company_id)
    END
  FROM public.rider_notifications n
  LEFT JOIN public.riders rd ON rd.id = n.target_rider_id
  WHERE n.company_id = cid
  ORDER BY n.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_rider_notifications() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_rider_notifications() TO authenticated;
