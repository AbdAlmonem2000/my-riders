import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: announcements, error } = await supabase
      .from("announcements")
      .select("id, title, body, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: reads } = await supabase
      .from("announcement_reads")
      .select("announcement_id")
      .eq("user_id", userId);
    const readIds = new Set((reads ?? []).map((r: { announcement_id: string }) => r.announcement_id));

    const list = (announcements ?? []).map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      createdAt: a.created_at,
      isRead: readIds.has(a.id),
    }));
    return { announcements: list, unreadCount: list.filter((a) => !a.isRead).length };
  });

export const markAnnouncementsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.ids.length === 0) return { ok: true };
    const { supabase, userId } = context;
    const rows = data.ids.map((id) => ({ announcement_id: id, user_id: userId }));
    const { error } = await supabase
      .from("announcement_reads")
      .upsert(rows, { onConflict: "announcement_id,user_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
    if (!isSuper) throw new Error("غير مصرح: هذه الميزة للسوبر أدمن فقط");

    // Supabase applies RLS to the DELETE's WHERE clause rather than
    // rejecting it outright, so a missing/misconfigured delete policy
    // silently matches zero rows instead of erroring — .select() lets us
    // tell "deleted" apart from "policy blocked it" and report the latter.
    const { data: deleted, error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error(
        "لم يتم حذف الإشعار — تأكد من تنفيذ تحديث صلاحيات الحذف في قاعدة البيانات (migration الخاص بالحذف)",
      );
    }
    return { ok: true };
  });

export const createAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        title: z.string().trim().min(1).max(150),
        body: z.string().trim().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
    if (!isSuper) throw new Error("غير مصرح: هذه الميزة للسوبر أدمن فقط");

    const { error } = await supabase
      .from("announcements")
      .insert({ title: data.title, body: data.body, created_by: userId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
