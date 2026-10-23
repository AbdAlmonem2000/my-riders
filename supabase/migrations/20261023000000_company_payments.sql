-- Lets the super admin track, per company and month, whether that
-- company's subscription payment came in — a plain checkmark, with an
-- optional receipt/transfer-screenshot attached. A row existing means
-- "paid"; unmarking a month deletes its row. Super-admin only — this has
-- nothing to do with what a company's own admin/staff can see, unlike
-- rider_documents and friends which a company can also read for itself.
CREATE TABLE public.company_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  -- cash: an actual payment came in that month. free: the month was given
  -- for free (a complimentary month), still worth recording so it isn't
  -- confused with a real payment later.
  payment_type TEXT NOT NULL DEFAULT 'cash' CHECK (payment_type IN ('cash', 'free')),
  storage_path TEXT,
  file_name TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, year, month)
);
CREATE INDEX idx_company_payments_company ON public.company_payments(company_id);

-- A company's overall billing arrangement — set once on the company, not
-- per month. "monthly" is the normal case the month-by-month grid above
-- tracks; "exempt" (never pays) and "one_time" (paid a single lump sum,
-- recorded in one_time_fee) opt a company out of that grid entirely, since
-- neither is a recurring monthly thing to check off.
ALTER TABLE public.companies
  ADD COLUMN payment_plan_type TEXT NOT NULL DEFAULT 'monthly'
    CHECK (payment_plan_type IN ('monthly', 'exempt', 'one_time')),
  ADD COLUMN monthly_fee NUMERIC(10, 2),
  ADD COLUMN one_time_fee NUMERIC(10, 2);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_payments TO authenticated;
GRANT ALL ON public.company_payments TO service_role;
ALTER TABLE public.company_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages company_payments"
  ON public.company_payments FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Private bucket for the uploaded receipt/transfer-screenshot files.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Super admin reads payment receipt files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-receipts' AND public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin uploads payment receipt files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-receipts' AND public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin deletes payment receipt files" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payment-receipts' AND public.is_super_admin(auth.uid()));
