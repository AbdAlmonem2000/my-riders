-- A letter no longer has to be about a rider at all (a company may need one
-- for something else entirely), and saving a letter is now separate from
-- sending it to a rider: the admin reviews it, presses save, and only then
-- decides whether to send it, download it, or print it.

ALTER TABLE public.company_letters ALTER COLUMN rider_id DROP NOT NULL;
ALTER TABLE public.company_letters ADD COLUMN is_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.company_letters ADD COLUMN sent_at timestamptz;

-- A letter only shows up for a rider once it has actually been sent, not
-- merely saved as a draft.
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
  company_signature_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT l.id, l.title, l.body, l.letter_date, l.include_stamp, l.include_signature, l.created_at,
         r.rider_name, c.name, c.logo_url, c.stamp_url, c.signature_url
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
