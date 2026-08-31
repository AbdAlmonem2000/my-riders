-- Track each Excel/CSV sheet uploaded into a month's report as its own row,
-- so a company admin can see "2 sheets this month" and download or delete one
-- of them individually.
--
-- rider_reports.data stays the merged blob; column_sources records which
-- sheet each column came from, so deleting a sheet cleanly strips just its
-- columns (and drops a rider whose row ends up empty).

CREATE TABLE public.report_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT,
  headers JSONB NOT NULL DEFAULT '[]'::jsonb,
  rider_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_sheets_report ON public.report_sheets(report_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_sheets TO authenticated;
GRANT ALL ON public.report_sheets TO service_role;
ALTER TABLE public.report_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own company report sheets" ON public.report_sheets
FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (company_id = public.get_user_company(auth.uid()) AND public.is_company_active(company_id))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (company_id = public.get_user_company(auth.uid()) AND public.is_company_active(company_id))
);

ALTER TABLE public.rider_reports ADD COLUMN column_sources JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill: every existing report becomes one sheet that owns its stored file.
INSERT INTO public.report_sheets (report_id, company_id, file_name, storage_path, headers, rider_count, created_at)
SELECT r.id, r.company_id, r.file_name, r.storage_path,
       COALESCE((SELECT rr.columns FROM public.rider_reports rr WHERE rr.report_id = r.id LIMIT 1), '[]'::jsonb),
       r.rider_count, r.created_at
FROM public.reports r;

-- Every column of every existing rider_reports row belongs to that one sheet.
UPDATE public.rider_reports rr
SET column_sources = COALESCE(
  (
    SELECT jsonb_object_agg(k, sh.id::text)
    FROM public.report_sheets sh, jsonb_object_keys(rr.data) AS k
    WHERE sh.report_id = rr.report_id
  ),
  '{}'::jsonb
);
