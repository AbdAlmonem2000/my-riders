import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveCompany } from "@/lib/riders.functions";

// A company admin sends a message to one rider, or to every rider in the
// company at once (targetRiderId omitted/null = broadcast).
export const sendRiderNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        targetRiderId: z.string().uuid().nullable(),
        kind: z.enum(["notification", "warning"]),
        title: z.string().trim().min(1).max(150),
        body: z.string().trim().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveActiveCompany(supabase, userId);

    if (data.targetRiderId) {
      const { data: rider } = await supabase
        .from("riders")
        .select("id")
        .eq("id", data.targetRiderId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!rider) throw new Error("المندوب غير موجود");
    }

    const { data: created, error } = await supabase
      .from("rider_notifications")
      .insert({
        company_id: companyId,
        target_rider_id: data.targetRiderId,
        kind: data.kind,
        title: data.title,
        body: data.body,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "فشل إرسال الإشعار");
    return { id: created.id as string };
  });

export const listSentRiderNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("admin_list_rider_notifications");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteRiderNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ notificationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveActiveCompany(supabase, userId);

    const { data: deleted, error } = await supabase
      .from("rider_notifications")
      .delete()
      .eq("id", data.notificationId)
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("لم يتم حذف الإشعار — تأكد أنه يتبع شركتك");
    }
    return { ok: true };
  });
