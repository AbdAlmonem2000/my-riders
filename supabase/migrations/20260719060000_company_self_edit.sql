-- Lets a company admin edit their own company's name and logo (previously
-- only the super admin could).
CREATE POLICY "Company admins update own company" ON public.companies
FOR UPDATE TO authenticated
USING (id = public.get_user_company(auth.uid()))
WITH CHECK (id = public.get_user_company(auth.uid()));

-- Logo files aren't tagged with a company_id in storage, so the real
-- authorization boundary is the companies.logo_url update above (checked
-- server-side per company). Broaden storage access from super-admin-only
-- to any admin so a company admin can actually upload/replace the file.
DROP POLICY IF EXISTS "Super admin manages company logos" ON storage.objects;

CREATE POLICY "Admins manage company logos" ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'company-logos' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'company-logos' AND public.has_role(auth.uid(), 'admin'));
