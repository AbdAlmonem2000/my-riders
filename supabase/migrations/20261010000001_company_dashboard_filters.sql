-- Shared, company-wide dashboard column filters (metric columns + each
-- breakdown chart's column), one JSON blob per company so the daily and
-- monthly dashboards can each keep their own independent picks under it:
-- { "daily": { "metricColumns": string[], "donutColumn": string|null,
-- "barColumn": string|null }, "monthly": { ... same shape ... } }.
-- Replaces the old per-browser localStorage version of this setting —
-- every user in the company now sees the same picks, on any device, and
-- only the real admin (or a staff member granted
-- dashboard_filters_edit_access) can change them.

ALTER TABLE public.companies
  ADD COLUMN dashboard_filters jsonb NOT NULL DEFAULT '{}'::jsonb;
