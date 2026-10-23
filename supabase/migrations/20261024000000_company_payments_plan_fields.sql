-- Split out from 20261023000000_company_payments.sql: that migration had
-- already run (creating company_payments) by the time payment_type and the
-- companies billing columns were added to it, so editing that same file
-- never re-applied — a migration already recorded as run doesn't get
-- re-run just because its file changed afterward. This one picks up
-- exactly what didn't make it in, and is safe to run even if parts of it
-- somehow already exist.
ALTER TABLE public.company_payments
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'cash'
    CHECK (payment_type IN ('cash', 'free'));

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payment_plan_type TEXT NOT NULL DEFAULT 'monthly'
    CHECK (payment_plan_type IN ('monthly', 'exempt', 'one_time')),
  ADD COLUMN IF NOT EXISTS monthly_fee NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS one_time_fee NUMERIC(10, 2);

-- A one-off "first payment" (e.g. an onboarding/setup fee) a "monthly"
-- company pays once, on top of — not instead of — its recurring
-- monthly_fee. Unlike one_time_fee (which belongs to a company that pays
-- in a single lump sum INSTEAD of monthly), this only ever applies to a
-- company that's otherwise billed normally every month.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS first_payment_fee NUMERIC(10, 2);
