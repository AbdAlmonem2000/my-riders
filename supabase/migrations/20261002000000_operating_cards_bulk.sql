-- A card number can now be assigned to a rider (via a bulk Excel import —
-- see bulkAssignOperatingCards) before the physical card's file exists: the
-- admin uploads the actual PDF/photo once per card later, from the
-- Operating Cards page, rather than once per rider sharing it. So a
-- rider_documents row no longer requires a file from the moment it's
-- created.
ALTER TABLE public.rider_documents ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE public.rider_documents ALTER COLUMN file_name DROP NOT NULL;

-- The vehicle's plate number — only meaningful for the two operating-card
-- slots, same as card_number, and edited at the card-group level (every
-- rider sharing a card number shares its plate number too).
ALTER TABLE public.rider_documents ADD COLUMN plate_number text;
