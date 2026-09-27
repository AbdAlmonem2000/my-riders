-- Company self-service profile: an official stamp/signature image, and a
-- free-form list of official documents (commercial register, tax
-- certificate, etc.), each with its own expiry date so the admin can be
-- warned before something lapses — mirrors the rider-documents feature,
-- but company-scoped and every entry is admin-named (no fixed types).

ALTER TABLE public.companies ADD COLUMN stamp_url text;

CREATE TABLE public.company_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_documents_company ON public.company_documents(company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_documents TO authenticated;
GRANT ALL ON public.company_documents TO service_role;
ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own company documents" ON public.company_documents
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR company_id = public.get_user_company(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()) OR company_id = public.get_user_company(auth.uid()));

-- Private bucket for the official document files (mirrors rider-documents).
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-documents', 'company-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read company document files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'company-documents' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload company document files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'company-documents' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete company document files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'company-documents' AND public.has_role(auth.uid(), 'admin'));

-- Public bucket for the stamp/signature image — same visibility model as the
-- logo (mirrors company-logos: public read, any admin can manage).
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-stamps', 'company-stamps', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view company stamps" ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'company-stamps');

CREATE POLICY "Admins manage company stamps" ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'company-stamps' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'company-stamps' AND public.has_role(auth.uid(), 'admin'));
