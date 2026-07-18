-- Lets the super admin remove a sent announcement at any time.
GRANT DELETE ON public.announcements TO authenticated;

CREATE POLICY "Super admin deletes announcements" ON public.announcements
FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));
