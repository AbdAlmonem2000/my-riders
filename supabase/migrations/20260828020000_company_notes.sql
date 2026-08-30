-- Private per-company notes for the super admin (a place to jot "pays late",
-- "contact: Ahmed", etc. next to each company they created).
--
-- Kept in its own table rather than a companies column on purpose: companies
-- has a permissive "anyone can read" SELECT policy for the public rider page,
-- so a notes column there would be world-readable. This table is locked to
-- the super admin only.

CREATE TABLE public.company_notes (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  notes text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_notes TO authenticated;
GRANT ALL ON public.company_notes TO service_role;
ALTER TABLE public.company_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin manages company notes" ON public.company_notes
FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));
