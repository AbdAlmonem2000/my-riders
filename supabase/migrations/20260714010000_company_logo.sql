-- Company logos: shown next to the company name on the public rider search
-- results, and uploaded by the super admin when creating/editing a company.

ALTER TABLE public.companies ADD COLUMN logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public bucket: logos are meant to be visible on the public rider page, so
-- anyone can read. Only the super admin can upload/replace/delete.
CREATE POLICY "Anyone can view company logos" ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'company-logos');

CREATE POLICY "Super admin manages company logos" ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'company-logos' AND public.is_super_admin(auth.uid()))
WITH CHECK (bucket_id = 'company-logos' AND public.is_super_admin(auth.uid()));

-- lookup_riders_by_iqama must return logo_url too, but changing a TABLE
-- return's column list requires dropping the function first.
DROP FUNCTION IF EXISTS public.lookup_riders_by_iqama(text);

CREATE OR REPLACE FUNCTION public.lookup_riders_by_iqama(_iqama text)
RETURNS TABLE (
  rider_id uuid,
  rider_name text,
  company_id uuid,
  company_name text,
  company_logo_url text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rider_name, r.company_id, c.name, c.logo_url
  FROM public.riders r
  JOIN public.companies c ON c.id = r.company_id
  WHERE r.iqama_number = _iqama
$$;

REVOKE ALL ON FUNCTION public.lookup_riders_by_iqama(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_riders_by_iqama(text) TO anon, authenticated;
