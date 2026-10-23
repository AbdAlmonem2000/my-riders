-- Adds "transfer" (bank transfer / حوالة) as a third option alongside cash
-- and free — a company can pay in cash, by transfer, or have the month
-- marked free, and these are visually and financially distinct (transfer
-- and cash are both real money in; free isn't).
ALTER TABLE public.company_payments
  DROP CONSTRAINT IF EXISTS company_payments_payment_type_check;
ALTER TABLE public.company_payments
  ADD CONSTRAINT company_payments_payment_type_check
  CHECK (payment_type IN ('cash', 'transfer', 'free'));
