import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RowSchema = z.record(z.string(), z.unknown());

const UploadInput = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  fileName: z.string().min(1),
  storagePath: z.string().nullable(),
  headers: z.array(z.string()),
  iqamaColumn: z.string().min(1),
  nameColumn: z.string().nullable(),
  rows: z.array(RowSchema),
  replace: z.boolean().optional(),
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

    // Check for existing report same month/year within this company
    const { data: existing } = await supabase
      .from("reports")
      .select("id")
      .eq("company_id", companyId)
      .eq("month", data.month)
      .eq("year", data.year)
      .maybeSingle();

    if (existing && !data.replace) {
      throw new Error("يوجد تقرير لهذا الشهر بالفعل. استخدم خيار الاستبدال.");
    }
    if (existing) {
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
      })
      .select("id")
      .single();
    if (reportErr || !report) throw new Error(reportErr?.message ?? "فشل إنشاء التقرير");

    const iqamaCol = data.iqamaColumn;
    const nameCol = data.nameColumn;
    type Row = Record<string, unknown>;
    const validRows: { iqama: string; name: string | null; row: Row }[] = [];
    for (const row of data.rows) {
      const iqamaVal = row[iqamaCol];
      if (iqamaVal === undefined || iqamaVal === null) continue;
      const iqama = String(iqamaVal).trim();
      if (!iqama) continue;
      const name = nameCol ? (row[nameCol] != null ? String(row[nameCol]).trim() : null) : null;
      validRows.push({ iqama, name, row });
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
      await supabase.storage.from("reports").remove([rep.storage_path]);
    }
    const { error } = await supabase.from("reports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { isSuperAdmin, companyId } = await getCallerCompany(supabase, userId);
    let companyName: string | null = null;
    if (companyId) {
      const { data } = await supabase
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .maybeSingle();
      companyName = (data?.name as string | undefined) ?? null;
    }
    return {
      isAdmin: isSuperAdmin || !!companyId,
      isSuperAdmin,
      companyId,
      companyName,
      userId,
    };
  });
