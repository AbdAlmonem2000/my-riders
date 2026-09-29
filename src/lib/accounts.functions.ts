import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!data) throw new Error("غير مصرح: هذه الصفحة للسوبر أدمن فقط");
}

// Super admin can manage any company; a company admin can only manage
// their own — used for name/logo edits, which either role may perform.
export async function assertCanManageCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  companyId: string,
) {
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (isSuper) return;
  const { data: ownCompanyId } = await supabase.rpc("get_user_company", { _user_id: userId });
  if (ownCompanyId !== companyId) {
    throw new Error("غير مصرح: لا تملك صلاحية تعديل هذه الشركة");
  }
  const { data: isActive } = await supabase.rpc("is_company_active", { _company_id: companyId });
  if (!isActive) {
    throw new Error("هذا الحساب موقوف مؤقتًا من قبل الإدارة");
  }
}

// company-logos public URLs look like
// https://<project>.supabase.co/storage/v1/object/public/company-logos/<path>
// — recover just <path> so the file can be removed from storage.
function extractStoragePath(publicUrl: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}

export const listCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("companies")
      .select(
        "id, name, logo_url, is_suspended, created_at, plan_overview_access, plan_riders_access, plan_reports_access, plan_documents_access, plan_letters_access, plan_notifications_access, plan_users_access, plan_company_profile_access",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: noteRows } = await context.supabase
      .from("company_notes")
      .select("company_id, notes");
    const noteByCompany = new Map(
      (noteRows ?? []).map((r: { company_id: string; notes: string }) => [r.company_id, r.notes]),
    );

    return (data ?? []).map((c) => ({
      ...c,
      notes: noteByCompany.get(c.id) ?? "",
    }));
  });

export const updateCompanyNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), notes: z.string().max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("company_notes")
      .upsert(
        { company_id: data.id, notes: data.notes, updated_at: new Date().toISOString() },
        { onConflict: "company_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(120),
        logoUrl: z.string().url().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: co, error } = await context.supabase
      .from("companies")
      .insert({ name: data.name, logo_url: data.logoUrl ?? null })
      .select("id, name, logo_url")
      .single();
    if (error || !co) throw new Error(error?.message ?? "فشل إنشاء الشركة");
    return co;
  });

export const updateCompanyLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), logoUrl: z.string().url().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageCompany(context.supabase, context.userId, data.id);

    const { data: co } = await context.supabase
      .from("companies")
      .select("logo_url")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("companies")
      .update({ logo_url: data.logoUrl })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // The old logo file is now unreferenced — remove it so replacing a logo
    // doesn't just accumulate abandoned files in storage forever.
    const oldPath = co?.logo_url ? extractStoragePath(co.logo_url, "company-logos") : null;
    const newPath = data.logoUrl ? extractStoragePath(data.logoUrl, "company-logos") : null;
    if (oldPath && oldPath !== newPath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("company-logos").remove([oldPath]);
    }
    return { ok: true };
  });

export const updateCompanyStamp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), stampUrl: z.string().url().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageCompany(context.supabase, context.userId, data.id);

    const { data: co } = await context.supabase
      .from("companies")
      .select("stamp_url")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("companies")
      .update({ stamp_url: data.stampUrl })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const oldPath = co?.stamp_url ? extractStoragePath(co.stamp_url, "company-stamps") : null;
    const newPath = data.stampUrl ? extractStoragePath(data.stampUrl, "company-stamps") : null;
    if (oldPath && oldPath !== newPath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("company-stamps").remove([oldPath]);
    }
    return { ok: true };
  });

export const updateCompanySignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), signatureUrl: z.string().url().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageCompany(context.supabase, context.userId, data.id);

    const { data: co } = await context.supabase
      .from("companies")
      .select("signature_url")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("companies")
      .update({ signature_url: data.signatureUrl })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const oldPath = co?.signature_url
      ? extractStoragePath(co.signature_url, "company-stamps")
      : null;
    const newPath = data.signatureUrl
      ? extractStoragePath(data.signatureUrl, "company-stamps")
      : null;
    if (oldPath && oldPath !== newPath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("company-stamps").remove([oldPath]);
    }
    return { ok: true };
  });

export const updateCompanyName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageCompany(context.supabase, context.userId, data.id);
    const { data: updated, error } = await context.supabase
      .from("companies")
      .update({ name: data.name })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("لم يتم تحديث اسم الشركة");
    return { ok: true };
  });

// The company-wide default lead time for the "document about to expire"
// in-app alert — any individual user may still override it for themselves
// (see update_my_expiry_notify_days), so this only changes the fallback.
export const updateCompanyExpiryNotifyDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), days: z.number().int().min(1).max(365) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageCompany(context.supabase, context.userId, data.id);
    const { data: updated, error } = await context.supabase
      .from("companies")
      .update({ expiry_notify_days: data.days })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("لم يتم تحديث مدة التنبيه");
    return { ok: true };
  });

// السجل التجاري يبدأ بـ 10 والرقم الموحد يبدأ بـ 7 — كل واحد 10 أرقام. نص
// فاضي أو null يعني مسح الرقم المسجّل.
const UnifiedNumberSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || /^7\d{9}$/.test(v), "الرقم الموحد لازم يكون 10 أرقام ويبدأ بـ 7")
  .nullable();
const CommercialRegistrationSchema = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^10\d{8}$/.test(v),
    "رقم السجل التجاري لازم يكون 10 أرقام ويبدأ بـ 10",
  )
  .nullable();

export const updateCompanyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        unifiedNumber: UnifiedNumberSchema,
        commercialRegistration: CommercialRegistrationSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageCompany(context.supabase, context.userId, data.id);
    const { data: updated, error } = await context.supabase
      .from("companies")
      .update({
        unified_number: data.unifiedNumber || null,
        commercial_registration: data.commercialRegistration || null,
      })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("لم يتم تحديث بيانات الشركة");
    return { ok: true };
  });

// Which pages a company's own admin (and, by extension, any staff it
// creates — see get_member_* intersection in checkIsAdmin) can reach at
// all. Only the super admin ever sets this — a company itself has no way
// to touch its own plan.
const TieredAccessSchema = z.enum(["none", "view", "full"]);
const DocumentsAccessSchema = z.enum(["none", "view_only", "full"]);

export const updateCompanyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        overviewAccess: z.boolean(),
        ridersAccess: TieredAccessSchema,
        reportsAccess: TieredAccessSchema,
        documentsAccess: DocumentsAccessSchema,
        lettersAccess: TieredAccessSchema,
        notificationsAccess: z.boolean(),
        usersAccess: z.boolean(),
        companyProfileAccess: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: updated, error } = await context.supabase
      .from("companies")
      .update({
        plan_overview_access: data.overviewAccess,
        plan_riders_access: data.ridersAccess,
        plan_reports_access: data.reportsAccess,
        plan_documents_access: data.documentsAccess,
        plan_letters_access: data.lettersAccess,
        plan_notifications_access: data.notificationsAccess,
        plan_users_access: data.usersAccess,
        plan_company_profile_access: data.companyProfileAccess,
      })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("لم يتم تحديث باقة الشركة");
    return { ok: true };
  });

export const setCompanySuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), suspended: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: updated, error } = await context.supabase
      .from("companies")
      .update({ is_suspended: data.suspended })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("لم يتم تحديث حالة الشركة");
    return { ok: true };
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), password: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    // Re-confirm it's really the super admin at the keyboard before this
    // irreversible action, not just whoever is sitting at an unlocked
    // session. context.supabase carries no session of its own to disturb
    // (persistSession: false), so signing in again here is just a check.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: caller, error: callerErr } = await supabaseAdmin.auth.admin.getUserById(
      context.userId,
    );
    if (callerErr || !caller.user?.email) throw new Error("تعذّر التحقق من هويتك");
    const { error: pwErr } = await context.supabase.auth.signInWithPassword({
      email: caller.user.email,
      password: data.password,
    });
    if (pwErr) throw new Error("كلمة المرور غير صحيحة");

    // A company can only be deleted once every account tied to it (its own
    // admin and any staff) has been deleted first — deleting a company used
    // to cascade-delete those accounts automatically, which meant one click
    // could silently take down logins nobody had confirmed losing.
    const { count: accountCount } = await context.supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("company_id", data.id);
    if (accountCount && accountCount > 0) {
      throw new Error("لا يمكن حذف الشركة قبل حذف كل حساباتها من صفحة الحسابات أولاً");
    }

    // Delete storage files
    const { data: reps } = await context.supabase
      .from("reports")
      .select("storage_path")
      .eq("company_id", data.id);
    const paths = (reps ?? [])
      .map((r: { storage_path: string | null }) => r.storage_path)
      .filter((p: string | null): p is string => !!p);
    if (paths.length > 0) {
      await supabaseAdmin.storage.from("reports").remove(paths);
    }

    const { data: co } = await context.supabase
      .from("companies")
      .select("logo_url")
      .eq("id", data.id)
      .maybeSingle();
    const logoPath = co?.logo_url ? extractStoragePath(co.logo_url, "company-logos") : null;
    if (logoPath) {
      await supabaseAdmin.storage.from("company-logos").remove([logoPath]);
    }

    const { data: deleted, error } = await context.supabase
      .from("companies")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("لم يتم حذف الشركة");
    }
    return { ok: true };
  });

// Admin-provisioned signup: creates the account pre-confirmed via the
// service-role Admin API instead of the public signup endpoint. The public
// endpoint sends a confirmation email on every call and is subject to the
// project's email-sending rate limit (a few per hour by default without
// custom SMTP), which made creating more than one or two company-admin
// accounts per hour fail outright. email_confirm: true skips that entirely
// — appropriate here since the super admin creating the account already
// vouches for that email.
async function signupUserViaAuth(email: string, password: string) {
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

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase.rpc("admin_list_accounts");
    if (error) throw new Error(error.message);
    return (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => ({
        id: r.user_id,
        email: r.email as string | null,
        displayName: r.display_name as string | null,
        createdAt: r.created_at,
        lastSignInAt: r.last_sign_in_at,
        role: r.role,
        companyId: r.company_id,
        companyName: r.company_name,
        isSuperAdmin: r.role === "admin" && r.company_id === null,
      }),
    );
  });

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        companyId: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const user = await signupUserViaAuth(data.email, data.password);

    const { error: roleErr } = await context.supabase.from("user_roles").insert({
      user_id: user.id,
      role: "admin",
      company_id: data.companyId,
    });
    if (roleErr) {
      // Rollback user
      await context.supabase.rpc("admin_delete_user", { _user_id: user.id });
      throw new Error(roleErr.message);
    }

    return { id: user.id, email: user.email };
  });

export const updateAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(6) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_update_user_password", {
      _user_id: data.userId,
      _password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAccountEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), email: z.string().email() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc("admin_update_user_email", {
      _user_id: data.userId,
      _email: data.email,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("لا يمكنك حذف حسابك");
    const { error } = await context.supabase.rpc("admin_delete_user", {
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
