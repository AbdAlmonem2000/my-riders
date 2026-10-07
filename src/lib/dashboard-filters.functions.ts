import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

// Writing the dashboard's shared column filters follows the exact same
// shape as resolveReportsCompany in reports.functions.ts: any member can
// read them (via checkIsAdmin, which already carries the company's
// dashboard_filters), but only a real admin (or the super admin, who never
// hits this — they have no company of their own to set filters for) or a
// staff account granted dashboard_filters_edit_access may write them.
async function resolveDashboardFiltersCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const { data: companyId } = await supabase.rpc("get_member_company", { _user_id: userId });
  if (!companyId) {
    throw new Error("هذا الحساب غير مرتبط بشركة");
  }
  const { data: isActive } = await supabase.rpc("is_company_active", {
    _company_id: companyId,
  });
  if (!isActive) {
    throw new Error("هذا الحساب موقوف مؤقتًا من قبل الإدارة");
  }
  const { data: role } = await supabase.rpc("get_member_role", { _user_id: userId });
  if (role === "user") {
    const { data: access } = await supabase.rpc("get_member_dashboard_filters_edit_access", {
      _user_id: userId,
    });
    if (!access) {
      throw new Error("غير مصرح: لا تملك صلاحية تعديل فلاتر لوحة التحكم");
    }
  }
  return companyId as string;
}

// Partial — the metric-column picker and each breakdown chart's own column
// picker save independently of one another (same as they did against
// localStorage before), so a save here only ever touches the field(s) it
// was given and leaves the rest of that scope's object alone.
const ScopeFiltersPatchSchema = z.object({
  metricColumns: z.array(z.string()).optional(),
  donutColumn: z.string().nullable().optional(),
  barColumn: z.string().nullable().optional(),
});

export const updateDashboardFilters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: z.enum(["daily", "monthly"]),
        filters: ScopeFiltersPatchSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const companyId = await resolveDashboardFiltersCompany(context.supabase, context.userId);
    // Merge at both the scope level (daily vs. monthly) and the field level
    // within that scope, so this save never clobbers the other scope's
    // filters or a different picker's column within the same scope.
    const { data: row, error: readErr } = await context.supabase
      .from("companies")
      .select("dashboard_filters")
      .eq("id", companyId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    const current =
      row?.dashboard_filters && typeof row.dashboard_filters === "object"
        ? (row.dashboard_filters as Record<string, unknown>)
        : {};
    const currentScope =
      current[data.scope] && typeof current[data.scope] === "object"
        ? (current[data.scope] as Record<string, unknown>)
        : {};
    const nextScope = { ...currentScope, ...data.filters };
    const { error } = await context.supabase
      .from("companies")
      .update({ dashboard_filters: { ...current, [data.scope]: nextScope } as Json })
      .eq("id", companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
