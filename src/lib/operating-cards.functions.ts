import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertOperatingCardAssignment,
  deleteDocumentFileIfOrphaned,
  resolveDocumentsCompany,
} from "@/lib/documents.functions";
import {
  isValidExpiryDate,
  isValidOperatingCardNumber,
  normalizeSheetDateToIso,
  OPERATING_CARD_NUMBER_FORMAT,
} from "@/lib/document-status";
import { cellText, looksLikeIdentifier } from "@/lib/rider-identity";

const CardDocTypeSchema = z.enum(["operating_card", "operating_card_extra"]);

interface RowError {
  rowNumber: number;
  message: string;
}

// operating_cards_access and its three sub-toggles (upload/export/delete)
// only ever exist on a staff account's user_roles row — a real company
// admin or the super admin has no such row and so no way to be personally
// restricted here (same model checkIsAdmin uses: these only apply when
// isStaff). Mirrors the "role === 'user'" gate every other feature's
// resolve*Company helper already uses (see resolveDocumentsCompany,
// resolveReportsCompany) — without this, a staff member denied operating
// cards access (or just its delete/upload sub-permission) could still call
// these functions directly and bypass both the page gate and the UI that
// hides the corresponding buttons.
async function assertOperatingCardsAccess(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  extra?: "upload" | "delete",
) {
  const { data: role } = await supabase.rpc("get_member_role", { _user_id: userId });
  if (role !== "user") return;
  const { data: access } = await supabase.rpc("get_member_operating_cards_access", {
    _user_id: userId,
  });
  if (!access) throw new Error("غير مصرح: ليس لديك صلاحية الوصول لكروت التشغيل");
  if (extra === "upload") {
    const { data: uploadAccess } = await supabase.rpc("get_member_operating_cards_upload_access", {
      _user_id: userId,
    });
    if (!uploadAccess) throw new Error("غير مصرح: ليس لديك صلاحية رفع شيت كروت التشغيل");
  }
  if (extra === "delete") {
    const { data: deleteAccess } = await supabase.rpc("get_member_operating_cards_delete_access", {
      _user_id: userId,
    });
    if (!deleteAccess) throw new Error("غير مصرح: ليس لديك صلاحية حذف كرت التشغيل");
  }
}

// Bulk-assigns operating cards from a spreadsheet: card number + the
// rider's Iqama number + an optional plate number/expiry date, one row per
// rider. No file is attached here — that's uploaded once per card number
// afterward, from the Operating Cards page (see uploadOperatingCardFile),
// so three riders sharing one card don't need the same file uploaded three
// times. Same raw headers+rows+detected-columns shape the roster upload
// sends — parsing/validation happens here, not in the browser.
const RowSchema = z.record(z.string(), z.unknown());
const BulkInput = z.object({
  docType: CardDocTypeSchema,
  headers: z.array(z.string()),
  iqamaColumn: z.string().nullable(),
  cardNumberColumn: z.string(),
  plateNumberColumn: z.string().nullable(),
  expiryDateColumn: z.string().nullable(),
  rows: z.array(RowSchema),
});

export const bulkAssignOperatingCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);
    await assertOperatingCardsAccess(supabase, userId, "upload");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Every rider referenced, resolved by Iqama number against the full
    // company (service role — a bulk sheet can legitimately span more area
    // than the caller's own allowed_areas can currently SELECT, and a
    // missing match has to be reported either way).
    const { data: ridersRaw } = await supabaseAdmin
      .from("riders")
      .select("id, iqama_number, area, rider_name")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    const riderByIqama = new Map(
      (ridersRaw ?? []).filter((r) => r.iqama_number).map((r) => [r.iqama_number as string, r]),
    );

    interface ResolvedRow {
      rowNumber: number;
      riderId: string;
      riderName: string | null;
      area: string | null;
      cardNumber: string;
      plateNumber: string | null;
      expiryDate: string | null;
    }
    const resolved: ResolvedRow[] = [];
    const rowErrors: RowError[] = [];
    data.rows.forEach((row, i) => {
      // Row 1 is the header in every spreadsheet tool, so the first data
      // row is 2 — matches what the admin sees if they open the file.
      const rowNumber = i + 2;
      const iqama = cellText(row, data.iqamaColumn);
      const cardNumberRaw = cellText(row, data.cardNumberColumn);
      // A fully blank row (common at the end of a sheet) is skipped
      // silently rather than reported as an error.
      if (!iqama && !cardNumberRaw) return;

      if (!iqama || !looksLikeIdentifier(iqama)) {
        rowErrors.push({ rowNumber, message: "رقم الإقامة فاضي أو غير صحيح" });
        return;
      }
      if (!cardNumberRaw || !isValidOperatingCardNumber(cardNumberRaw)) {
        rowErrors.push({
          rowNumber,
          message: `رقم كرت التشغيل "${cardNumberRaw ?? ""}" غير صحيح — لازم يكون بالشكل 38-00000000`,
        });
        return;
      }
      const plateNumberRaw = cellText(row, data.plateNumberColumn);
      const expiryRaw = cellText(row, data.expiryDateColumn);
      let expiryDate: string | null = null;
      if (expiryRaw) {
        expiryDate = normalizeSheetDateToIso(expiryRaw);
        if (!expiryDate || !isValidExpiryDate(expiryDate)) {
          rowErrors.push({
            rowNumber,
            message: `تاريخ الانتهاء "${expiryRaw}" مش مفهوم — استخدم الشكل يوم/شهر/سنة`,
          });
          return;
        }
      }

      const rider = riderByIqama.get(iqama);
      if (!rider) {
        rowErrors.push({ rowNumber, message: `رقم الإقامة "${iqama}" غير موجود عندك في النظام` });
        return;
      }
      resolved.push({
        rowNumber,
        riderId: rider.id,
        riderName: rider.rider_name,
        area: rider.area,
        cardNumber: cardNumberRaw.trim(),
        plateNumber: plateNumberRaw,
        expiryDate,
      });
    });

    if (resolved.length === 0 && rowErrors.length === 0) {
      throw new Error("الملف فاضي أو الأعمدة مش متعرّف عليها");
    }
    if (rowErrors.length > 0) {
      rowErrors.sort((a, b) => a.rowNumber - b.rowNumber);
      throw new Error(rowErrors.map((e) => `الصف ${e.rowNumber}: ${e.message}`).join("\n"));
    }

    // Cross-row + existing-data validation: the same 3-riders-per-card,
    // same-area rule as a single manual upload (assertOperatingCardAssignment
    // in documents.functions.ts), just evaluated for the whole sheet at once
    // against the full company (not RLS-limited), since a conflict in an
    // area the caller can't even see still has to block the import.
    const { data: existingRaw } = await supabaseAdmin
      .from("rider_documents")
      .select("rider_id, card_number")
      .eq("company_id", companyId)
      .eq("doc_type", data.docType)
      .not("card_number", "is", null);
    const riderById = new Map((ridersRaw ?? []).map((r) => [r.id, r]));

    // A rider moving to a different card in this same sheet no longer
    // counts toward their old card's group.
    const newCardByRider = new Map(resolved.map((r) => [r.riderId, r.cardNumber]));

    const groupErrors: RowError[] = [];
    const cardNumbers = new Set(resolved.map((r) => r.cardNumber));
    for (const cardNumber of cardNumbers) {
      const memberIds = new Set<string>();
      for (const e of existingRaw ?? []) {
        if (e.card_number !== cardNumber) continue;
        const movingTo = newCardByRider.get(e.rider_id);
        if (movingTo && movingTo !== cardNumber) continue;
        memberIds.add(e.rider_id);
      }
      for (const r of resolved) {
        if (r.cardNumber === cardNumber) memberIds.add(r.riderId);
      }

      const members = [...memberIds].map((id) => {
        const sheetRow = resolved.find((r) => r.riderId === id && r.cardNumber === cardNumber);
        const existing = riderById.get(id);
        return {
          id,
          name: sheetRow?.riderName ?? existing?.rider_name ?? "مندوب بدون اسم",
          area: (sheetRow?.area ?? existing?.area ?? null)?.trim() || "بدون منطقة",
        };
      });

      const firstRowForCard = resolved.find((r) => r.cardNumber === cardNumber)!.rowNumber;

      if (members.length > 3) {
        groupErrors.push({
          rowNumber: firstRowForCard,
          message: `كرت التشغيل رقم ${cardNumber} هيبقى معاه ${members.length} مناديب (الحد الأقصى 3) — ${members
            .map((m) => m.name)
            .join("، ")}`,
        });
        continue;
      }

      const areas = new Set(members.map((m) => m.area));
      if (areas.size > 1) {
        groupErrors.push({
          rowNumber: firstRowForCard,
          message: `كرت التشغيل رقم ${cardNumber} هيبقى معاه مناديب من مناطق مختلفة: ${members
            .map((m) => `${m.name} (${m.area})`)
            .join("، ")} — لازم يكونوا في نفس المنطقة`,
        });
      }
    }

    if (groupErrors.length > 0) {
      groupErrors.sort((a, b) => a.rowNumber - b.rowNumber);
      throw new Error(groupErrors.map((e) => `الصف ${e.rowNumber}: ${e.message}`).join("\n"));
    }

    // Writes go through the caller's own request-scoped client, not the
    // service role — RLS still gates a restricted staff member to their
    // allowed_areas here, same as every other rider_documents write.
    // storage_path/file_name/label are deliberately left out of the upsert
    // payload so an already-uploaded file is never touched by this.
    const payload = resolved.map((r) => ({
      company_id: companyId,
      rider_id: r.riderId,
      doc_type: data.docType,
      card_number: r.cardNumber,
      plate_number: r.plateNumber,
      expiry_date: r.expiryDate,
    }));
    const CHUNK = 300;
    for (let i = 0; i < payload.length; i += CHUNK) {
      const { error } = await supabase
        .from("rider_documents")
        .upsert(payload.slice(i, i + CHUNK), { onConflict: "rider_id,doc_type" });
      if (error) throw new Error(error.message);
    }

    return { ok: true, count: resolved.length };
  });

// Uploads (or replaces) the one file a card number shares across every
// rider assigned to it, plus its plate number/expiry date — set once at the
// group level instead of once per rider. The file itself is already in
// storage by the time this runs, same pattern as uploadRiderDocument. A
// card can sit unfinished with no expiry while it only has a number
// assigned (e.g. from a bulk sheet), but actually attaching its file
// completes it — a valid expiry is required from this point on, enforced
// here too (not just client-side) since this is the one call that actually
// turns a pending card into a real document.
const GroupFileInput = z.object({
  docType: CardDocTypeSchema,
  cardNumber: z.string().trim().min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  expiryDate: z.string(),
});

export const uploadOperatingCardFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GroupFileInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);
    await assertOperatingCardsAccess(supabase, userId);

    if (!isValidExpiryDate(data.expiryDate)) {
      throw new Error("تاريخ الانتهاء غير صحيح");
    }

    const { data: prevRows } = await supabase
      .from("rider_documents")
      .select("storage_path")
      .eq("company_id", companyId)
      .eq("doc_type", data.docType)
      .eq("card_number", data.cardNumber);
    const prevPaths = [...new Set((prevRows ?? []).map((r) => r.storage_path).filter(Boolean))];

    const { data: updated, error } = await supabase
      .from("rider_documents")
      .update({
        storage_path: data.storagePath,
        file_name: data.fileName,
        expiry_date: data.expiryDate,
        uploaded_at: new Date().toISOString(),
      })
      .eq("company_id", companyId)
      .eq("doc_type", data.docType)
      .eq("card_number", data.cardNumber)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("رقم الكرت ده مش مرتبط بأي مندوب");

    const oldOnly = prevPaths.filter((p) => p !== data.storagePath) as string[];
    if (oldOnly.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("rider-documents").remove(oldOnly);
    }

    return { ok: true, updated: updated.length };
  });

// Edits a card's plate number/expiry date, and optionally its card number
// itself, without touching its file.
const GroupMetaInput = z.object({
  docType: CardDocTypeSchema,
  cardNumber: z.string().trim().min(1),
  plateNumber: z.string().trim().max(20).nullable(),
  expiryDate: z.string().nullable(),
  // Present only when the admin is renumbering the whole group — every
  // rider currently on `cardNumber` moves to this new number together.
  newCardNumber: z.string().trim().nullable().optional(),
});

export const updateOperatingCardGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GroupMetaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);
    await assertOperatingCardsAccess(supabase, userId);

    if (data.expiryDate && !isValidExpiryDate(data.expiryDate)) {
      throw new Error("تاريخ الانتهاء غير صحيح");
    }

    const newCardNumber = data.newCardNumber?.trim() || null;
    const isRenumbering = !!newCardNumber && newCardNumber !== data.cardNumber;

    if (isRenumbering) {
      if (!isValidOperatingCardNumber(newCardNumber!)) {
        throw new Error(`رقم كرت التشغيل لازم يكون بالشكل ${OPERATING_CARD_NUMBER_FORMAT} بالظبط`);
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: groupRows } = await supabaseAdmin
        .from("rider_documents")
        .select("rider_id")
        .eq("company_id", companyId)
        .eq("doc_type", data.docType)
        .eq("card_number", data.cardNumber);
      const groupRiderIds = [...new Set((groupRows ?? []).map((r) => r.rider_id))];
      if (groupRiderIds.length === 0) throw new Error("رقم الكرت ده مش مرتبط بأي مندوب");

      const { data: targetRows } = await supabaseAdmin
        .from("rider_documents")
        .select("rider_id")
        .eq("company_id", companyId)
        .eq("doc_type", data.docType)
        .eq("card_number", newCardNumber);
      const targetRiderIds = [...new Set((targetRows ?? []).map((r) => r.rider_id))].filter(
        (id) => !groupRiderIds.includes(id),
      );

      const { data: allRidersRaw } = await supabaseAdmin
        .from("riders")
        .select("id, rider_name, area")
        .in("id", [...groupRiderIds, ...targetRiderIds]);
      const riderById = new Map(
        (allRidersRaw ?? []).map((r) => [
          r.id,
          r as { rider_name: string | null; area: string | null },
        ]),
      );
      const namesOf = (ids: string[]) =>
        ids.map((id) => riderById.get(id)?.rider_name?.trim() || "مندوب بدون اسم").join("، ");

      if (targetRiderIds.length + groupRiderIds.length > 3) {
        throw new Error(
          `كرت التشغيل رقم ${newCardNumber} هيبقى معاه ${targetRiderIds.length + groupRiderIds.length} مناديب (الحد الأقصى 3) — مستخدم حاليًا مع: ${namesOf(targetRiderIds)}`,
        );
      }
      if (targetRiderIds.length > 0) {
        const groupArea = riderById.get(groupRiderIds[0])?.area?.trim() || "بدون منطقة";
        const mismatched = targetRiderIds.filter(
          (id) => (riderById.get(id)?.area?.trim() || "بدون منطقة") !== groupArea,
        );
        if (mismatched.length > 0) {
          const otherArea = riderById.get(mismatched[0])?.area?.trim() || "بدون منطقة";
          throw new Error(
            `كرت التشغيل رقم ${newCardNumber} مستخدم بالفعل في منطقة "${otherArea}" مع: ${namesOf(mismatched)} — لازم يكونوا في نفس المنطقة`,
          );
        }
      }
    }

    const { data: updated, error } = await supabase
      .from("rider_documents")
      .update({
        plate_number: data.plateNumber?.trim() || null,
        expiry_date: data.expiryDate,
        ...(isRenumbering ? { card_number: newCardNumber } : {}),
      })
      .eq("company_id", companyId)
      .eq("doc_type", data.docType)
      .eq("card_number", data.cardNumber)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("رقم الكرت ده مش مرتبط بأي مندوب");

    return { ok: true, updated: updated.length };
  });

// Deletes the whole card group at once: every rider linked to this card
// number loses that document slot entirely (same end state as deleting
// their own document one by one in documents.tsx), plus the shared file
// itself is removed from storage.
const GroupDeleteInput = z.object({
  docType: CardDocTypeSchema,
  cardNumber: z.string().trim().min(1),
});

export const deleteOperatingCardGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GroupDeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);
    await assertOperatingCardsAccess(supabase, userId, "delete");

    const { data: existing } = await supabase
      .from("rider_documents")
      .select("storage_path")
      .eq("company_id", companyId)
      .eq("doc_type", data.docType)
      .eq("card_number", data.cardNumber);

    const { data: deleted, error } = await supabase
      .from("rider_documents")
      .delete()
      .eq("company_id", companyId)
      .eq("doc_type", data.docType)
      .eq("card_number", data.cardNumber)
      .select("id");
    if (error) throw new Error(error.message);
    if (!deleted || deleted.length === 0) throw new Error("رقم الكرت ده مش مرتبط بأي مندوب");

    const paths = [
      ...new Set((existing ?? []).map((r) => r.storage_path).filter(Boolean)),
    ] as string[];
    if (paths.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("rider-documents").remove(paths);
    }

    return { ok: true, deleted: deleted.length };
  });

// Detaches a single rider from a card they share with others, without
// touching the card for anyone else on it — the inverse of
// addRiderToOperatingCard below. Their own row is removed entirely (same end
// state as deleting that document from the Documents page), but the shared
// file is only removed from storage once no other rider on the card still
// points at it.
const RemoveRiderInput = z.object({
  docType: CardDocTypeSchema,
  cardNumber: z.string().trim().min(1),
  riderId: z.string().uuid(),
});

export const removeRiderFromOperatingCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RemoveRiderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);
    await assertOperatingCardsAccess(supabase, userId, "delete");

    const { data: existing } = await supabase
      .from("rider_documents")
      .select("id, storage_path, card_number")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!existing || existing.card_number !== data.cardNumber) {
      throw new Error("المندوب غير مرتبط بهذا الكرت");
    }

    const { error } = await supabase.from("rider_documents").delete().eq("id", existing.id);
    if (error) throw new Error(error.message);

    if (existing.storage_path) {
      await deleteDocumentFileIfOrphaned(supabase, companyId, existing.storage_path, existing.id);
    }

    return { ok: true };
  });

// Adds an existing rider onto a card that already has 1-2 riders on it,
// inheriting whatever file/plate/expiry the card already carries — the same
// same-area/max-3 rule as every other card assignment path is enforced via
// assertOperatingCardAssignment (service role, company-wide), and a rider
// already sitting on a DIFFERENT card of this same doc_type is rejected
// rather than silently moved (they'd have to be removed from it first).
const AddRiderInput = z.object({
  docType: CardDocTypeSchema,
  cardNumber: z.string().trim().min(1),
  riderId: z.string().uuid(),
});

export const addRiderToOperatingCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddRiderInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);
    await assertOperatingCardsAccess(supabase, userId);

    const { data: rider } = await supabase
      .from("riders")
      .select("id, area")
      .eq("id", data.riderId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!rider) throw new Error("المندوب غير موجود");

    const { data: existingRow } = await supabase
      .from("rider_documents")
      .select("card_number")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .eq("company_id", companyId)
      .maybeSingle();
    if (existingRow?.card_number && existingRow.card_number !== data.cardNumber) {
      throw new Error("المندوب مرتبط بالفعل بكرت تشغيل تاني من نفس النوع — لازم يتشال منه الأول");
    }

    await assertOperatingCardAssignment(
      companyId,
      data.riderId,
      rider.area,
      data.docType,
      data.cardNumber,
    );

    const { data: groupRow } = await supabase
      .from("rider_documents")
      .select("storage_path, file_name, expiry_date, plate_number, uploaded_at")
      .eq("company_id", companyId)
      .eq("doc_type", data.docType)
      .eq("card_number", data.cardNumber)
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("rider_documents").upsert(
      {
        company_id: companyId,
        rider_id: data.riderId,
        doc_type: data.docType,
        card_number: data.cardNumber,
        storage_path: groupRow?.storage_path ?? null,
        file_name: groupRow?.file_name ?? null,
        expiry_date: groupRow?.expiry_date ?? null,
        plate_number: groupRow?.plate_number ?? null,
        uploaded_at: groupRow?.uploaded_at ?? new Date().toISOString(),
      },
      { onConflict: "rider_id,doc_type" },
    );
    if (error) throw new Error(error.message);

    return { ok: true };
  });

// Uploads the "استمارة كرت التشغيل الإضافي" (operating_card_extra_form) for
// every rider sharing one card group at once, from the Operating Cards page
// itself — the same "upload once, apply to the whole group" convenience as
// the card file/expiry, even though this form has no card number or expiry
// of its own (it's a plain no-expiry document, just like personal_photo).
const CardFormInput = z.object({
  riderIds: z.array(z.string().uuid()).min(1),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
});

export const uploadOperatingCardExtraForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CardFormInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);
    await assertOperatingCardsAccess(supabase, userId);

    const { data: riders } = await supabase
      .from("riders")
      .select("id")
      .eq("company_id", companyId)
      .in("id", data.riderIds);
    const validRiderIds = new Set((riders ?? []).map((r) => r.id));
    if (validRiderIds.size === 0) throw new Error("المندوبين غير موجودين");

    const { data: prevRows } = await supabase
      .from("rider_documents")
      .select("storage_path")
      .eq("company_id", companyId)
      .eq("doc_type", "operating_card_extra_form")
      .in("rider_id", [...validRiderIds]);
    const prevPaths = [
      ...new Set((prevRows ?? []).map((r) => r.storage_path).filter(Boolean)),
    ] as string[];

    const payload = [...validRiderIds].map((riderId) => ({
      company_id: companyId,
      rider_id: riderId,
      doc_type: "operating_card_extra_form",
      storage_path: data.storagePath,
      file_name: data.fileName,
      expiry_date: null,
      needs_expiry: false,
      card_number: null,
      plate_number: null,
      uploaded_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("rider_documents")
      .upsert(payload, { onConflict: "rider_id,doc_type" });
    if (error) throw new Error(error.message);

    const oldOnly = prevPaths.filter((p) => p !== data.storagePath);
    if (oldOnly.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("rider-documents").remove(oldOnly);
    }

    return { ok: true, updated: validRiderIds.size };
  });
