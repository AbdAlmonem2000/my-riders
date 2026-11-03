-- The rider's own photo-upload flow (rider.$iqama.tsx) runs through a
-- TanStack server function using the service role — riders have no
-- Supabase Auth session to carry RLS (same reason every other
-- rider-initiated write in this app goes through a SECURITY DEFINER RPC
-- instead, see rider_password_ok's existing anon/authenticated grant).
-- That function needs to call rider_password_ok via the service-role
-- client, which wasn't previously granted — every existing caller was the
-- rider's own browser (anon) or an already-authenticated admin session.
GRANT EXECUTE ON FUNCTION public.rider_password_ok(uuid, text) TO service_role;

-- The commercial registration format check wrongly required the number to
-- start with the two digits "10" specifically — a Saudi CR number is 10
-- digits starting with just "1" (the exact second digit varies by region),
-- so e.g. a number starting with "11" or "17" was being rejected even
-- though it's a perfectly valid CR number.
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_commercial_registration_format;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_commercial_registration_format
  CHECK (commercial_registration IS NULL OR commercial_registration ~ '^1[0-9]{9}$');
