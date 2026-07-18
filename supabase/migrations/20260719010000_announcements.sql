-- Platform-wide announcements: the super admin broadcasts a message (new
-- feature, maintenance notice, etc.) to every company admin at once. Each
-- admin sees an unread indicator (bell) until they open the notifications
-- panel, which marks everything currently visible as read for that user.

CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read announcements" ON public.announcements
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Super admin creates announcements" ON public.announcements
FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));

-- Per-user read receipts, so the bell's unread state is specific to the
-- signed-in admin rather than shared across a company's accounts.
CREATE TABLE public.announcement_reads (
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);
GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own read receipts" ON public.announcement_reads
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
