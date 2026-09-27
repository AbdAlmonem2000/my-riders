-- URGENT FIX: the previous migration's new policy on user_roles
-- ("Admins manage own company staff roles") calls get_user_company(),
-- which itself queries user_roles — and since user_roles has RLS enabled,
-- that inner query re-triggers EVERY policy on user_roles, including that
-- same policy, and the pre-existing "Super admin manages user_roles" policy
-- (which has the same shape via is_super_admin()). Each of those recurses
-- into the other, and Postgres blows its stack ("stack depth limit
-- exceeded") — which is why every admin login started failing right after
-- that migration ran.
--
-- Fix: every helper function used inside these policies becomes
-- SECURITY DEFINER, so its internal query against user_roles bypasses RLS
-- entirely instead of re-triggering it — breaking the recursive cycle for
-- good. To keep the exact privacy property callers relied on under
-- SECURITY INVOKER (RLS silently hid every row but your own, so these
-- RPCs — despite taking an arbitrary _user_id — could in practice only
-- ever resolve YOUR OWN row), each function now explicitly requires
-- _user_id = auth.uid().

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND _user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin' AND company_id IS NULL
      AND _user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_company(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.user_roles
  WHERE user_id = _user_id AND role = 'admin' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_member_company(_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.user_roles
  WHERE user_id = _user_id AND role IN ('admin', 'user') AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_member_role(_user_id uuid)
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles
  WHERE user_id = _user_id AND company_id IS NOT NULL AND _user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_member_documents_access(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT documents_access FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_member_allowed_areas(_user_id uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT allowed_areas FROM public.user_roles
  WHERE user_id = _user_id AND role = 'user' AND company_id IS NOT NULL
    AND _user_id = auth.uid()
  LIMIT 1
$$;
