import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
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

// Lay one upload's row on top of what's already stored for that rider in a
// month (the "merge another sheet" flow — a distances sheet + a ratings
// sheet, etc.). Any non-blank incoming cell wins; blank incoming cells keep
// the stored value, so re-uploading a partial sheet never wipes data.
function overlayReportRows(
  stored: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...stored };
  for (const [k, v] of Object.entries(incoming)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}

function unionColumns(a: unknown, b: string[]): string[] {
  const base = Array.isArray(a) ? (a as unknown[]).map(String) : [];
  const seen = new Set(base);
  const merged = [...base];
  for (const c of b) {
    if (!seen.has(c)) {
      seen.add(c);
      merged.push(c);
    }
  }
  return merged;
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
    // null means a whole-month report (the monthly reports page) — no
    // specific day, same as every report before the daily feature existed.
    day: z.number().int().min(1).max(31).nullable(),
    fileName: z.string().min(1),
    storagePath: z.string().nullable(),
    headers: z.array(z.string()),
    iqamaColumn: z.string().nullable(),
    idColumn: z.string().nullable(),
    nameColumn: z.string().nullable(),
    rows: z.array(RowSchema),
    // "new"     -> fail if a report already exists for this day/month
    // "replace" -> drop the existing one and start fresh
    // "merge"   -> keep it, add this sheet's columns onto each rider's row
    mode: z.enum(["new", "replace", "merge"]).optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((d) => d.iqamaColumn || d.idColumn, {
    message: "لازم عمود رقم إقامة أو ID على الأقل",
  })
  .refine(
    (d) => {
      if (d.day === null) return true;
      const date = new Date(Date.UTC(d.year, d.month - 1, d.day));
      return (
        date.getUTCFullYear() === d.year &&
        date.getUTCMonth() === d.month - 1 &&
        date.getUTCDate() === d.day
      );
    },
    { message: "التاريخ غير صحيح" },
  );

async function getCallerCompany(
  supabase: ReturnType<typeof getSupabaseFromContext>,
  userId: string,
) {
  const { data: isSuper } = await supabase.rpc("is_super_admin", { _user_id: userId });
  const { data: companyId } = await supabase.rpc("get_user_company", { _user_id: userId });
  return { isSuperAdmin: !!isSuper, companyId: (companyId as string | null) ?? null };
}

// Resolves the caller's company for the Reports feature specifically.
// Unlike getCallerCompany/resolveActiveCompany (admin-only), this also
// accepts a staff account (role 'user') whose reports_access is 'full' —
// reports are never area-scoped (one sheet covers every area at once), so
// unlike documents/riders/letters there's no allowed_areas check here.
export async function resolveReportsCompany(
  supabase: ReturnType<typeof getSupabaseFromContext>,
  userId: string,
): Promise<string> {
  const { data: companyId } = await supabase.rpc("get_member_company", { _user_id: userId });
  if (!companyId) {
    throw new Error("هذا الحساب غير مرتبط بشركة، لا يمكن رفع تقارير");
  }
  const { data: isActive } = await supabase.rpc("is_company_active", {
    _company_id: companyId,
  });
  if (!isActive) {
    throw new Error("هذا الحساب موقوف مؤقتًا من قبل الإدارة، تواصل معهم لإعادة التفعيل");
  }
  // Checked explicitly (not just left to RLS) because uploadReport writes
  // riders through the service client, which bypasses the plan's policies.
  const { data: planAccess } = await supabase.rpc("get_company_plan_reports_access", {
    _company_id: companyId,
  });
  if (planAccess !== "full") {
    throw new Error("غير مصرح: باقة الشركة لا تتيح رفع التقارير وإدارتها");
  }
  const { data: role } = await supabase.rpc("get_member_role", { _user_id: userId });
  if (role === "user") {
    const { data: access } = await supabase.rpc("get_member_reports_access", {
      _user_id: userId,
    });
    if (access !== "full") {
      throw new Error("غير مصرح: صلاحيتك على التقارير للعرض فقط");
    }
  }
  return companyId as string;
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
    const companyId = await resolveReportsCompany(supabase, userId);
    // Uploading a report also creates/backfills the company's riders, which a
    // plan or staff account without the Riders page couldn't do under RLS.
    // resolveReportsCompany has already authorized the caller for this
    // company, so every riders query below is scoped to it explicitly.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check for an existing report for this exact day (or, for a monthly
    // report, this exact month) within this company. .eq() with a literal
    // null is unreliable across supabase-js/PostgREST versions, so a null
    // day is matched with .is() instead.
    let existingQuery = supabase
      .from("reports")
      .select("id, storage_path")
      .eq("company_id", companyId)
      .eq("month", data.month)
      .eq("year", data.year);
    existingQuery =
      data.day === null ? existingQuery.is("day", null) : existingQuery.eq("day", data.day);
    const { data: existing } = await existingQuery.maybeSingle();

    const mode = data.mode ?? "new";
    const mergeIntoExisting = !!existing && mode === "merge";

    if (existing && mode === "new") {
      throw new Error(
        data.day === null
          ? "يوجد تقرير لهذا الشهر بالفعل. اختر «استبدال» أو «دمج مع الموجود»."
          : "يوجد تقرير لهذا اليوم بالفعل. اختر «استبدال» أو «دمج مع الموجود».",
      );
    }
    if (existing && mode === "replace") {
      // Deleting the report row cascades its sheets and rider rows, but the
      // stored files stay behind unless removed explicitly.
      const { data: oldSheets } = await supabase
        .from("report_sheets")
        .select("storage_path")
        .eq("report_id", existing.id);
      const orphans = [
        existing.storage_path,
        ...(oldSheets ?? []).map((s) => s.storage_path),
      ].filter((p): p is string => !!p);
      if (orphans.length > 0) {
        await supabaseAdmin.storage.from("reports").remove(orphans);
      }
      await supabase.from("reports").delete().eq("id", existing.id);
    }

    let report: { id: string };
    if (mergeIntoExisting) {
      report = { id: existing!.id };
      if (data.note?.trim()) {
        await supabase.from("reports").update({ note: data.note.trim() }).eq("id", report.id);
      }
    } else {
      const { data: created, error: reportErr } = await supabase
        .from("reports")
        .insert({
          company_id: companyId,
          month: data.month,
          year: data.year,
          day: data.day,
          file_name: data.fileName,
          storage_path: data.storagePath,
          uploaded_by: userId,
          rider_count: 0,
          note: data.note?.trim() || null,
          // The live table also carries a legacy `title` column (outside
          // this app's own schema/migrations) with a NOT NULL unique
          // constraint on (company_id, month, year, title) — every row
          // left at its shared default collided the moment a second day
          // was uploaded in the same month, regardless of `day`. This app
          // never reads `title` anywhere; giving it a day-specific value
          // (or, for a monthly report, a fixed "monthly" suffix — there's
          // only ever one of those per company/month/year) just keeps every
          // row distinct so that legacy constraint never fires.
          title:
            data.day === null
              ? `${data.year}-${String(data.month).padStart(2, "0")}-monthly`
              : `${data.year}-${String(data.month).padStart(2, "0")}-${String(data.day).padStart(2, "0")}`,
        })
        .select("id")
        .single();
      if (reportErr || !created) {
        // 23505 = unique_violation — the "existing" lookup above missed it
        // (e.g. a second submission landing moments after the first one
        // already committed), so this is still genuinely "a report for this
        // day already exists," just caught at the database instead of
        // upfront. Surfacing the raw Postgres message here would otherwise
        // leak straight to the admin instead of the same clear choice the
        // upfront check already gives them.
        if (reportErr?.code === "23505") {
          throw new Error(
            data.day === null
              ? "يوجد تقرير لهذا الشهر بالفعل. اختر «استبدال» أو «دمج مع الموجود»."
              : "يوجد تقرير لهذا اليوم بالفعل. اختر «استبدال» أو «دمج مع الموجود».",
          );
        }
        throw new Error(reportErr?.message ?? "فشل إنشاء التقرير");
      }
      report = created;
    }

    type Row = Record<string, unknown>;

    // Everything from here on can fail partway through (a bad sheet, a
    // write error, a timeout) after the `reports` row above was already
    // created fresh this call — without this, a failed upload would leave
    // that empty row behind, permanently blocking any future "new" upload
    // for the same day with a false "already exists" (the row is real, it
    // just never finished). The catch below undoes exactly that row (never
    // one we were only merging into) so a failed attempt can always be
    // retried cleanly.
    try {
      // Resolve every report row against riders already on file. A rider is
      // keyed by an Iqama number and/or a separate ID number — established up
      // front via the rider-directory sheet, or the first time they appear in
      // any report. A monthly report row only has to carry ONE of those
      // numbers: matchRider() finds the existing rider by either, so an
      // ID-only report still lands on the right person instead of minting a
      // duplicate. A monthly report is never the authority on identity, so an
      // existing name/number is left untouched and only blank fields get
      // backfilled — the directory owns name/photo/extra data.
      const { data: existingRaw } = await supabaseAdmin
        .from("riders")
        .select("id, iqama_number, id_number, rider_name")
        .eq("company_id", companyId)
        .is("deleted_at", null);
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
        // Nothing usable in the sheet — the outer catch below undoes the
        // report row it just created (never one we were only merging into).
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
        if (
          nextIqama !== ex.iqama_number ||
          nextId !== ex.id_number ||
          nextName !== ex.rider_name
        ) {
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
        const { error } = await supabaseAdmin.from("riders").upsert(slice, { onConflict: "id" });
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
          const { data: c, error } = await supabaseAdmin
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
          const { data: c, error } = await supabaseAdmin
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

      const withRider = resolvedRows.filter(
        (r): r is Resolved & { riderId: string } => !!r.riderId,
      );

      // Record this upload as one sheet of the month's report.
      const { data: sheet, error: sheetErr } = await supabase
        .from("report_sheets")
        .insert({
          report_id: report.id,
          company_id: companyId,
          file_name: data.fileName,
          storage_path: data.storagePath,
          headers: data.headers as Json,
          rider_count: withRider.length,
        })
        .select("id")
        .single();
      if (sheetErr || !sheet) throw new Error(sheetErr?.message ?? "فشل تسجيل الشيت");
      const sheetId: string = sheet.id;
      // Only the cells this sheet actually filled are attributed to it, so
      // deleting the sheet later strips exactly those columns and no others.
      const sourcesFor = (row: Row): Record<string, string> => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          if (v !== undefined && v !== null && v !== "") out[k] = sheetId;
        }
        return out;
      };

      if (mergeIntoExisting) {
        // Pull the rows this month already has for the riders in this sheet,
        // then lay the new columns on top (or insert a fresh row for a rider
        // who wasn't in the earlier sheet).
        const riderIds = withRider.map((r) => r.riderId);
        const existingRR = new Map<
          string,
          {
            id: string;
            data: Record<string, unknown>;
            columns: unknown;
            column_sources: Record<string, string>;
          }
        >();
        for (let i = 0; i < riderIds.length; i += 200) {
          const slice = riderIds.slice(i, i + 200);
          const { data: rows, error } = await supabase
            .from("rider_reports")
            .select("id, rider_id, data, columns, column_sources")
            .eq("report_id", report.id)
            .in("rider_id", slice);
          if (error) throw new Error(error.message);
          for (const row of rows ?? []) {
            existingRR.set(row.rider_id, {
              id: row.id,
              data: (row.data ?? {}) as Record<string, unknown>,
              columns: row.columns,
              column_sources: (row.column_sources ?? {}) as Record<string, string>,
            });
          }
        }

        type RRRow = {
          company_id: string;
          report_id: string;
          rider_id: string;
          data: Json;
          columns: Json;
          column_sources: Json;
        };
        const updates: (RRRow & { id: string })[] = [];
        const inserts: RRRow[] = [];
        for (const r of withRider) {
          const ex = existingRR.get(r.riderId);
          const base: RRRow = {
            company_id: companyId,
            report_id: report.id,
            rider_id: r.riderId,
            data: (ex ? overlayReportRows(ex.data, r.row) : r.row) as Json,
            columns: (ex ? unionColumns(ex.columns, data.headers) : data.headers) as Json,
            column_sources: (ex
              ? { ...ex.column_sources, ...sourcesFor(r.row) }
              : sourcesFor(r.row)) as Json,
          };
          if (ex) updates.push({ ...base, id: ex.id });
          else inserts.push(base);
        }

        for (let i = 0; i < updates.length; i += WRITE_CHUNK) {
          const { error } = await supabase
            .from("rider_reports")
            .upsert(updates.slice(i, i + WRITE_CHUNK), { onConflict: "id" });
          if (error) throw new Error(error.message);
        }
        for (let i = 0; i < inserts.length; i += WRITE_CHUNK) {
          const { error } = await supabase
            .from("rider_reports")
            .insert(inserts.slice(i, i + WRITE_CHUNK));
          if (error) throw new Error(error.message);
        }

        const { count } = await supabase
          .from("rider_reports")
          .select("id", { count: "exact", head: true })
          .eq("report_id", report.id);
        await supabase
          .from("reports")
          .update({ rider_count: count ?? 0 })
          .eq("id", report.id);

        return { reportId: report.id, count: withRider.length, merged: true, sheetId };
      }

      const riderReportsPayload = withRider.map((r) => ({
        company_id: companyId,
        report_id: report.id,
        rider_id: r.riderId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: r.row as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        columns: data.headers as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        column_sources: sourcesFor(r.row) as any,
      }));

      for (let i = 0; i < riderReportsPayload.length; i += WRITE_CHUNK) {
        const chunk = riderReportsPayload.slice(i, i + WRITE_CHUNK);
        const { error } = await supabase.from("rider_reports").insert(chunk);
        if (error) throw new Error(error.message);
      }

      await supabase
        .from("reports")
        .update({ rider_count: riderReportsPayload.length })
        .eq("id", report.id);

      return { reportId: report.id, count: riderReportsPayload.length, merged: false, sheetId };
    } catch (err) {
      if (!mergeIntoExisting) {
        await supabase.from("reports").delete().eq("id", report.id);
        if (data.storagePath) {
          await supabaseAdmin.storage.from("reports").remove([data.storagePath]);
        }
      }
      throw err;
    }
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
    const { data: sheets } = await supabase
      .from("report_sheets")
      .select("storage_path")
      .eq("report_id", data.id);
    const paths = [rep?.storage_path, ...(sheets ?? []).map((s) => s.storage_path)].filter(
      (p): p is string => !!p,
    );
    if (paths.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("reports").remove(paths);
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

// Delete one sheet from a month's report: strip the columns it contributed
// from every rider row, drop any rider left with an empty row, and remove
// the whole month's report if that was its last sheet.
export const deleteReportSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sheetId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sheet } = await supabase
      .from("report_sheets")
      .select("id, report_id, storage_path")
      .eq("id", data.sheetId)
      .maybeSingle();
    if (!sheet) throw new Error("الشيت غير موجود أو لا يتبع شركتك");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: siblings } = await supabase
      .from("report_sheets")
      .select("id, file_name, storage_path")
      .eq("report_id", sheet.report_id);
    const others = (siblings ?? []).filter((s) => s.id !== data.sheetId);

    // Last sheet — the whole month's report goes with it.
    if (others.length === 0) {
      const { data: rep } = await supabase
        .from("reports")
        .select("storage_path")
        .eq("id", sheet.report_id)
        .maybeSingle();
      const paths = [rep?.storage_path, sheet.storage_path].filter((p): p is string => !!p);
      if (paths.length > 0) await supabaseAdmin.storage.from("reports").remove(paths);
      const { data: del, error } = await supabase
        .from("reports")
        .delete()
        .eq("id", sheet.report_id)
        .select("id");
      if (error) throw new Error(error.message);
      if (!del || del.length === 0) {
        throw new Error("لم يتم الحذف — تأكد أن التقرير يتبع شركتك");
      }
      return { deletedReport: true, removed: 0 };
    }

    const { data: rrRows, error: rrErr } = await supabase
      .from("rider_reports")
      .select("id, rider_id, report_id, company_id, data, columns, column_sources")
      .eq("report_id", sheet.report_id);
    if (rrErr) throw new Error(rrErr.message);

    const updates: {
      id: string;
      rider_id: string;
      report_id: string;
      company_id: string;
      data: Json;
      columns: Json;
      column_sources: Json;
    }[] = [];
    const removeIds: string[] = [];
    for (const rr of rrRows ?? []) {
      const sources = (rr.column_sources ?? {}) as Record<string, string>;
      const oldData = (rr.data ?? {}) as Record<string, unknown>;
      const nextData: Record<string, unknown> = {};
      const nextSources: Record<string, string> = {};
      for (const [k, v] of Object.entries(oldData)) {
        if (sources[k] === data.sheetId) continue;
        nextData[k] = v;
        if (sources[k]) nextSources[k] = sources[k];
      }
      const hasValue = Object.values(nextData).some(
        (v) => v !== undefined && v !== null && v !== "",
      );
      if (!hasValue) {
        removeIds.push(rr.id);
        continue;
      }
      const oldCols = Array.isArray(rr.columns) ? (rr.columns as unknown[]).map(String) : [];
      updates.push({
        id: rr.id,
        rider_id: rr.rider_id,
        report_id: rr.report_id,
        company_id: rr.company_id,
        data: nextData as Json,
        columns: oldCols.filter((c) => c in nextData) as Json,
        column_sources: nextSources as Json,
      });
    }

    const CHUNK = 300;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const { error } = await supabase
        .from("rider_reports")
        .upsert(updates.slice(i, i + CHUNK), { onConflict: "id" });
      if (error) throw new Error(error.message);
    }
    for (let i = 0; i < removeIds.length; i += CHUNK) {
      const { error } = await supabase
        .from("rider_reports")
        .delete()
        .in("id", removeIds.slice(i, i + CHUNK));
      if (error) throw new Error(error.message);
    }

    if (sheet.storage_path) {
      await supabaseAdmin.storage.from("reports").remove([sheet.storage_path]);
    }
    await supabase.from("report_sheets").delete().eq("id", data.sheetId);

    // Keep reports.storage_path/file_name pointing at a sheet that still exists.
    const { data: rep } = await supabase
      .from("reports")
      .select("storage_path")
      .eq("id", sheet.report_id)
      .maybeSingle();
    if (rep && rep.storage_path === sheet.storage_path) {
      const fallback = others.find((s) => s.storage_path) ?? others[0];
      await supabase
        .from("reports")
        .update({ storage_path: fallback.storage_path ?? null, file_name: fallback.file_name })
        .eq("id", sheet.report_id);
    }

    const { count } = await supabase
      .from("rider_reports")
      .select("id", { count: "exact", head: true })
      .eq("report_id", sheet.report_id);
    await supabase
      .from("reports")
      .update({ rider_count: count ?? 0 })
      .eq("id", sheet.report_id);

    return { deletedReport: false, removed: removeIds.length };
  });

type Tier = "none" | "view" | "full";
type DocTier = "none" | "view_only" | "full";
const TIER_RANK: Record<string, number> = { none: 0, view: 1, view_only: 1, full: 2 };
function minTier<T extends string>(a: T, b: T): T {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // getCallerCompany is also used to gate real authorization elsewhere
    // (report uploads, roster uploads, ...) and must stay admin-only, so
    // staff detection is done here instead, as a separate, additive check
    // that only affects what this client-facing "who am I" endpoint reports.
    const { isSuperAdmin, companyId: adminCompanyId } = await getCallerCompany(supabase, userId);

    // Own row only ("Users can read their own roles" RLS policy) — used for
    // the "Hello, <name>" greeting and the staff self-service account page.
    // Most rows (companies created before this feature, or a real admin who
    // never set one) simply have no name yet.
    const { data: myRoleRow } = await supabase
      .from("user_roles")
      .select("display_name, expiry_notify_days")
      .eq("user_id", userId)
      .maybeSingle();
    const displayName = (myRoleRow?.display_name as string | null) ?? null;
    const personalExpiryNotifyDays = (myRoleRow?.expiry_notify_days as number | null) ?? null;

    let companyId = adminCompanyId;
    let isStaff = false;
    let overviewAccess = true;
    let ridersAccess: Tier = "full";
    let ridersDeleteAccess = true;
    let ridersBlockAccess = true;
    let reportsAccess: Tier = "full";
    let documentsAccess: DocTier = "full";
    let lettersAccess: Tier = "full";
    let allowedAreas: string[] | null = null;
    let notificationsAccess = true;
    // Plan-only sub-toggles (no per-staff permission exists for either —
    // the super admin controls these per company, same shape as
    // operatingCardsAccess/expiryAlertsAccess below) that independently
    // show/hide just the DAILY variant of Reports/Overview; the base
    // reportsAccess/overviewAccess above still gates the whole nav group
    // (including the monthly variant).
    let reportsDailyAccess = true;
    let overviewDailyAccess = true;
    let operatingCardsAccess = true;
    let operatingCardsUploadAccess = true;
    let operatingCardsExportAccess = true;
    let operatingCardsDeleteAccess = true;
    let expiryAlertsAccess = true;
    // Users and Company Profile are never a staff permission — a staff
    // account simply never sees them, so these two only ever matter for a
    // real company admin (gated below by the plan).
    let usersAccess = true;
    let companyProfileAccess = true;

    if (!isSuperAdmin && !companyId) {
      const { data: memberCompanyId } = await supabase.rpc("get_member_company", {
        _user_id: userId,
      });
      if (memberCompanyId) {
        companyId = memberCompanyId as string;
        isStaff = true;
        const [
          { data: overview },
          { data: riders },
          { data: ridersDelete },
          { data: ridersBlock },
          { data: reports },
          { data: documents },
          { data: letters },
          { data: notifications },
          { data: operatingCards },
          { data: operatingCardsUpload },
          { data: operatingCardsExport },
          { data: operatingCardsDelete },
          { data: expiryAlerts },
          { data: areas },
        ] = await Promise.all([
          supabase.rpc("get_member_overview_access", { _user_id: userId }),
          supabase.rpc("get_member_riders_access", { _user_id: userId }),
          supabase.rpc("get_member_riders_delete_access", { _user_id: userId }),
          supabase.rpc("get_member_riders_block_access", { _user_id: userId }),
          supabase.rpc("get_member_reports_access", { _user_id: userId }),
          supabase.rpc("get_member_documents_access", { _user_id: userId }),
          supabase.rpc("get_member_letters_access", { _user_id: userId }),
          supabase.rpc("get_member_notifications_access", { _user_id: userId }),
          supabase.rpc("get_member_operating_cards_access", { _user_id: userId }),
          supabase.rpc("get_member_operating_cards_upload_access", { _user_id: userId }),
          supabase.rpc("get_member_operating_cards_export_access", { _user_id: userId }),
          supabase.rpc("get_member_operating_cards_delete_access", { _user_id: userId }),
          supabase.rpc("get_member_expiry_alerts_access", { _user_id: userId }),
          supabase.rpc("get_member_allowed_areas", { _user_id: userId }),
        ]);
        overviewAccess = !!overview;
        ridersAccess = (riders as Tier | null) ?? "none";
        ridersDeleteAccess = !!ridersDelete;
        ridersBlockAccess = !!ridersBlock;
        reportsAccess = (reports as Tier | null) ?? "none";
        documentsAccess = (documents as DocTier | null) ?? "none";
        lettersAccess = (letters as Tier | null) ?? "none";
        notificationsAccess = !!notifications;
        operatingCardsAccess = !!operatingCards;
        operatingCardsUploadAccess = !!operatingCardsUpload;
        operatingCardsExportAccess = !!operatingCardsExport;
        operatingCardsDeleteAccess = !!operatingCardsDelete;
        expiryAlertsAccess = !!expiryAlerts;
        allowedAreas = (areas as string[] | null) ?? null;
      }
    }

    let companyName: string | null = null;
    let companyLogoUrl: string | null = null;
    let isSuspended = false;
    let rosterFileName: string | null = null;
    let rosterUploadedAt: string | null = null;
    let companyExpiryNotifyDays = 30;
    if (companyId) {
      const { data } = await supabase
        .from("companies")
        .select(
          "name, logo_url, is_suspended, roster_file_name, roster_uploaded_at, plan_overview_access, plan_overview_daily_access, plan_riders_access, plan_reports_access, plan_reports_daily_access, plan_documents_access, plan_letters_access, plan_notifications_access, plan_users_access, plan_company_profile_access, plan_operating_cards_access, plan_expiry_alerts_access, expiry_notify_days",
        )
        .eq("id", companyId)
        .maybeSingle();
      companyName = (data?.name as string | undefined) ?? null;
      companyLogoUrl = (data?.logo_url as string | undefined) ?? null;
      isSuspended = (data?.is_suspended as boolean | undefined) ?? false;
      rosterFileName = (data?.roster_file_name as string | undefined) ?? null;
      rosterUploadedAt = (data?.roster_uploaded_at as string | undefined) ?? null;
      companyExpiryNotifyDays = (data?.expiry_notify_days as number | undefined) ?? 30;

      // The company's plan is the ceiling on what anyone in it can reach —
      // a real admin's access IS the plan (they carry no personal
      // restriction of their own), while a staff account's access is
      // whichever is narrower between their personal permission and the
      // company's plan, so a restricted-plan company can't be routed
      // around by handing a staff member broader personal permissions.
      const planOverview = (data?.plan_overview_access as boolean | undefined) ?? false;
      const planOverviewDaily = (data?.plan_overview_daily_access as boolean | undefined) ?? true;
      const planRiders = (data?.plan_riders_access as Tier | undefined) ?? "none";
      const planReports = (data?.plan_reports_access as Tier | undefined) ?? "none";
      const planReportsDaily = (data?.plan_reports_daily_access as boolean | undefined) ?? true;
      const planDocuments = (data?.plan_documents_access as DocTier | undefined) ?? "none";
      const planLetters = (data?.plan_letters_access as Tier | undefined) ?? "none";
      const planNotifications = (data?.plan_notifications_access as boolean | undefined) ?? true;
      const planUsers = (data?.plan_users_access as boolean | undefined) ?? true;
      const planCompanyProfile = (data?.plan_company_profile_access as boolean | undefined) ?? true;
      const planOperatingCards = (data?.plan_operating_cards_access as boolean | undefined) ?? true;
      const planExpiryAlerts = (data?.plan_expiry_alerts_access as boolean | undefined) ?? true;
      if (isStaff) {
        overviewAccess = overviewAccess && planOverview;
        overviewDailyAccess = overviewDailyAccess && planOverviewDaily;
        ridersAccess = minTier(ridersAccess, planRiders);
        reportsAccess = minTier(reportsAccess, planReports);
        reportsDailyAccess = reportsDailyAccess && planReportsDaily;
        documentsAccess = minTier(documentsAccess, planDocuments);
        lettersAccess = minTier(lettersAccess, planLetters);
        notificationsAccess = notificationsAccess && planNotifications;
        operatingCardsAccess = operatingCardsAccess && planOperatingCards;
        expiryAlertsAccess = expiryAlertsAccess && planExpiryAlerts;
        // Staff never has these two regardless of plan — nothing to
        // intersect, just make sure the returned value reflects reality.
        usersAccess = false;
        companyProfileAccess = false;
      } else if (!isSuperAdmin) {
        overviewAccess = planOverview;
        overviewDailyAccess = planOverviewDaily;
        ridersAccess = planRiders;
        reportsAccess = planReports;
        reportsDailyAccess = planReportsDaily;
        documentsAccess = planDocuments;
        lettersAccess = planLetters;
        notificationsAccess = planNotifications;
        usersAccess = planUsers;
        companyProfileAccess = planCompanyProfile;
        operatingCardsAccess = planOperatingCards;
        expiryAlertsAccess = planExpiryAlerts;
      }
    }
    // Deleting/blocking a rider outright is never something the company plan
    // restricts on its own — each is a per-staff-member permission,
    // meaningful only once ridersAccess (after the plan ceiling above) is
    // 'full'. A real admin (or the super admin) always has both.
    const canDeleteRiders =
      isSuperAdmin || (!isStaff && !!companyId) || (ridersAccess === "full" && ridersDeleteAccess);
    const canBlockRiders =
      isSuperAdmin || (!isStaff && !!companyId) || (ridersAccess === "full" && ridersBlockAccess);
    // A personal override always wins over the company's default — set once
    // in the company profile, and only ever a fallback for a user who never
    // set their own.
    const expiryNotifyDays = personalExpiryNotifyDays ?? companyExpiryNotifyDays;
    return {
      isAdmin: isSuperAdmin || !!companyId,
      isSuperAdmin,
      isStaff,
      displayName,
      overviewAccess,
      overviewDailyAccess,
      ridersAccess,
      canDeleteRiders,
      canBlockRiders,
      reportsAccess,
      reportsDailyAccess,
      documentsAccess,
      lettersAccess,
      notificationsAccess,
      operatingCardsAccess,
      operatingCardsUploadAccess,
      operatingCardsExportAccess,
      operatingCardsDeleteAccess,
      expiryAlertsAccess,
      usersAccess,
      companyProfileAccess,
      allowedAreas,
      personalExpiryNotifyDays,
      companyExpiryNotifyDays,
      expiryNotifyDays,
      companyId,
      rosterFileName,
      rosterUploadedAt,
      companyName,
      companyLogoUrl,
      isSuspended,
      userId,
    };
  });
