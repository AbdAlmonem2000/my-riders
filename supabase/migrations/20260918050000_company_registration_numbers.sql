-- Two official registration numbers a company can optionally record, shown
-- on official letters next to the logo/name when present:
--   unified_number: the Saudi "الرقم الموحد" — 10 digits, starts with 7.
--   commercial_registration: the "رقم السجل التجاري" — 10 digits, starts
--   with 10.
-- Both are validated at the same shape server-side (see accounts.functions),
-- these checks are just a second line of defense against bad data getting
-- in directly.

ALTER TABLE public.companies
  ADD COLUMN unified_number text,
  ADD COLUMN commercial_registration text;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_unified_number_format
    CHECK (unified_number IS NULL OR unified_number ~ '^7[0-9]{9}$'),
  ADD CONSTRAINT companies_commercial_registration_format
    CHECK (commercial_registration IS NULL OR commercial_registration ~ '^10[0-9]{8}$');

-- The rider letter RPC needs to hand these two numbers over too, so a sent
-- letter can show them on the rider's page exactly as on the admin's.
DROP FUNCTION IF EXISTS public.list_rider_letters(uuid);
CREATE OR REPLACE FUNCTION public.list_rider_letters(_rider_id uuid)
RETURNS TABLE (
  letter_id uuid,
  title text,
  body text,
  letter_date date,
  include_stamp boolean,
  include_signature boolean,
  created_at timestamptz,
  rider_name text,
  company_name text,
  company_logo_url text,
  company_stamp_url text,
  company_signature_url text,
  company_unified_number text,
  company_commercial_registration text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.title, l.body, l.letter_date, l.include_stamp, l.include_signature, l.created_at,
         r.rider_name, c.name, c.logo_url, c.stamp_url, c.signature_url,
         c.unified_number, c.commercial_registration
  FROM public.company_letters l
  JOIN public.riders r ON r.id = l.rider_id
  JOIN public.companies c ON c.id = l.company_id
  WHERE l.rider_id = _rider_id
    AND l.is_sent
    AND NOT r.is_blocked
    AND NOT c.is_suspended
  ORDER BY l.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.list_rider_letters(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_letters(uuid) TO anon, authenticated;
