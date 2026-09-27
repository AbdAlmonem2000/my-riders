-- Adds a second, independent "operating card" slot (doc_type
-- 'operating_card_extra') with the exact same rule as the original
-- operating_card slot: max 3 riders per card number, all in the same area.
-- That rule is enforced in documents.functions.ts, not here. doc_type has no
-- DB-level CHECK any more (dropped in 20260914010000_rider_documents_custom.sql
-- to allow custom document types), so the new value needs no schema change —
-- this just widens the lookup index that previously only covered
-- 'operating_card' so the extra slot's card-assignment checks stay indexed.

DROP INDEX IF EXISTS idx_rider_documents_card;
CREATE INDEX idx_rider_documents_card ON public.rider_documents(company_id, doc_type, card_number)
  WHERE doc_type IN ('operating_card', 'operating_card_extra');
