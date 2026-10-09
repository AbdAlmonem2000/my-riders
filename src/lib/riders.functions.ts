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
import { fetchAllRows } from "@/lib/supabase-paginate";

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
    areaColumn: z.string().nullable().optional(),
    storagePath: z.string().nullable(),
    fileName: z.string().nullable(),
    rows: z.array(RowSchema),
  })
  .refine((d) => d.iqamaColumn || d.idColumn, {
    message: "لازم عمود رقم إقامة أو ID عشان النظام يقدر يحدد كل مندوب",
  });

type ExistingRider = RiderIdentity & {
  photo_url: string | null;
  area: string | null;
  extra: Record<string, unknown> | null;
};

// Shared by the manual add/edit-rider dialog. A rider must be identifiable
// by at least one number — same rule as every other rider-creating path —
// so a monthly report uploaded later can find and link to this row.
const RiderFieldsInput = z.object({
  iqamaNumber: z.string().nullable(),
  idNumber: z.string().nullable(),
  riderName: z.string().nullable(),
  photoUrl: z.string().nullable(),
  area: z.string().nullable().optional(),
  extra: z.record(z.string(), z.string()).optional(),
});

function normalizeRiderFields(d: z.infer<typeof RiderFieldsInput>) {
  const iqama = d.iqamaNumber?.trim() || null;
  const idNumber = d.idNumber?.trim() || null;
  if (!iqama && !idNumber) {
    throw new Error("لازم رقم إقامة أو ID على الأقل");
  }
  return {
    iqama,
    idNumber,
    name: d.riderName?.trim() || null,
    photo: d.photoUrl?.trim() || null,
    area: d.area?.trim() || null,
    extra: (d.extra ?? {}) as Json,
  };
}

export async function resolveActiveCompany(
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

// Resolves the caller's company for editing/blocking a rider specifically.
// Unlike resolveActiveCompany (admin-only — still used for roster upload,
// creating brand-new riders, and everything else in this file), this also
// accepts a staff account (role 'user') whose riders_access is 'full'.
// Doesn't check allowed_areas itself — that's enforced by the RLS UPDATE
// policy on `riders`, which silently touches 0 rows for an out-of-area
// rider, surfaced below as the same "not found" error a wrong company id
// would give.
//
// requireDelete/requireBlock each additionally require their own dedicated
// permission for a staff account — deleting or blocking a rider is a step
// up from editing one, so a company admin can grant riders_access='full'
// without automatically trusting that staff member to also remove or block
// a rider.
async function resolveRidersCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  options: { requireDelete?: boolean; requireBlock?: boolean } = {},
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
    const { data: access } = await supabase.rpc("get_member_riders_access", {
      _user_id: userId,
    });
    if (access !== "full") {
      throw new Error("غير مصرح: صلاحيتك على المناديب للعرض فقط");
    }
    if (options.requireDelete) {
      const { data: canDelete } = await supabase.rpc("get_member_riders_delete_access", {
        _user_id: userId,
      });
      if (!canDelete) {
        throw new Error("غير مصرح: ليس لديك صلاحية حذف المناديب");
      }
    }
    if (options.requireBlock) {
      const { data: canBlock } = await supabase.rpc("get_member_riders_block_access", {
        _user_id: userId,
      });
      if (!canBlock) {
        throw new Error("غير مصرح: ليس لديك صلاحية منع المناديب");
      }
    }
  }
  return companyId as string;
}

export const uploadRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RosterInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveActiveCompany(supabase, userId);

    // Unpaginated, this would silently miss riders past PostgREST's default
    // row cap for a large roster — matching only `existing` means anyone
    // past the cap would never be recognized, and this exact sheet would
    // re-create them as brand-new duplicate riders instead of updating them.
    const existingRows = await fetchAllRows<{
      id: string;
      iqama_number: string | null;
      id_number: string | null;
      rider_name: string | null;
      photo_url: string | null;
      area: string | null;
      extra: Json;
    }>(({ from, to }) =>
      supabase
        .from("riders")
        .select("id, iqama_number, id_number, rider_name, photo_url, area, extra")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const existing = existingRows as unknown as ExistingRider[];
    const index = indexRiders(existing);
    const existingById = new Map(existing.map((r) => [r.id, r]));

    const knownCols = new Set(
      [data.iqamaColumn, data.idColumn, data.nameColumn, data.photoColumn, data.areaColumn].filter(
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
      area: string | null;
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
      const area = cellText(row, data.areaColumn ?? null);
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
        // A column detected as the area column now (e.g. it wasn't
        // recognised before this rider's row was first uploaded) may still
        // be sitting in the rider's old `extra` under that same header —
        // drop it there now that it lives in its own dedicated field.
        const mergedExtra = { ...(ex.extra ?? {}), ...extra };
        if (data.areaColumn) delete mergedExtra[data.areaColumn];
        updates.push({
          id: match.id,
          company_id: companyId,
          // The directory owns identity: use whatever it provides, but never
          // blank a value it happens not to carry on this row.
          iqama_number: iqama ?? ex.iqama_number,
          id_number: id ?? ex.id_number,
          rider_name: name ?? ex.rider_name,
          photo_url: photo ?? ex.photo_url,
          area: area ?? ex.area,
          extra: mergedExtra as Json,
        });
      } else {
        inserts.push({
          company_id: companyId,
          iqama_number: iqama,
          id_number: id,
          rider_name: name,
          photo_url: photo,
          area,
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

    // Unpaginated, these two selects would silently truncate for a company
    // with enough rider_reports/riders rows to cross PostgREST's default
    // row cap — and since "not in `linked`" is exactly the condition that
    // gets a rider hard-deleted below, a truncated `linked` set would
    // wrongly delete riders who genuinely have report history.
    const linkedRaw = await fetchAllRows<{ rider_id: string }>(({ from, to }) =>
      supabase
        .from("rider_reports")
        .select("rider_id")
        .eq("company_id", companyId)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const linked = new Set(linkedRaw.map((r) => r.rider_id));

    const allRaw = await fetchAllRows<{ id: string }>(({ from, to }) =>
      supabase
        .from("riders")
        .select("id")
        .eq("company_id", companyId)
        .order("id", { ascending: true })
        .range(from, to),
    );
    const toDelete = allRaw.map((r) => r.id).filter((id) => !linked.has(id));

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

// Company admin sets, changes, or clears (empty string) a rider's lookup
// password. Hashing happens in the SECURITY DEFINER RPC.
export const setRiderPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ riderId: z.string().uuid(), password: z.string().max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("admin_set_rider_password", {
      _rider_id: data.riderId,
      _password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true, cleared: data.password.trim() === "" };
  });

// Block / unblock one rider from looking up or viewing their reports.
export const setRiderBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ riderId: z.string().uuid(), blocked: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveRidersCompany(supabase, userId, { requireBlock: true });
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

// Same as setRiderBlocked, applied to a whole selection at once — used by
// the riders page's "select several, then act" bulk toolbar.
export const bulkSetRidersBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ riderIds: z.array(z.string().uuid()).min(1), blocked: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveRidersCompany(supabase, userId, { requireBlock: true });
    const { data: updated, error } = await supabase
      .from("riders")
      .update({ is_blocked: data.blocked })
      .in("id", data.riderIds)
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    return { updated: updated?.length ?? 0 };
  });

// Manually add one rider. It becomes an ordinary row in `riders`, so a
// monthly report uploaded afterwards that carries the same Iqama/ID links to
// it automatically via the same matching every other upload path uses.
export const createRider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RiderFieldsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveActiveCompany(supabase, userId);
    const { iqama, idNumber, name, photo, area, extra } = normalizeRiderFields(data);

    const { data: existingRaw } = await supabase
      .from("riders")
      .select("id, iqama_number, id_number, rider_name")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    const index = indexRiders((existingRaw ?? []) as RiderIdentity[]);
    if (matchRider(index, iqama, idNumber)) {
      throw new Error(
        "مندوب بنفس رقم الإقامة أو الـ ID موجود بالفعل — عدّل عليه بدل إضافته من جديد",
      );
    }

    const { data: created, error } = await supabase
      .from("riders")
      .insert({
        company_id: companyId,
        iqama_number: iqama,
        id_number: idNumber,
        rider_name: name,
        photo_url: photo,
        area,
        extra,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "فشل إضافة المندوب");
    return { id: created.id };
  });

// Manually edit one rider's identity/name/photo/extra fields.
export const updateRider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RiderFieldsInput.extend({ riderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveRidersCompany(supabase, userId);
    const { iqama, idNumber, name, photo, area, extra } = normalizeRiderFields(data);

    // Catch a collision with a *different* rider before hitting the DB
    // constraint, so the error message is clear.
    const { data: existingRaw } = await supabase
      .from("riders")
      .select("id, iqama_number, id_number, rider_name")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    const others = ((existingRaw ?? []) as (RiderIdentity & { id: string })[]).filter(
      (r) => r.id !== data.riderId,
    );
    if (matchRider(indexRiders(others), iqama, idNumber)) {
      throw new Error("رقم الإقامة أو الـ ID ده مستخدم بالفعل لمندوب تاني");
    }

    const { data: updated, error } = await supabase
      .from("riders")
      .update({
        iqama_number: iqama,
        id_number: idNumber,
        rider_name: name,
        photo_url: photo,
        area,
        extra,
      })
      .eq("id", data.riderId)
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("لم يتم تحديث المندوب — تأكد أنه يتبع شركتك");
    }
    return { ok: true };
  });

// Saves the rotation a company chose for a rider's photo (0/90/180/270), so
// it stays the same everywhere that photo is shown instead of resetting.
export const updateRiderPhotoRotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        riderId: z.string().uuid(),
        rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveRidersCompany(supabase, userId);
    const { data: updated, error } = await supabase
      .from("riders")
      .update({ photo_rotation: data.rotation })
      .eq("id", data.riderId)
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("لم يتم تحديث الصورة — تأكد أنه يتبع شركتك");
    }
    return { ok: true };
  });

// How many report rows still reference this rider — shown to the admin
// before deleting, so they know what a permanent delete would take with it.
export const getRiderReportCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ riderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveRidersCompany(supabase, userId);
    const { count, error } = await supabase
      .from("rider_reports")
      .select("id", { count: "exact", head: true })
      .eq("rider_id", data.riderId)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

// Same as getRiderReportCount, summed over a whole selection — shown before
// a bulk delete so the admin knows what a permanent delete would take with
// it, without one round trip per rider.
export const getRidersReportCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ riderIds: z.array(z.string().uuid()).min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveRidersCompany(supabase, userId);
    const { count, error } = await supabase
      .from("rider_reports")
      .select("id", { count: "exact", head: true })
      .in("rider_id", data.riderIds)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

// Removes a rider one of two ways:
//  - deleteReports: true  — a real row delete. The existing ON DELETE
//    CASCADE foreign keys take their reports, documents, letters, push
//    subscriptions and notifications with them. Irreversible.
//  - deleteReports: false — a soft delete (deleted_at). The rider
//    disappears from every roster/search screen and can no longer be
//    looked up, but rows that already reference them (old report data)
//    are left exactly as they were.
export const deleteRider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ riderId: z.string().uuid(), deleteReports: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveRidersCompany(supabase, userId, { requireDelete: true });

    if (data.deleteReports) {
      const { data: deleted, error } = await supabase
        .from("riders")
        .delete()
        .eq("id", data.riderId)
        .eq("company_id", companyId)
        .select("id");
      if (error) throw new Error(error.message);
      if (!deleted || deleted.length === 0) {
        throw new Error("لم يتم حذف المندوب — تأكد أنه يتبع شركتك");
      }
    } else {
      const { data: updated, error } = await supabase
        .from("riders")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", data.riderId)
        .eq("company_id", companyId)
        .select("id");
      if (error) throw new Error(error.message);
      if (!updated || updated.length === 0) {
        throw new Error("لم يتم حذف المندوب — تأكد أنه يتبع شركتك");
      }
    }
    return { ok: true };
  });

// Same as deleteRider, applied to a whole selection at once.
export const bulkDeleteRiders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ riderIds: z.array(z.string().uuid()).min(1), deleteReports: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveRidersCompany(supabase, userId, { requireDelete: true });

    if (data.deleteReports) {
      const { data: deleted, error } = await supabase
        .from("riders")
        .delete()
        .in("id", data.riderIds)
        .eq("company_id", companyId)
        .select("id");
      if (error) throw new Error(error.message);
      return { deleted: deleted?.length ?? 0 };
    }
    const { data: updated, error } = await supabase
      .from("riders")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", data.riderIds)
      .eq("company_id", companyId)
      .select("id");
    if (error) throw new Error(error.message);
    return { deleted: updated?.length ?? 0 };
  });
