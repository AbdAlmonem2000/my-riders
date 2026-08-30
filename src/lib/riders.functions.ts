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

// The rider-directory sheet. Photo comes through as a plain link and is
// stored verbatim; every column that isn't one of the recognised ones is
// kept as free-form `extra` data shown on the rider's lookup page.
const RosterInput = z
  .object({
    headers: z.array(z.string()),
    iqamaColumn: z.string().nullable(),
    idColumn: z.string().nullable(),
    nameColumn: z.string().nullable(),
    photoColumn: z.string().nullable(),
    storagePath: z.string().nullable(),
    fileName: z.string().nullable(),
    rows: z.array(RowSchema),
  })
  .refine((d) => d.iqamaColumn || d.idColumn, {
    message: "لازم عمود رقم إقامة أو ID عشان النظام يقدر يحدد كل مندوب",
  });

type ExistingRider = RiderIdentity & {
  photo_url: string | null;
  extra: Record<string, unknown> | null;
};

async function resolveActiveCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<string> {
  const { data: companyId } = await supabase.rpc("get_user_company", { _user_id: userId });
  if (!companyId) {
    throw new Error("هذا الحساب غير مرتبط بشركة");
  }
  const { data: isActive } = await supabase.rpc("is_company_active", {
    _company_id: companyId,
  });
  if (!isActive) {
    throw new Error("هذا الحساب موقوف مؤقتًا من قبل الإدارة، تواصل معهم لإعادة التفعيل");
  }
  return companyId as string;
}

export const uploadRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RosterInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveActiveCompany(supabase, userId);

    const { data: existingRaw } = await supabase
      .from("riders")
      .select("id, iqama_number, id_number, rider_name, photo_url, extra")
      .eq("company_id", companyId);
    const existing = (existingRaw ?? []) as ExistingRider[];
    const index = indexRiders(existing);
    const existingById = new Map(existing.map((r) => [r.id, r]));

    const knownCols = new Set(
      [data.iqamaColumn, data.idColumn, data.nameColumn, data.photoColumn].filter(
        (c): c is string => !!c,
      ),
    );
    const extraCols = data.headers.filter((h) => !knownCols.has(h));

    interface RiderRow {
      company_id: string;
      iqama_number: string | null;
      id_number: string | null;
      rider_name: string | null;
      photo_url: string | null;
      extra: Json;
    }
    const inserts: RiderRow[] = [];
    const updates: (RiderRow & { id: string })[] = [];
    let skipped = 0;
    let malformed = 0;
    const seen = new Set<string>();

    for (const row of data.rows) {
      const iqama0 = cellText(row, data.iqamaColumn);
      const id0 = cellText(row, data.idColumn);
      const iqama = iqama0 && looksLikeIdentifier(iqama0) ? iqama0 : null;
      const id = id0 && looksLikeIdentifier(id0) ? id0 : null;
      // The directory sheet is the one place a rider MUST be identifiable by
      // a number — a nameless/numberless row can't be attached to anyone.
      if (!iqama && !id) {
        if (iqama0 || id0) malformed++;
        else skipped++;
        continue;
      }
      const name = cellText(row, data.nameColumn);
      const photo = cellText(row, data.photoColumn);
      const extra: Record<string, string> = {};
      for (const c of extraCols) {
        const v = cellText(row, c);
        if (v !== null) extra[c] = v;
      }

      const match = matchRider(index, iqama, id);
      const dedupKey = match ? `r:${match.id}` : `n:${iqama ?? ""}|${id ?? ""}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      if (match) {
        const ex = existingById.get(match.id)!;
        updates.push({
          id: match.id,
          company_id: companyId,
          // The directory owns identity: use whatever it provides, but never
          // blank a value it happens not to carry on this row.
          iqama_number: iqama ?? ex.iqama_number,
          id_number: id ?? ex.id_number,
          rider_name: name ?? ex.rider_name,
          photo_url: photo ?? ex.photo_url,
          extra: { ...(ex.extra ?? {}), ...extra } as Json,
        });
      } else {
        inserts.push({
          company_id: companyId,
          iqama_number: iqama,
          id_number: id,
          rider_name: name,
          photo_url: photo,
          extra: extra as Json,
        });
      }
    }

    if (inserts.length === 0 && updates.length === 0 && malformed > 0) {
      throw new Error(
        "الملف مش متقسّم لأعمدة صح — تأكد إن رقم الإقامة/الـ ID كل واحد في عمود مستقل (Excel) أو مفصول بفاصلة (CSV).",
      );
    }

    // Modest chunks so no single write request is large enough to trip a
    // body-size limit or gateway timeout on a big directory sheet.
    const CHUNK = 300;
    let created = 0;
    let updated = 0;
    for (let i = 0; i < inserts.length; i += CHUNK) {
      const chunk = inserts.slice(i, i + CHUNK);
      const { error } = await supabase.from("riders").insert(chunk);
      if (error) throw new Error(error.message);
      created += chunk.length;
    }
    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);
      const { error } = await supabase.from("riders").upsert(chunk, { onConflict: "id" });
      if (error) throw new Error(error.message);
      updated += chunk.length;
    }

    // Keep the raw sheet for re-download, and drop the previous one.
    if (data.storagePath) {
      const { data: prev } = await supabase
        .from("companies")
        .select("roster_path")
        .eq("id", companyId)
        .maybeSingle();
      const { error: coErr } = await supabase
        .from("companies")
        .update({
          roster_path: data.storagePath,
          roster_file_name: data.fileName,
          roster_uploaded_at: new Date().toISOString(),
        })
        .eq("id", companyId);
      if (coErr) throw new Error(coErr.message);
      if (prev?.roster_path && prev.roster_path !== data.storagePath) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from("rosters").remove([prev.roster_path]);
      }
    }

    return { created, updated, skipped: skipped + malformed };
  });

// Removes the stored directory sheet and every rider that only ever came from
// it (no monthly report references them). Report-linked riders are kept.
export const deleteRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveActiveCompany(supabase, userId);

    const { data: co } = await supabase
      .from("companies")
      .select("roster_path")
      .eq("id", companyId)
      .maybeSingle();
    if (co?.roster_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("rosters").remove([co.roster_path]);
    }
    await supabase
      .from("companies")
      .update({ roster_path: null, roster_file_name: null, roster_uploaded_at: null })
      .eq("id", companyId);

    const { data: linkedRaw } = await supabase
      .from("rider_reports")
      .select("rider_id")
      .eq("company_id", companyId);
    const linked = new Set((linkedRaw ?? []).map((r: { rider_id: string }) => r.rider_id));

    const { data: allRaw } = await supabase.from("riders").select("id").eq("company_id", companyId);
    const toDelete = (allRaw ?? [])
      .map((r: { id: string }) => r.id)
      .filter((id: string) => !linked.has(id));

    let deleted = 0;
    const CHUNK = 200;
    for (let i = 0; i < toDelete.length; i += CHUNK) {
      const chunk = toDelete.slice(i, i + CHUNK);
      const { error } = await supabase.from("riders").delete().in("id", chunk);
      if (error) throw new Error(error.message);
      deleted += chunk.length;
    }

    return { deleted };
  });

export const getRosterDownloadUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: companyId } = await supabase.rpc("get_user_company", { _user_id: userId });
    if (!companyId) throw new Error("هذا الحساب غير مرتبط بشركة");

    const { data: co } = await supabase
      .from("companies")
      .select("roster_path, roster_file_name")
      .eq("id", companyId)
      .maybeSingle();
    if (!co?.roster_path) throw new Error("لا يوجد ملف بيانات مناديب محفوظ");

    const { data, error } = await supabase.storage
      .from("rosters")
      .createSignedUrl(co.roster_path, 60, { download: co.roster_file_name ?? "riders.xlsx" });
    if (error || !data) throw new Error(error?.message ?? "تعذر تجهيز رابط التنزيل");
    return { url: data.signedUrl };
  });

// Block / unblock one rider from looking up or viewing their reports.
export const setRiderBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ riderId: z.string().uuid(), blocked: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveActiveCompany(supabase, userId);
    const { data: updated, error } = await supabase
      .from("riders")
      .update({ is_blocked: data.blocked })
      .eq("id", data.riderId)
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("لم يتم تحديث حالة المندوب — تأكد أنه يتبع شركتك");
    }
    return { ok: true };
  });
