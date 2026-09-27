-- Company admin -> riders notifications. An admin can broadcast a message to
-- every rider in their company (target_rider_id IS NULL) or target one
-- specific rider. Riders aren't authenticated users, so read tracking keys
-- on rider_id (not auth.users) and every rider-facing endpoint is a
-- SECURITY DEFINER RPC, same pattern as every other public rider endpoint.

CREATE TABLE public.rider_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_rider_id UUID REFERENCES public.riders(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rider_notifications_company ON public.rider_notifications(company_id);
CREATE INDEX idx_rider_notifications_target ON public.rider_notifications(target_rider_id);
GRANT SELECT, INSERT, DELETE ON public.rider_notifications TO authenticated;
GRANT ALL ON public.rider_notifications TO service_role;
ALTER TABLE public.rider_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own company rider_notifications" ON public.rider_notifications
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR company_id = public.get_user_company(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()) OR company_id = public.get_user_company(auth.uid()));

-- Per-rider read receipts. No grants to anon/authenticated — only reachable
-- through the SECURITY DEFINER RPCs below (mirrors riders/reports, which
-- also have no direct anon grants and are only exposed via RPCs).
CREATE TABLE public.rider_notification_reads (
  notification_id UUID NOT NULL REFERENCES public.rider_notifications(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, rider_id)
);
GRANT ALL ON public.rider_notification_reads TO service_role;
ALTER TABLE public.rider_notification_reads ENABLE ROW LEVEL SECURITY;

-- Public: a rider's own notifications (targeted + their company's
-- broadcasts), each flagged with whether they've read it yet.
CREATE OR REPLACE FUNCTION public.list_rider_notifications(_rider_id uuid)
RETURNS TABLE (
  notification_id uuid,
  title text,
  body text,
  created_at timestamptz,
  is_read boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT n.id, n.title, n.body, n.created_at,
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

-- Public: mark notifications as read for a rider. The id list is untrusted
-- input, so only ids actually visible to that rider (per the same rules as
-- list_rider_notifications above) are ever inserted.
CREATE OR REPLACE FUNCTION public.mark_rider_notifications_read(_rider_id uuid, _notification_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.rider_notification_reads (notification_id, rider_id)
  SELECT n.id, _rider_id
  FROM public.rider_notifications n
  JOIN public.riders r ON r.id = _rider_id
  WHERE n.id = ANY(_notification_ids)
    AND n.company_id = r.company_id
    AND (n.target_rider_id IS NULL OR n.target_rider_id = _rider_id)
  ON CONFLICT (notification_id, rider_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_rider_notifications_read(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_rider_notifications_read(uuid, uuid[]) TO anon, authenticated;

-- Company admin: list what they've sent, with how many riders have read it
-- (out of everyone it was sent to — 1 for a targeted message, every rider in
-- the company for a broadcast).
CREATE OR REPLACE FUNCTION public.admin_list_rider_notifications()
RETURNS TABLE (
  notification_id uuid,
  target_rider_id uuid,
  target_rider_name text,
  title text,
  body text,
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
  SELECT n.id, n.target_rider_id, rd.rider_name, n.title, n.body, n.created_at,
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
