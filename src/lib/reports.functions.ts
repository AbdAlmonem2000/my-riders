import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RowSchema = z.record(z.string(), z.unknown());

const UploadInput = z
  .object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
    fileName: z.string().min(1),
    storagePath: z.string().nullable(),
    headers: z.array(z.string()),
    iqamaColumn: z.string().nullable(),
    idColumn: z.string().nullable(),
    nameColumn: z.string().nullable(),
    rows: z.array(RowSchema),
    replace: z.boolean().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => d.iqamaColumn || d.idColumn, {
    message: "لازم عمود رقم إقامة أو ID على الأقل",
  });

async function getCallerCompany(
  supabase: ReturnType<typeof getSupabaseFromContext>,
  userId: string,
) {
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  const { data: companyId } = await supabase.rpc("get_user_company", { _user_id: userId });
  return { isSuperAdmin: !!isSuper, companyId: (companyId as string | null) ?? null };
}

// Helper for typing without exporting supabase
function getSupabaseFromContext(
  ctx: { supabase: unknown },
): // eslint-disable-next-line @typescript-eslint/no-explicit-any
any {
  return ctx.supabase;
}

export const uploadReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UploadInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { companyId } = await getCallerCompany(supabase, userId);
    if (!companyId) {
      throw new Error("هذا الحساب غير مرتبط بشركة، لا يمكن رفع تقارير");
    }
    const { data: isActive } = await supabase.rpc("is_company_active", {
      _company_id: companyId,
    });
    if (!isActive) {
      throw new Error("هذا الحساب موقوف مؤقتًا من قبل الإدارة، تواصل معهم لإعادة التفعيل");
    }

    // Check for existing report same month/year within this company
    const { data: existing } = await supabase
      .from("reports")
      .select("id, storage_path")
      .eq("company_id", companyId)
      .eq("month", data.month)
      .eq("year", data.year)
      .maybeSingle();

    if (existing && !data.replace) {
      throw new Error("يوجد تقرير لهذا الشهر بالفعل. استخدم خيار الاستبدال.");
    }
    if (existing) {
      // The replacement file was already uploaded under a new storage path
      // above, so the old file is now orphaned unless removed explicitly —
      // deleting the row alone doesn't touch storage.
      if (existing.storage_path) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from("reports").remove([existing.storage_path]);
      }
      await supabase.from("reports").delete().eq("id", existing.id);
    }

    const { data: report, error: reportErr } = await supabase
      .from("reports")
      .insert({
        company_id: companyId,
        month: data.month,
        year: data.year,
        file_name: data.fileName,
        storage_path: data.storagePath,
        uploaded_by: userId,
        rider_count: 0,
        note: data.note?.trim() || null,
      })
      .select("id")
      .single();
    if (reportErr || !report) throw new Error(reportErr?.message ?? "فشل إنشاء التقرير");

    const iqamaCol = data.iqamaColumn;
    const idCol = data.idColumn;
    const nameCol = data.nameColumn;
    type Row = Record<string, unknown>;
    const cellText = (row: Row, col: string | null) => {
      if (!col) return null;
      const v = row[col];
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s || null;
    };

    // A rider can show up across uploads under different combinations of
    // Iqama/ID (e.g. one sheet has only the ID column, another has both
    // Iqama and ID for the same person). Resolve each row against riders
    // already on file — by either number — and merge into that existing
    // row instead of letting an ID-only upload's "ID used as the key"
    // fallback mint a second, duplicate rider for the same person.
    type ExistingRider = {
      id: string;
      iqama_number: string;
      id_number: string | null;
      rider_name: string | null;
    };
    const { data: existingRidersRaw } = await supabase
      .from("riders")
      .select("id, iqama_number, id_number, rider_name")
      .eq("company_id", companyId);
    const existingRiders = (existingRidersRaw ?? []) as ExistingRider[];
    const byIqama = new Map(existingRiders.map((r) => [r.iqama_number, r]));
    const byIdNumber = new Map(
      existingRiders.filter((r) => r.id_number).map((r) => [r.id_number as string, r]),
    );

    interface Resolved {
      key: string;
      idNumber: string | null;
      name: string | null;
      row: Row;
      existingRiderId: string | null;
    }
    const resolvedRows: Resolved[] = [];
    const seenKeys = new Set<string>();
    for (const row of data.rows) {
      const rawIqama = cellText(row, iqamaCol);
      const rawId = cellText(row, idCol);
      if (!rawIqama && !rawId) continue;
      const name = nameCol ? (row[nameCol] != null ? String(row[nameCol]).trim() : null) : null;

      let matched: ExistingRider | undefined;
      if (rawIqama) matched = byIqama.get(rawIqama);
      if (!matched && rawId) matched = byIdNumber.get(rawId) ?? byIqama.get(rawId);

      const key = matched ? (rawIqama ?? matched.iqama_number) : (rawIqama ?? rawId!);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const idNumber = rawId && rawId !== key ? rawId : matched ? matched.id_number : null;
      resolvedRows.push({ key, idNumber, name, row, existingRiderId: matched?.id ?? null });
    }

    // Reconcile rows that matched an existing rider under a different
    // identity (e.g. correct a previous ID-only upload's iqama_number to
    // the real Iqama number now that it's known) — only writes when
    // something actually changed, so a routine monthly reupload with
    // unchanged numbers touches nothing here.
    const existingById = new Map(existingRiders.map((r) => [r.id, r]));
    for (const r of resolvedRows) {
      if (!r.existingRiderId) continue;
      const existing = existingById.get(r.existingRiderId)!;
      const patch: { iqama_number?: string; id_number?: string | null; rider_name?: string } = {};
      if (r.key !== existing.iqama_number) patch.iqama_number = r.key;
      if (r.idNumber !== (existing.id_number ?? null)) patch.id_number = r.idNumber;
      if (r.name && r.name !== existing.rider_name) patch.rider_name = r.name;
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from("riders").update(patch).eq("id", r.existingRiderId);
        if (error) throw new Error(error.message);
      }
    }

    const newRows = resolvedRows.filter((r) => !r.existingRiderId);
    if (newRows.length > 0) {
      const { error: upsertErr } = await supabase.from("riders").upsert(
        newRows.map((r) => ({
          company_id: companyId,
          iqama_number: r.key,
          id_number: r.idNumber,
          rider_name: r.name,
        })),
        { onConflict: "company_id,iqama_number", ignoreDuplicates: false },
      );
      if (upsertErr) throw new Error(upsertErr.message);
    }

    const riderIdByKey = new Map<string, string>();
    for (const r of resolvedRows) {
      if (r.existingRiderId) riderIdByKey.set(r.key, r.existingRiderId);
    }
    if (newRows.length > 0) {
      const { data: created } = await supabase
        .from("riders")
        .select("id, iqama_number")
        .eq("company_id", companyId)
        .in(
          "iqama_number",
          newRows.map((r) => r.key),
        );
      for (const c of (created ?? []) as { id: string; iqama_number: string }[]) {
        riderIdByKey.set(c.iqama_number, c.id);
      }
    }

    const riderReportsPayload = resolvedRows
      .map((r) => {
        const riderId = riderIdByKey.get(r.key);
        if (!riderId) return null;
        return {
          company_id: companyId,
          report_id: report.id,
          rider_id: riderId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: r.row as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          columns: data.headers as any,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const CHUNK = 500;
    for (let i = 0; i < riderReportsPayload.length; i += CHUNK) {
      const chunk = riderReportsPayload.slice(i, i + CHUNK);
      const { error } = await supabase.from("rider_reports").insert(chunk);
      if (error) throw new Error(error.message);
    }

    await supabase
      .from("reports")
      .update({ rider_count: riderReportsPayload.length })
      .eq("id", report.id);

    return { reportId: report.id, count: riderReportsPayload.length };
  });

export const deleteReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rep } = await supabase
      .from("reports")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (rep?.storage_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("reports").remove([rep.storage_path]);
    }
    // RLS filters a DELETE's WHERE clause rather than rejecting it, so a
    // blocked delete would otherwise return success with nothing removed.
    const { data: deleted, error } = await supabase
      .from("reports")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) {
      throw new Error("لم يتم حذف التقرير — تأكد أن التقرير يتبع شركتك");
    }
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { isSuperAdmin, companyId } = await getCallerCompany(supabase, userId);
    let companyName: string | null = null;
    let companyLogoUrl: string | null = null;
    let isSuspended = false;
    if (companyId) {
      const { data } = await supabase
        .from("companies")
        .select("name, logo_url, is_suspended")
        .eq("id", companyId)
        .maybeSingle();
      companyName = (data?.name as string | undefined) ?? null;
      companyLogoUrl = (data?.logo_url as string | undefined) ?? null;
      isSuspended = (data?.is_suspended as boolean | undefined) ?? false;
    }
    return {
      isAdmin: isSuperAdmin || !!companyId,
      isSuperAdmin,
      companyId,
      companyName,
      companyLogoUrl,
      isSuspended,
      userId,
    };
  });
