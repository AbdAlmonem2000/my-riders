-- Phone push notifications for riders. A rider has no login, so a device
-- subscribes anonymously through register_rider_push (which checks the
-- rider's lookup password when one is set — the same gate that protects
-- their reports). Sending happens server-side with the service role.
--
-- The table has RLS enabled and NO policies on purpose: nothing can read the
-- push endpoints/keys through the API. Only the SECURITY DEFINER functions
-- below and the service role touch it.

CREATE TABLE public.rider_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rider_push_subscriptions_rider ON public.rider_push_subscriptions(rider_id);
ALTER TABLE public.rider_push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.rider_push_subscriptions TO service_role;

-- A device re-registering (or a shared phone switching rider) just moves the
-- endpoint to the new rider. Each rider keeps at most their 10 newest
-- devices so the table can't be flooded through the anonymous endpoint.
CREATE OR REPLACE FUNCTION public.register_rider_push(
  _rider_id uuid,
  _endpoint text,
  _p256dh text,
  _auth text,
  _password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _endpoint IS NULL OR _endpoint !~ '^https://[^/]+/' OR length(_endpoint) > 2048
     OR coalesce(_p256dh, '') = '' OR coalesce(_auth, '') = '' THEN
    RAISE EXCEPTION 'بيانات الاشتراك غير صحيحة';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.riders r
    JOIN public.companies c ON c.id = r.company_id
    WHERE r.id = _rider_id AND NOT r.is_blocked AND NOT c.is_suspended
  ) THEN
    RAISE EXCEPTION 'المندوب غير موجود';
  END IF;

  IF NOT public.rider_password_ok(_rider_id, _password) THEN
    RAISE EXCEPTION 'كلمة المرور غير صحيحة';
  END IF;

  INSERT INTO public.rider_push_subscriptions (rider_id, endpoint, p256dh, auth)
  VALUES (_rider_id, _endpoint, _p256dh, _auth)
  ON CONFLICT (endpoint) DO UPDATE
    SET rider_id = EXCLUDED.rider_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;

  DELETE FROM public.rider_push_subscriptions
  WHERE rider_id = _rider_id
    AND id NOT IN (
      SELECT id FROM public.rider_push_subscriptions
      WHERE rider_id = _rider_id
      ORDER BY created_at DESC
      LIMIT 10
    );
END;
$$;
REVOKE ALL ON FUNCTION public.register_rider_push(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_rider_push(uuid, text, text, text, text) TO anon, authenticated;

-- The push endpoint is an unguessable per-device URL, so knowing it is
-- enough proof of ownership to remove it.
CREATE OR REPLACE FUNCTION public.unregister_rider_push(_endpoint text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.rider_push_subscriptions WHERE endpoint = _endpoint
$$;
REVOKE ALL ON FUNCTION public.unregister_rider_push(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unregister_rider_push(text) TO anon, authenticated;

-- Which devices to notify, one page at a time (keyset-paginated by id so
-- deleting dead subscriptions between pages can't skip anyone). Optional
-- filters: a single rider, or only riders present in one report. Service
-- role only — it returns the raw endpoints and keys.
CREATE OR REPLACE FUNCTION public.list_push_targets(
  _company_id uuid,
  _rider_id uuid DEFAULT NULL,
  _report_id uuid DEFAULT NULL,
  _after uuid DEFAULT NULL,
  _limit integer DEFAULT 25
)
RETURNS TABLE (
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_secret text,
  rider_id uuid,
  rider_key text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.endpoint, s.p256dh, s.auth, s.rider_id,
         coalesce(r.iqama_number, r.id_number)
  FROM public.rider_push_subscriptions s
  JOIN public.riders r ON r.id = s.rider_id
  WHERE r.company_id = _company_id
    AND NOT r.is_blocked
    AND (_rider_id IS NULL OR s.rider_id = _rider_id)
    AND (_after IS NULL OR s.id > _after)
    AND (
      _report_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.rider_reports rr
        WHERE rr.report_id = _report_id AND rr.rider_id = s.rider_id
      )
    )
  ORDER BY s.id
  LIMIT least(greatest(_limit, 1), 100)
$$;
REVOKE ALL ON FUNCTION public.list_push_targets(uuid, uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_push_targets(uuid, uuid, uuid, uuid, integer) TO service_role;
