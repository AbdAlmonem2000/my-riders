import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RowSchema = z.record(z.string(), z.unknown());

const UploadInput = z
  .object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
    title: z.string().trim().min(1).max(150),
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

    // Check for an existing report with the same month/year/title within
    // this company — a company can have several reports for the same
    // month (salaries, tiers, kilometers...) as long as titles differ.
    const { data: existing } = await supabase
      .from("reports")
      .select("id, storage_path")
      .eq("company_id", companyId)
      .eq("month", data.month)
      .eq("year", data.year)
      .eq("title", data.title)
      .maybeSingle();

    if (existing && !data.replace) {
      throw new Error("يوجد تقرير بنفس العنوان لهذا الشهر بالفعل. استخدم خيار الاستبدال.");
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
        title: data.title,
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
    const validRows: { iqama: string; idNumber: string | null; name: string | null; row: Row }[] =
      [];
    for (const row of data.rows) {
      const rawIqama = cellText(row, iqamaCol);
      const rawId = cellText(row, idCol);
      // A sheet with both an Iqama column and a separate ID column keeps
      // iqama_number as the stable per-rider key (unchanged from before),
      // and stashes the ID value alongside so the rider is findable by
      // either number. A sheet with only one of the two falls back to
      // using whichever is present as the key, as before.
      const iqama = rawIqama ?? rawId;
      if (!iqama) continue;
      const idNumber = rawId && rawId !== iqama ? rawId : null;
      const name = nameCol ? (row[nameCol] != null ? String(row[nameCol]).trim() : null) : null;
      validRows.push({ iqama, idNumber, name, row });
    }

    const seen = new Set<string>();
    const uniqueRows = validRows.filter((r) => {
      if (seen.has(r.iqama)) return false;
      seen.add(r.iqama);
      return true;
    });

    const ridersPayload = uniqueRows.map((r) => ({
      company_id: companyId,
      iqama_number: r.iqama,
      id_number: r.idNumber,
      rider_name: r.name,
    }));

    if (ridersPayload.length > 0) {
      const { error: upsertErr } = await supabase
        .from("riders")
        .upsert(ridersPayload, {
          onConflict: "company_id,iqama_number",
          ignoreDuplicates: false,
        });
      if (upsertErr) throw new Error(upsertErr.message);
    }

    const iqamaList = uniqueRows.map((r) => r.iqama);
    const { data: riders } = await supabase
      .from("riders")
      .select("id, iqama_number")
      .eq("company_id", companyId)
      .in("iqama_number", iqamaList);
    const riderIdByIqama = new Map(
      (riders ?? []).map((r: { id: string; iqama_number: string }) => [r.iqama_number, r.id]),
    );

    const riderReportsPayload = uniqueRows
      .map((r) => {
        const riderId = riderIdByIqama.get(r.iqama);
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
    if (companyId) {
      const { data } = await supabase
        .from("companies")
        .select("name, logo_url")
        .eq("id", companyId)
        .maybeSingle();
      companyName = (data?.name as string | undefined) ?? null;
      companyLogoUrl = (data?.logo_url as string | undefined) ?? null;
    }
    return {
      isAdmin: isSuperAdmin || !!companyId,
      isSuperAdmin,
      companyId,
      companyName,
      companyLogoUrl,
      userId,
    };
  });
