-- Plan-level switches letting the super admin show/hide the DAILY variant
-- of Reports and Overview per company, independent of the base
-- plan_reports_access/plan_overview_access toggles that still gate the
-- whole Reports/Overview nav group (including the monthly variant).
-- Default true so nothing changes for any existing company until the super
-- admin explicitly turns one off.
ALTER TABLE public.companies
  ADD COLUMN plan_reports_daily_access boolean NOT NULL DEFAULT true;

ALTER TABLE public.companies
  ADD COLUMN plan_overview_daily_access boolean NOT NULL DEFAULT true;
