import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  indexRiders,
  matchRider,
  cellText,
  looksLikeIdentifier,
  type RiderIdentity,
} from "@/lib/rider-identity";

const RowSchema = z.record(z.string(), z.unknown());

// A plain number: an integer or decimal, optionally with thousands commas.
// A percentage ("95.00%") or anything with letters is deliberately NOT
// treated as summable — adding two percentages/rates is meaningless.
function numericCell(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.includes("%")) return null;
  const cleaned = s.replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatSum(sum: number): string {
  return Number.isInteger(sum) ? String(sum) : String(Number(sum.toFixed(4)));
}

// Merge a rider's repeated rows within one report: numeric columns are
// added, blank cells are filled from whichever row has a value, everything
// else keeps the first row's value.
function mergeReportRows(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  headers: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  const keys = headers.length > 0 ? headers : [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    const an = numericCell(av);
    const bn = numericCell(bv);
    if (an !== null && bn !== null) {
      out[k] = formatSum(an + bn);
    } else if (
      (av === undefined || av === null || av === "") &&
      bv !== undefined &&
      bv !== null &&
      bv !== ""
    ) {
      out[k] = bv;
    }
  }
  return out;
}

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
function getSupabaseFromContext(ctx: {
  supabase: unknown;
}): // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    type Row = Record<string, unknown>;

    // Resolve every report row against riders already on file. A rider is
    // keyed by an Iqama number and/or a separate ID number — established up
    // front via the rider-directory sheet, or the first time they appear in
    // any report. A monthly report row only has to carry ONE of those
    // numbers: matchRider() finds the existing rider by either, so an
    // ID-only report still lands on the right person instead of minting a
    // duplicate. A monthly report is never the authority on identity, so an
    // existing name/number is left untouched and only blank fields get
    // backfilled — the directory owns name/photo/extra data.
    const { data: existingRaw } = await supabase
      .from("riders")
      .select("id, iqama_number, id_number, rider_name")
      .eq("company_id", companyId);
    const existingRiders = (existingRaw ?? []) as RiderIdentity[];
    const riderIndex = indexRiders(existingRiders);
    const existingById = new Map(existingRiders.map((r) => [r.id, r]));

    interface Resolved {
      riderId: string | null;
      iqama: string | null;
      idNumber: string | null;
      name: string | null;
      row: Row;
    }
    // When the same rider shows up on more than one row of the same sheet
    // (e.g. one line per shift), the rows are merged into a single record:
    // plain numeric columns are added together, and a blank cell is filled
    // from a later row that has a value. So orders 5 + orders 6 becomes 11.
    const resolvedByKey = new Map<string, Resolved>();
    let malformed = 0;
    for (const row of data.rows) {
      const rawIqama0 = cellText(row, data.iqamaColumn);
      const rawId0 = cellText(row, data.idColumn);
      const rawIqama = rawIqama0 && looksLikeIdentifier(rawIqama0) ? rawIqama0 : null;
      const rawId = rawId0 && looksLikeIdentifier(rawId0) ? rawId0 : null;
      if (!rawIqama && !rawId) {
        if (rawIqama0 || rawId0) malformed++;
        continue;
      }
      const name = cellText(row, data.nameColumn);
      const match = matchRider(riderIndex, rawIqama, rawId);
      const dedupKey = match ? `r:${match.id}` : `n:${rawIqama ?? ""}|${rawId ?? ""}`;
      const prev = resolvedByKey.get(dedupKey);
      if (prev) {
        prev.row = mergeReportRows(prev.row, row, data.headers);
        prev.name ??= name;
        prev.iqama ??= rawIqama;
        prev.idNumber ??= rawId;
      } else {
        resolvedByKey.set(dedupKey, {
          riderId: match?.id ?? null,
          iqama: rawIqama,
          idNumber: rawId,
          name,
          row: { ...row },
        });
      }
    }
    const resolvedRows = [...resolvedByKey.values()];

    if (resolvedRows.length === 0 && malformed > 0) {
      // Nothing usable in the sheet — undo the report row we created above so
      // it doesn't linger empty.
      await supabase.from("reports").delete().eq("id", report.id);
      if (data.storagePath) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from("reports").remove([data.storagePath]);
      }
      throw new Error(
        "الملف مش متقسّم لأعمدة صح — تأكد إن رقم الإقامة/الـ ID كل واحد في عمود مستقل (Excel) أو مفصول بفاصلة (CSV).",
      );
    }

    // Backfill blank identity fields on matched riders, batched into one
    // upsert-by-id instead of one UPDATE per row — a first-time ID backfill
    // across a large company can touch hundreds of rows, and awaiting them
    // serially is slow enough to blow the serverless function's time limit.
    const patchPayload: {
      id: string;
      company_id: string;
      iqama_number: string | null;
      id_number: string | null;
      rider_name: string | null;
    }[] = [];
    for (const r of resolvedRows) {
      if (!r.riderId) continue;
      const ex = existingById.get(r.riderId)!;
      const nextIqama = ex.iqama_number ?? r.iqama;
      const nextId = ex.id_number ?? r.idNumber;
      const nextName = ex.rider_name ?? r.name;
      if (nextIqama !== ex.iqama_number || nextId !== ex.id_number || nextName !== ex.rider_name) {
        patchPayload.push({
          id: r.riderId,
          company_id: companyId,
          iqama_number: nextIqama,
          id_number: nextId,
          rider_name: nextName,
        });
      }
    }
    // Rows written to the DB in one call — kept modest so no single request
    // is large enough to trip a body-size or gateway timeout on a big sheet.
    const WRITE_CHUNK = 300;

    for (let i = 0; i < patchPayload.length; i += WRITE_CHUNK) {
      const slice = patchPayload.slice(i, i + WRITE_CHUNK);
      const { error } = await supabase.from("riders").upsert(slice, { onConflict: "id" });
      if (error) throw new Error(error.message);
    }

    // Create riders seen for the first time. A row carrying only an ID
    // becomes an ID-only rider (iqama_number stays null) rather than
    // stuffing the ID into the Iqama column. `.select()` on the write hands
    // back the generated ids directly — no separate re-read (a `.in()` over
    // hundreds of numbers builds a URL long enough to be rejected).
    const newRows = resolvedRows.filter((r) => !r.riderId);
    if (newRows.length > 0) {
      const withIqama = newRows.filter((r) => r.iqama);
      const idOnly = newRows.filter((r) => !r.iqama);
      const createdList: RiderIdentity[] = [];

      for (let i = 0; i < withIqama.length; i += WRITE_CHUNK) {
        const slice = withIqama.slice(i, i + WRITE_CHUNK);
        const { data: c, error } = await supabase
          .from("riders")
          .upsert(
            slice.map((r) => ({
              company_id: companyId,
              iqama_number: r.iqama,
              id_number: r.idNumber,
              rider_name: r.name,
            })),
            { onConflict: "company_id,iqama_number", ignoreDuplicates: false },
          )
          .select("id, iqama_number, id_number");
        if (error) throw new Error(error.message);
        createdList.push(...((c ?? []) as RiderIdentity[]));
      }

      for (let i = 0; i < idOnly.length; i += WRITE_CHUNK) {
        const slice = idOnly.slice(i, i + WRITE_CHUNK);
        const { data: c, error } = await supabase
          .from("riders")
          .insert(
            slice.map((r) => ({
              company_id: companyId,
              iqama_number: null,
              id_number: r.idNumber,
              rider_name: r.name,
            })),
          )
          .select("id, iqama_number, id_number");
        if (error) throw new Error(error.message);
        createdList.push(...((c ?? []) as RiderIdentity[]));
      }

      const createdIndex = indexRiders(createdList);
      for (const r of resolvedRows) {
        if (r.riderId) continue;
        const m = matchRider(createdIndex, r.iqama, r.idNumber);
        if (m) r.riderId = m.id;
      }
    }

    const riderReportsPayload = resolvedRows
      .map((r) => {
        if (!r.riderId) return null;
        return {
          company_id: companyId,
          report_id: report.id,
          rider_id: r.riderId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: r.row as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          columns: data.headers as any,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    for (let i = 0; i < riderReportsPayload.length; i += WRITE_CHUNK) {
      const chunk = riderReportsPayload.slice(i, i + WRITE_CHUNK);
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
    let rosterFileName: string | null = null;
    let rosterUploadedAt: string | null = null;
    if (companyId) {
      const { data } = await supabase
        .from("companies")
        .select("name, logo_url, is_suspended, roster_file_name, roster_uploaded_at")
        .eq("id", companyId)
        .maybeSingle();
      companyName = (data?.name as string | undefined) ?? null;
      companyLogoUrl = (data?.logo_url as string | undefined) ?? null;
      isSuspended = (data?.is_suspended as boolean | undefined) ?? false;
      rosterFileName = (data?.roster_file_name as string | undefined) ?? null;
      rosterUploadedAt = (data?.roster_uploaded_at as string | undefined) ?? null;
    }
    return {
      isAdmin: isSuperAdmin || !!companyId,
      isSuperAdmin,
      companyId,
      rosterFileName,
      rosterUploadedAt,
      companyName,
      companyLogoUrl,
      isSuspended,
      userId,
    };
  });
