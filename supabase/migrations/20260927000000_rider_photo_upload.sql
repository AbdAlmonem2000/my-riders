-- Lets a company admin (or full-access riders staff) upload a rider's photo
-- straight from their device instead of only pasting an external link.
-- Public bucket: rider photos are already shown with no access control via
-- the plain photo_url field (including on the public rider lookup page), so
-- this doesn't relax anything — it just gives them somewhere of our own to
-- live instead of always being someone else's external link.

INSERT INTO storage.buckets (id, name, public)
VALUES ('rider-photos', 'rider-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view rider photos" ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'rider-photos');

CREATE POLICY "Admins upload rider photos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'rider-photos' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete rider photos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'rider-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Full-access staff upload rider photos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'rider-photos'
  AND public.get_member_role(auth.uid()) = 'user'
  AND public.get_member_riders_access(auth.uid()) = 'full'
);
CREATE POLICY "Full-access staff delete rider photos" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'rider-photos'
  AND public.get_member_role(auth.uid()) = 'user'
  AND public.get_member_riders_access(auth.uid()) = 'full'
);

-- Same company-plan ceiling already applied to rider-documents: a staff
-- account's personal riders_access can't exceed what the company's own
-- plan allows.
CREATE POLICY "Company plan gates staff rider photo writes" ON storage.objects
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  bucket_id != 'rider-photos'
  OR public.is_super_admin(auth.uid())
  OR public.get_member_role(auth.uid()) != 'user'
  OR public.get_company_plan_riders_access(public.get_member_company(auth.uid())) = 'full'
);
CREATE POLICY "Company plan gates staff rider photo deletes" ON storage.objects
AS RESTRICTIVE FOR DELETE TO authenticated
USING (
  bucket_id != 'rider-photos'
  OR public.is_super_admin(auth.uid())
  OR public.get_member_role(auth.uid()) != 'user'
  OR public.get_company_plan_riders_access(public.get_member_company(auth.uid())) = 'full'
);
