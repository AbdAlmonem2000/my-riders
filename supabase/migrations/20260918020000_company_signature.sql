-- Signature is a separate image from the stamp (a company may want either,
-- both, or neither on a document) — split into its own column, reusing the
-- same public company-stamps bucket (no new bucket needed).

ALTER TABLE public.companies ADD COLUMN signature_url text;
