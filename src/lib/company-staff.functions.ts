import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Only a real company admin (not a staff account, not an unrelated user) may
// manage that company's staff — resolved the same way every other
// admin-only action in the app is (get_user_company, never get_member_company).
async function assertCompanyAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const { data: companyId } = await supabase.rpc("get_user_company", { _user_id: userId });
  if (!companyId) throw new Error("غير مصرح: هذه الصفحة لمدير الشركة فقط");
  return companyId as string;
}

const AllowedAreasSchema = z
  .array(z.string().trim().min(1))
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));
const DocumentsAccessSchema = z.enum(["none", "view_only", "full"]);
const TieredAccessSchema = z.enum(["none", "view", "full"]);

const PermissionsSchema = z.object({
  allowedAreas: AllowedAreasSchema,
  overviewAccess: z.boolean(),
  ridersAccess: TieredAccessSchema,
  // Only meaningful when ridersAccess is 'full' — enforced in
  // riders.functions.ts's resolveRidersCompany, not here, so saving it
  // while ridersAccess isn't 'full' is harmless (it just has no effect
  // until the admin also grants full riders access).
  ridersDeleteAccess: z.boolean(),
  ridersBlockAccess: z.boolean(),
  reportsAccess: TieredAccessSchema,
  documentsAccess: DocumentsAccessSchema,
  lettersAccess: TieredAccessSchema,
  notificationsAccess: z.boolean(),
  // Only meaningful when documentsAccess isn't 'none' — same reasoning as
  // ridersDeleteAccess/ridersBlockAccess above.
  operatingCardsAccess: z.boolean(),
  // Only meaningful when operatingCardsAccess is true.
  operatingCardsUploadAccess: z.boolean(),
  operatingCardsExportAccess: z.boolean(),
  operatingCardsDeleteAccess: z.boolean(),
  // Only meaningful when documentsAccess isn't 'none' — same reasoning as
  // operatingCardsAccess above.
  expiryAlertsAccess: z.boolean(),
  // Only meaningful when overviewAccess is true — lets this staff member
  // change the dashboard's shared column filters (see
  // dashboard-filters.functions.ts) for everyone in the company, not just
  // view whatever the admin already picked.
  dashboardFiltersEditAccess: z.boolean(),
});

export const listCompanyStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const companyId = await assertCompanyAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("company_admin_list_staff", {
      _company_id: companyId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => ({
        id: r.user_id as string,
        email: r.email as string | null,
        displayName: r.display_name as string | null,
        lastSignInAt: r.last_sign_in_at as string | null,
        allowedAreas: (r.allowed_areas as string[] | null) ?? null,
        overviewAccess: !!r.overview_access,
        ridersAccess: r.riders_access as "none" | "view" | "full",
        ridersDeleteAccess: !!r.riders_delete_access,
        ridersBlockAccess: !!r.riders_block_access,
        reportsAccess: r.reports_access as "none" | "view" | "full",
        documentsAccess: r.documents_access as "none" | "view_only" | "full",
        lettersAccess: r.letters_access as "none" | "view" | "full",
        notificationsAccess: !!r.notifications_access,
        operatingCardsAccess: !!r.operating_cards_access,
        operatingCardsUploadAccess: !!r.operating_cards_upload_access,
        operatingCardsExportAccess: !!r.operating_cards_export_access,
        operatingCardsDeleteAccess: !!r.operating_cards_delete_access,
        expiryAlertsAccess: !!r.expiry_alerts_access,
        dashboardFiltersEditAccess: !!r.dashboard_filters_edit_access,
        createdAt: r.created_at as string,
      }),
    );
  });

// Admin-provisioned signup, same reasoning as accounts.functions.ts's
// createAccount: the service-role Admin API skips the confirmation email
// (and its rate limit) since the company admin creating this account already
// vouches for the email.
async function signupStaffViaAuth(email: string, password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "فشل إنشاء الحساب");
  }
  return { id: data.user.id, email: data.user.email ?? email };
}

export const createCompanyStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        displayName: z.string().trim().min(1).max(120),
      })
      .merge(PermissionsSchema)
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const companyId = await assertCompanyAdmin(context.supabase, context.userId);

    const user = await signupStaffViaAuth(data.email, data.password);

    const { error: roleErr } = await context.supabase.from("user_roles").insert({
      user_id: user.id,
      role: "user",
      company_id: companyId,
      display_name: data.displayName,
      allowed_areas: data.allowedAreas,
      overview_access: data.overviewAccess,
      riders_access: data.ridersAccess,
      riders_delete_access: data.ridersDeleteAccess,
      riders_block_access: data.ridersBlockAccess,
      reports_access: data.reportsAccess,
      documents_access: data.documentsAccess,
      letters_access: data.lettersAccess,
      notifications_access: data.notificationsAccess,
      operating_cards_access: data.operatingCardsAccess,
      operating_cards_upload_access: data.operatingCardsUploadAccess,
      operating_cards_export_access: data.operatingCardsExportAccess,
      operating_cards_delete_access: data.operatingCardsDeleteAccess,
      expiry_alerts_access: data.expiryAlertsAccess,
      dashboard_filters_edit_access: data.dashboardFiltersEditAccess,
    });
    if (roleErr) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      throw new Error(roleErr.message);
    }

    return { id: user.id, email: user.email };
  });

export const updateCompanyStaffPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid() }).merge(PermissionsSchema).parse(d),
  )
  .handler(async ({ data, context }) => {
    const companyId = await assertCompanyAdmin(context.supabase, context.userId);
    const { data: updated, error } = await context.supabase
      .from("user_roles")
      .update({
        allowed_areas: data.allowedAreas,
        overview_access: data.overviewAccess,
        riders_access: data.ridersAccess,
        riders_delete_access: data.ridersDeleteAccess,
        riders_block_access: data.ridersBlockAccess,
        reports_access: data.reportsAccess,
        documents_access: data.documentsAccess,
        letters_access: data.lettersAccess,
        notifications_access: data.notificationsAccess,
        operating_cards_access: data.operatingCardsAccess,
        operating_cards_upload_access: data.operatingCardsUploadAccess,
        operating_cards_export_access: data.operatingCardsExportAccess,
        operating_cards_delete_access: data.operatingCardsDeleteAccess,
        expiry_alerts_access: data.expiryAlertsAccess,
        dashboard_filters_edit_access: data.dashboardFiltersEditAccess,
      })
      .eq("user_id", data.userId)
      .eq("role", "user")
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("لم يتم تحديث صلاحيات المستخدم");
    return { ok: true };
  });

export const updateCompanyStaffName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ userId: z.string().uuid(), displayName: z.string().trim().min(1).max(120) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const companyId = await assertCompanyAdmin(context.supabase, context.userId);
    const { data: updated, error } = await context.supabase
      .from("user_roles")
      .update({ display_name: data.displayName })
      .eq("user_id", data.userId)
      .eq("role", "user")
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("لم يتم تحديث اسم المستخدم");
    return { ok: true };
  });

export const updateCompanyStaffEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), email: z.string().email() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("company_admin_update_staff_email", {
      _user_id: data.userId,
      _email: data.email,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateCompanyStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(6) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("company_admin_update_staff_password", {
      _user_id: data.userId,
      _password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCompanyStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCompanyAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("company_admin_delete_staff", {
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
