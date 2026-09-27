-- Three more pages the super admin can switch off per company: Notifications
-- & Announcements, Users (staff management), and Company Profile. These were
-- always available to a real company admin regardless of plan — default to
-- true so nothing changes for any existing company until the super admin
-- explicitly turns one off.
ALTER TABLE public.companies
  ADD COLUMN plan_notifications_access boolean NOT NULL DEFAULT true,
  ADD COLUMN plan_users_access boolean NOT NULL DEFAULT true,
  ADD COLUMN plan_company_profile_access boolean NOT NULL DEFAULT true;
