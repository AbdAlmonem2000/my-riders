import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidExpiryDate } from "@/lib/document-status";

// A letter's shown date is chosen by the admin, independent of when it was
// actually saved — reuses the same sane-year guard as document expiry dates.
const LetterDateSchema = z.string().refine(isValidExpiryDate, "التاريخ غير صحيح");

// Resolves the caller's company for writing letters specifically. Unlike
// resolveActiveCompany (admin-only), this also accepts a staff account
// (role 'user') whose letters_access is 'full'. Doesn't check
// allowed_areas itself — that's enforced by the RLS policy on
// company_letters, which silently touches 0 rows for a letter linked to an
// out-of-area rider.
export async function resolveLettersCompany(
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
    throw new Error("هذا الحساب موقوف مؤقتًا من قبل الإدارة، تواصل معهم لإعادة التفعيل");
  }
  const { data: role } = await supabase.rpc("get_member_role", { _user_id: userId });
  if (role === "user") {
    const { data: access } = await supabase.rpc("get_member_letters_access", {
      _user_id: userId,
    });
    if (access !== "full") {
      throw new Error("غير مصرح: صلاحيتك على الخطابات للعرض فقط");
    }
  }
  return companyId as string;
}

// A letter isn't always about a rider — saving it just records it. Sending
// it to a rider (making it visible on their page) is a separate, later
// step, done through sendLetterToRider below.
export const createLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        riderId: z.string().uuid().nullable(),
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(8000),
        letterDate: LetterDateSchema,
        includeStamp: z.boolean(),
        includeSignature: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveLettersCompany(supabase, userId);

    if (data.riderId) {
      const { data: rider } = await supabase
        .from("riders")
        .select("id")
        .eq("id", data.riderId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!rider) throw new Error("المندوب غير موجود");
    }

    const { data: created, error } = await supabase
      .from("company_letters")
      .insert({
        company_id: companyId,
        rider_id: data.riderId,
        title: data.title,
        body: data.body,
        letter_date: data.letterDate,
        include_stamp: data.includeStamp,
        include_signature: data.includeSignature,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "فشل حفظ الخطاب");
    return { id: created.id as string };
  });

// Editing content never touches who it's sent to (rider_id/is_sent) — a
// sent letter simply shows the updated content the next time the rider (or
// the admin) opens it, since it's rendered live from this row, not copied.
export const updateLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        letterId: z.string().uuid(),
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1).max(8000),
        letterDate: LetterDateSchema,
        includeStamp: z.boolean(),
        includeSignature: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveLettersCompany(supabase, userId);

    const { data: updated, error } = await supabase
      .from("company_letters")
      .update({
        title: data.title,
        body: data.body,
        letter_date: data.letterDate,
        include_stamp: data.includeStamp,
        include_signature: data.includeSignature,
      })
      .eq("id", data.letterId)
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("لم يتم تحديث الخطاب — تأكد أنه يتبع شركتك");
    }
    return { ok: true };
  });

export const sendLetterToRider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ letterId: z.string().uuid(), riderId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveLettersCompany(supabase, userId);

    const { data: rider } = await supabase
      .from("riders")
      .select("id")
      .eq("id", data.riderId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!rider) throw new Error("المندوب غير موجود");

    const { data: updated, error } = await supabase
      .from("company_letters")
      .update({ rider_id: data.riderId, is_sent: true, sent_at: new Date().toISOString() })
      .eq("id", data.letterId)
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("لم يتم إرسال الخطاب — تأكد أنه يتبع شركتك");
    }
    return { ok: true };
  });

export const deleteLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ letterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveLettersCompany(supabase, userId);

    const { data: deleted, error } = await supabase
      .from("company_letters")
      .delete()
      .eq("id", data.letterId)
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("لم يتم حذف الخطاب — تأكد أنه يتبع شركتك");
    }
    return { ok: true };
  });
