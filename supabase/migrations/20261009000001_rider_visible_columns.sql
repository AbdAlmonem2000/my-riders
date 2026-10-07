-- The company-chosen list of report columns a rider is allowed to see on
-- their own lookup page. NULL (the default) means "no restriction — show
-- every column", so nothing changes for any existing company until the
-- admin sets one from the new Company Profile section.
ALTER TABLE public.companies
  ADD COLUMN rider_visible_columns jsonb;
