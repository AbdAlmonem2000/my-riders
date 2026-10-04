-- A plan-level switch for the Expiry Alerts page, alongside Operating Cards
-- — defaults to true so nothing changes for any existing company until the
-- super admin explicitly turns it off.
ALTER TABLE public.companies
  ADD COLUMN plan_expiry_alerts_access boolean NOT NULL DEFAULT true;
