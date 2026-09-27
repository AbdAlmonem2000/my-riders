-- Official letters: a company admin writes a free-form letter addressed to
-- one rider, picks a date to show on it (independent of when it was
-- actually saved), and chooses whether the company stamp and/or signature
-- appear on it. Nothing is rendered to a file here — the letter is stored as
-- plain data and rendered live (by the admin and by the rider) from the
-- company's current logo/stamp/signature, so it always reflects the latest
-- assets and needs no separate PDF-generation step or storage bucket.

CREATE TABLE public.company_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  letter_date DATE NOT NULL,
  include_stamp BOOLEAN NOT NULL DEFAULT false,
  include_signature BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_letters_company ON public.company_letters(company_id);
CREATE INDEX idx_company_letters_rider ON public.company_letters(rider_id);
GRANT SELECT, INSERT, DELETE ON public.company_letters TO authenticated;
GRANT ALL ON public.company_letters TO service_role;
ALTER TABLE public.company_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own company letters" ON public.company_letters
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR company_id = public.get_user_company(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()) OR company_id = public.get_user_company(auth.uid()));

-- Public: a rider's own letters, with everything needed to render the
-- letterhead (company name/logo/stamp/signature + the rider's own name).
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
    AND NOT r.is_blocked
    AND NOT c.is_suspended
  ORDER BY l.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.list_rider_letters(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_rider_letters(uuid) TO anon, authenticated;
