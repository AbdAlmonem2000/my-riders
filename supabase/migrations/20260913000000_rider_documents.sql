-- Per-rider compliance documents (Iqama photo, driving license, driver card,
-- operating card, vehicle registration, health certificate, personal photo).
-- Each document is one row per (rider, doc type) — uploading again for the
-- same type replaces it (upsert on the unique key) rather than duplicating.
-- Expiry status (ok / warning / expired) is computed from `expiry_date` on
-- read, never stored, so it's always correct with no background job.

-- A rider's operating area, needed to validate operating-card assignment
-- (a card can only be shared by riders in the same area).
ALTER TABLE public.riders ADD COLUMN area text;

CREATE TABLE public.rider_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rider_id UUID NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN (
    'iqama_photo', 'driving_license', 'driver_card', 'operating_card',
    'vehicle_registration', 'health_certificate', 'personal_photo'
  )),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  -- Only meaningful for doc_type = 'operating_card': the shared card number,
  -- used to enforce the 3-riders-per-card limit and same-area rule.
  card_number TEXT,
  expiry_date DATE NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rider_id, doc_type)
);
CREATE INDEX idx_rider_documents_rider ON public.rider_documents(rider_id);
CREATE INDEX idx_rider_documents_card ON public.rider_documents(company_id, card_number)
  WHERE doc_type = 'operating_card';
CREATE INDEX idx_rider_documents_expiry ON public.rider_documents(company_id, expiry_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rider_documents TO authenticated;
GRANT ALL ON public.rider_documents TO service_role;
ALTER TABLE public.rider_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own company rider_documents"
  ON public.rider_documents FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company(auth.uid())
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR company_id = public.get_user_company(auth.uid())
  );

-- Private bucket for the uploaded document files (mirrors reports/rosters).
INSERT INTO storage.buckets (id, name, public)
VALUES ('rider-documents', 'rider-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read rider document files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'rider-documents' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins upload rider document files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'rider-documents' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete rider document files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'rider-documents' AND public.has_role(auth.uid(), 'admin'));
