-- Keep the raw rider-directory sheet so a company admin can re-download it,
-- and can wipe the directory (file + the riders it created) in one action.

ALTER TABLE public.companies
  ADD COLUMN roster_path text,
  ADD COLUMN roster_file_name text,
  ADD COLUMN roster_uploaded_at timestamptz;

-- Private bucket for the uploaded directory sheets (mirrors the reports bucket).
INSERT INTO storage.buckets (id, name, public)
VALUES ('rosters', 'rosters', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read roster files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'rosters' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload roster files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'rosters' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete roster files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'rosters' AND public.has_role(auth.uid(), 'admin'));
