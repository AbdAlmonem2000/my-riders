-- A fourth page the super admin can switch off per company, alongside
-- Notifications/Users/Company Profile — Operating Cards wasn't plan-gated
-- at all before this (only the per-staff personal permission existed), so a
-- company admin could always reach it regardless of plan. Defaults to true
-- so nothing changes for any existing company until the super admin
-- explicitly turns it off.
ALTER TABLE public.companies
  ADD COLUMN plan_operating_cards_access boolean NOT NULL DEFAULT true;
