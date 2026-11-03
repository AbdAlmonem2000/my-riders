-- A staff account with riders_delete_access had no RLS path to actually
-- DELETE a rider row at all — only the admin-only "Admins manage own
-- company riders" FOR ALL policy covered it (keyed on get_user_company,
-- which never resolves for a role='user' account), and the one existing
-- staff policy from 20260920020000 only covers UPDATE (the soft-delete
-- path). deleteRider/bulkDeleteRiders already check riders_delete_access
-- in code (resolveRidersCompany's requireDelete) before ever reaching this
-- query — RLS was just silently returning 0 rows deleted, surfaced to the
-- admin as "لم يتم حذف المندوب — تأكد أنه يتبع شركتك" even though the
-- permission check had already passed. Same shape as the matching INSERT
-- policy added for riders_create_access.
CREATE POLICY "Full-access staff delete own company riders within allowed areas"
  ON public.riders FOR DELETE TO authenticated
  USING (
    public.get_member_role(auth.uid()) = 'user'
    AND public.get_member_riders_access(auth.uid()) = 'full'
    AND public.get_member_riders_delete_access(auth.uid())
    AND company_id = public.get_member_company(auth.uid())
    AND (
      public.get_member_allowed_areas(auth.uid()) IS NULL
      OR area = ANY(public.get_member_allowed_areas(auth.uid()))
    )
  );
