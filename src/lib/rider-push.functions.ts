import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActiveCompany } from "@/lib/riders.functions";
import { resolveReportsCompany } from "@/lib/reports.functions";
import { resolveLettersCompany } from "@/lib/company-letters.functions";

// Kept small: every push is one outbound request, and a Worker invocation
// only gets so many. The browser drives the paging (see dispatchPush).
const BATCH_SIZE = 25;

const MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// The rider's browser asks for this before subscribing. Null means push isn't
// set up on this deployment, so the rider page simply doesn't offer it.
export const getPushPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const { getVapidPublicKey } = await import("@/lib/web-push.server");
  return { publicKey: getVapidPublicKey() };
});

interface PushContent {
  companyId: string;
  riderId: string | null;
  reportId: string | null;
  // Path (after the rider's own key) the notification opens.
  search: string;
  title: string;
  body: string;
  tag: string;
}

// Sends one page of phone notifications for something the company just did.
// The message is built here from the stored row — never taken from the
// caller — and the caller must be allowed to perform that very action, so
// this can't be used to push arbitrary text to a company's riders. Returns
// where to resume (`after`), or null when everyone has been reached.
export const dispatchRiderPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        source: z.enum(["notification", "report", "letter"]),
        id: z.string().uuid(),
        after: z.string().uuid().nullable(),
        // For reports: the upload merged into an existing month's report.
        updated: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const push = await import("@/lib/web-push.server");
    if (!push.isPushConfigured()) return { sent: 0, after: null };

    let content: PushContent;
    if (data.source === "notification") {
      const companyId = await resolveActiveCompany(supabase, userId);
      const { data: row } = await supabase
        .from("rider_notifications")
        .select("target_rider_id, kind, title, body")
        .eq("id", data.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!row) throw new Error("الإشعار غير موجود");
      content = {
        companyId,
        riderId: row.target_rider_id,
        reportId: null,
        search: "",
        title: clip(row.kind === "warning" ? `⚠️ ${row.title}` : row.title, 80),
        body: clip(row.body, 140),
        tag: `notification-${data.id}`,
      };
    } else if (data.source === "report") {
      const companyId = await resolveReportsCompany(supabase, userId);
      const { data: row } = await supabase
        .from("reports")
        .select("month, year")
        .eq("id", data.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!row) throw new Error("التقرير غير موجود");
      content = {
        companyId,
        riderId: null,
        reportId: data.id,
        search: `?reportId=${data.id}`,
        title: data.updated ? "تم تحديث تقريرك" : "تقرير جديد",
        body: `تقرير ${MONTHS_AR[row.month - 1] ?? row.month} ${row.year} متاح الآن`,
        tag: `report-${data.id}`,
      };
    } else {
      const companyId = await resolveLettersCompany(supabase, userId);
      const { data: row } = await supabase
        .from("company_letters")
        .select("rider_id, is_sent, title")
        .eq("id", data.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!row || !row.is_sent || !row.rider_id) throw new Error("الخطاب لم يُرسل بعد");
      content = {
        companyId,
        riderId: row.rider_id,
        reportId: null,
        search: "",
        title: "خطاب جديد",
        body: clip(row.title, 140),
        tag: `letter-${data.id}`,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: targets, error } = await supabaseAdmin.rpc("list_push_targets", {
      _company_id: content.companyId,
      _rider_id: content.riderId ?? undefined,
      _report_id: content.reportId ?? undefined,
      _after: data.after ?? undefined,
      _limit: BATCH_SIZE,
    });
    if (error) throw new Error(error.message);
    if (targets.length === 0) return { sent: 0, after: null };

    const results = await Promise.all(
      targets.map((target) =>
        push.sendWebPush(
          { endpoint: target.endpoint, p256dh: target.p256dh, auth: target.auth_secret },
          {
            title: content.title,
            body: content.body,
            url: `/rider/${encodeURIComponent(target.rider_key)}${content.search}`,
            tag: content.tag,
          },
        ),
      ),
    );

    const goneIds = targets.filter((_, i) => results[i] === "gone").map((t) => t.subscription_id);
    if (goneIds.length > 0) {
      await supabaseAdmin.from("rider_push_subscriptions").delete().in("id", goneIds);
    }

    return {
      sent: results.filter((r) => r === "sent").length,
      after: targets.length === BATCH_SIZE ? targets[targets.length - 1].subscription_id : null,
    };
  });
