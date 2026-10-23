-- A company's first payment (onboarding fee) and one-time lump sum both
-- happen in exactly one specific month — they were wrongly showing up as a
-- constant total on every month instead of only the month they actually
-- happened in. These two columns record which month/year that was, so the
-- dashboard and payments grid can scope the amount to that one month
-- instead of repeating it everywhere.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS first_payment_month INT CHECK (first_payment_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS first_payment_year INT,
  ADD COLUMN IF NOT EXISTS one_time_payment_month INT
    CHECK (one_time_payment_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS one_time_payment_year INT;
