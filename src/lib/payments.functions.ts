import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchAllRows } from "@/lib/supabase-paginate";

async function assertSuperAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const { data } = await supabase.rpc("is_super_admin", { _user_id: userId });
  if (!data) throw new Error("غير مصرح: هذه الصفحة للسوبر أدمن فقط");
}

// A separate query from listCompanies (accounts.functions.ts) rather than
// adding these columns to that shared one — every other super-admin page
// (the Companies list, Accounts) calls listCompanies too, and selecting a
// column that doesn't exist yet on the live database fails the whole
// query, not just the part that needed it. Keeping this page's own
// not-yet-migrated columns isolated here means a pending migration can
// only ever break this page, never the rest of the app.
export const listCompaniesForPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("companies")
      .select(
        "id, name, logo_url, created_at, payment_plan_type, monthly_fee, first_payment_fee, first_payment_month, first_payment_year, one_time_fee, one_time_payment_month, one_time_payment_year",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Every (company, year) the "mark as paid" grid can show in one call — a
// row only exists for a month that's actually marked paid, so an absent
// (company, month) pair just means "not marked" rather than "unpaid"
// being tracked as its own state.
export const listCompanyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ year: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    return fetchAllRows<{
      id: string;
      company_id: string;
      month: number;
      payment_type: string;
      storage_path: string | null;
      file_name: string | null;
      paid_at: string;
    }>(({ from, to }) =>
      context.supabase
        .from("company_payments")
        .select("id, company_id, month, payment_type, storage_path, file_name, paid_at")
        .eq("year", data.year)
        .order("id", { ascending: true })
        .range(from, to),
    );
  });

// Marks a (company, year, month) as paid — or, called again on one already
// marked, replaces/attaches its receipt. The file is already in storage by
// the time this runs (the client uploads it directly, same pattern as
// every other document upload in this app), so this just records it; a
// replaced file's old object is removed so it doesn't linger orphaned.
const MarkPaidInput = z.object({
  companyId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  paymentType: z.enum(["cash", "transfer", "free"]),
  storagePath: z.string().min(1).nullable().optional(),
  fileName: z.string().min(1).nullable().optional(),
});

export const markCompanyPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { data: prev } = await context.supabase
      .from("company_payments")
      .select("storage_path")
      .eq("company_id", data.companyId)
      .eq("year", data.year)
      .eq("month", data.month)
      .maybeSingle();

    const { error } = await context.supabase.from("company_payments").upsert(
      {
        company_id: data.companyId,
        year: data.year,
        month: data.month,
        payment_type: data.paymentType,
        storage_path: data.storagePath ?? prev?.storage_path ?? null,
        file_name: data.fileName ?? null,
        paid_at: new Date().toISOString(),
      },
      { onConflict: "company_id,year,month" },
    );
    if (error) throw new Error(error.message);

    if (data.storagePath && prev?.storage_path && prev.storage_path !== data.storagePath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("payment-receipts").remove([prev.storage_path]);
    }

    return { ok: true };
  });

// Unmarks a month entirely — the row and its receipt file (if any) both go.
const UnmarkPaidInput = z.object({
  companyId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

export const unmarkCompanyPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UnmarkPaidInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { data: existing } = await context.supabase
      .from("company_payments")
      .select("id, storage_path")
      .eq("company_id", data.companyId)
      .eq("year", data.year)
      .eq("month", data.month)
      .maybeSingle();
    if (!existing) return { ok: true };

    const { error } = await context.supabase
      .from("company_payments")
      .delete()
      .eq("id", existing.id);
    if (error) throw new Error(error.message);

    if (existing.storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("payment-receipts").remove([existing.storage_path]);
    }

    return { ok: true };
  });

// A signed link to view/download one month's uploaded receipt.
const ReceiptUrlInput = z.object({
  companyId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
});

export const getPaymentReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ReceiptUrlInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { data: row } = await context.supabase
      .from("company_payments")
      .select("storage_path")
      .eq("company_id", data.companyId)
      .eq("year", data.year)
      .eq("month", data.month)
      .maybeSingle();
    if (!row?.storage_path) throw new Error("لا يوجد إيصال مرفوع لهذا الشهر");

    const { data: signed, error } = await context.supabase.storage
      .from("payment-receipts")
      .createSignedUrl(row.storage_path, 60);
    if (error || !signed) throw new Error(error?.message ?? "تعذر تجهيز رابط الملف");
    return { url: signed.signedUrl };
  });

// A company's overall billing arrangement (see the migration's comment on
// companies.payment_plan_type) — set independently of any month's own
// paid/free mark. monthlyFee/firstPaymentFee are relevant to a "monthly"
// company (what they pay every month, plus a one-off first payment such as
// an onboarding fee, on top of — not instead of — that monthly fee);
// oneTimeFee is relevant to a "one_time" company (the lump sum they paid
// instead of any recurring fee). All three are kept even when not relevant
// to the current plan type, so switching back doesn't lose what was typed
// in. The first payment and the one-time payment each happened in exactly
// one specific month — firstPaymentMonth/Year and
// oneTimePaymentMonth/Year record which, so the dashboard can count the
// amount toward that one month instead of repeating it on every month.
const UpdatePaymentPlanInput = z.object({
  companyId: z.string().uuid(),
  planType: z.enum(["monthly", "exempt", "one_time"]),
  monthlyFee: z.number().nonnegative().nullable(),
  firstPaymentFee: z.number().nonnegative().nullable(),
  firstPaymentMonth: z.number().int().min(1).max(12).nullable(),
  firstPaymentYear: z.number().int().nullable(),
  oneTimeFee: z.number().nonnegative().nullable(),
  oneTimePaymentMonth: z.number().int().min(1).max(12).nullable(),
  oneTimePaymentYear: z.number().int().nullable(),
});

export const updateCompanyPaymentPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdatePaymentPlanInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);

    const { error } = await context.supabase
      .from("companies")
      .update({
        payment_plan_type: data.planType,
        monthly_fee: data.monthlyFee,
        first_payment_fee: data.firstPaymentFee,
        first_payment_month: data.firstPaymentFee != null ? data.firstPaymentMonth : null,
        first_payment_year: data.firstPaymentFee != null ? data.firstPaymentYear : null,
        one_time_fee: data.oneTimeFee,
        one_time_payment_month: data.oneTimeFee != null ? data.oneTimePaymentMonth : null,
        one_time_payment_year: data.oneTimeFee != null ? data.oneTimePaymentYear : null,
      })
      .eq("id", data.companyId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
