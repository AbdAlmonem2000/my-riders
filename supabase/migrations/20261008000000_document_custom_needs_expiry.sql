-- A custom (admin-named) document type has no shared, pre-defined slot —
-- each one is created fresh per rider, so whether it needs an expiry date
-- at all (like a card) or never does (like a photo/form) can no longer be
-- decided by a hardcoded list of known type keys; it has to be a choice
-- made at the moment that particular document is first created, and
-- remembered on the row itself. Defaults to true (needs an expiry) so it
-- matches the exact behavior every custom document already had before this
-- column existed.
ALTER TABLE public.rider_documents
  ADD COLUMN needs_expiry boolean NOT NULL DEFAULT true;
