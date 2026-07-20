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
async function assertCanManageCompany(
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
      .select("id, name, logo_url, is_suspended, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
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
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    // Delete storage files
    const { data: reps } = await context.supabase
      .from("reports")
      .select("storage_path")
      .eq("company_id", data.id);
    const paths = (reps ?? [])
      .map((r: { storage_path: string | null }) => r.storage_path)
      .filter((p: string | null): p is string => !!p);
    if (paths.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("reports").remove(paths);
    }

    const { data: co } = await context.supabase
      .from("companies")
      .select("logo_url")
      .eq("id", data.id)
      .maybeSingle();
    const logoPath = co?.logo_url ? extractStoragePath(co.logo_url, "company-logos") : null;
    if (logoPath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("company-logos").remove([logoPath]);
    }

    // Delete users linked to this company
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("user_id")
      .eq("company_id", data.id);
    for (const r of (roles ?? []) as { user_id: string }[]) {
      const { error: userDeleteErr } = await context.supabase.rpc("admin_delete_user", {
        _user_id: r.user_id,
      });
      if (userDeleteErr) {
        throw new Error(`فشل حذف حساب مرتبط بالشركة: ${userDeleteErr.message}`);
      }
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
