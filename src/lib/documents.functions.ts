import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  docTypeNeedsExpiry,
  hasAllowedDocExtension,
  isCustomDocType,
  isKnownDocType,
  isOperatingCardDocType,
  isValidExpiryDate,
  isValidOperatingCardNumber,
  looksLikeOperatingCardLabel,
  OPERATING_CARD_NUMBER_FORMAT,
  OPERATING_CARD_TYPES,
} from "@/lib/document-status";

// Accepts either one of the fixed doc types or a client-generated
// "custom:<uuid>" one — never arbitrary text, since doc_type also becomes a
// storage path segment.
const DocTypeSchema = z
  .string()
  .refine((v) => isKnownDocType(v) || isCustomDocType(v), "نوع المستند غير صحيح");
// Most slots require a real expiry date; the couple that never expire
// (docTypeNeedsExpiry) send null instead — validated per-request in each
// handler below, since which is which depends on the doc type in the same
// payload.
const ExpiryDateSchema = z.string().nullable().optional();

function resolveExpiryDate(
  docType: string,
  expiryDate: string | null | undefined,
  customNeedsExpiry?: boolean | null,
): string | null {
  if (!docTypeNeedsExpiry(docType, customNeedsExpiry)) return null;
  if (!expiryDate || !isValidExpiryDate(expiryDate)) {
    throw new Error("تاريخ الانتهاء غير صحيح");
  }
  return expiryDate;
}

// Resolves the caller's company for the Documents feature specifically.
// Unlike resolveActiveCompany (riders.functions.ts, admin-only — guards
// unrelated actions like report/roster uploads that staff must never reach),
// this also accepts a restricted staff account (role 'user') within its own
// company. A full write (upload / edit date / delete) additionally requires
// that staff member's documents_access to be 'full' — a view-only staff
// account can still read/download, just not write.
export async function resolveDocumentsCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  requireFullAccess: boolean,
): Promise<string> {
  const { data: companyId } = await supabase.rpc("get_member_company", { _user_id: userId });
  if (!companyId) throw new Error("هذا الحساب غير مرتبط بشركة");
  const { data: isActive } = await supabase.rpc("is_company_active", {
    _company_id: companyId,
  });
  if (!isActive) {
    throw new Error("هذا الحساب موقوف مؤقتًا من قبل الإدارة، تواصل معهم لإعادة التفعيل");
  }
  if (requireFullAccess) {
    const { data: role } = await supabase.rpc("get_member_role", { _user_id: userId });
    if (role === "user") {
      const { data: access } = await supabase.rpc("get_member_documents_access", {
        _user_id: userId,
      });
      if (access !== "full") {
        throw new Error("غير مصرح: صلاحيتك على المستندات للعرض والتنزيل فقط");
      }
    }
  }
  return companyId as string;
}

// Operating card (and its extra slot): max 3 riders per card, and every
// rider on a card must share the same area. Checked against every OTHER
// rider currently on this card number within the same doc_type (self
// excluded, so re-saving your own card is fine, and the two slots track
// their card numbers independently). Shared by both the initial upload and
// a later date/card-only edit, since either one can change which card a
// rider is assigned to. Applies identically regardless of who's uploading —
// a real company admin can hit this exactly like a staff member — and the
// error names the conflicting riders and their area so whoever hits it can
// actually resolve it instead of guessing.
//
// Deliberately runs on supabaseAdmin (service role), never the caller's own
// request-scoped client: a staff account restricted to one area only sees
// rider_documents within its own allowed_areas under RLS, so checking with
// that client would silently miss a conflicting card already used by a
// rider in a DIFFERENT area — exactly the gap that let the same card number
// end up assigned across two areas at once. This check is a company-wide
// invariant, not something scoped to what the caller personally can see.
export async function assertOperatingCardAssignment(
  companyId: string,
  riderId: string,
  riderArea: string | null,
  docType: string,
  cardNumber: string,
  // Present only for a custom "كرت تشغيل..." document — since every
  // custom doc_type is a one-off UUID, riders sharing this card can only be
  // found by matching the exact same admin-typed label, not doc_type.
  label?: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const isCustomCardGroup =
    !OPERATING_CARD_TYPES.has(docType) && looksLikeOperatingCardLabel(label);
  let sameCardQuery = supabaseAdmin
    .from("rider_documents")
    .select("rider_id")
    .eq("company_id", companyId)
    .eq("card_number", cardNumber)
    .neq("rider_id", riderId);
  sameCardQuery = isCustomCardGroup
    ? sameCardQuery.eq("label", label!.trim())
    : sameCardQuery.eq("doc_type", docType);
  const { data: sameCardRaw } = await sameCardQuery;
  const otherRiderIds = [
    ...new Set((sameCardRaw ?? []).map((r: { rider_id: string }) => r.rider_id)),
  ];
  if (otherRiderIds.length === 0) return;

  const { data: othersRaw } = await supabaseAdmin
    .from("riders")
    .select("id, rider_name, area")
    .in("id", otherRiderIds);
  const others = (othersRaw ?? []) as {
    id: string;
    rider_name: string | null;
    area: string | null;
  }[];
  const namesOf = (list: typeof others) =>
    list.map((o) => o.rider_name?.trim() || "مندوب بدون اسم").join("، ");

  if (otherRiderIds.length >= 3) {
    const area = others[0]?.area?.trim() || "بدون منطقة";
    throw new Error(
      `كرت التشغيل رقم ${cardNumber} وصل للحد الأقصى (3 مناديب) — مستخدم حاليًا مع: ${namesOf(others)} (منطقة ${area})`,
    );
  }

  const myArea = riderArea?.trim() || null;
  const mismatched = others.filter((o) => (o.area?.trim() || null) !== myArea);
  if (mismatched.length > 0) {
    const otherArea = mismatched[0].area?.trim() || "بدون منطقة";
    throw new Error(
      `كرت التشغيل رقم ${cardNumber} مستخدم بالفعل في منطقة "${otherArea}" مع: ${namesOf(mismatched)} — لازم يكونوا في نفس المنطقة`,
    );
  }
}

// An operating card's file is shared across every rider on that card (see
// uploadOperatingCardFile in operating-cards.functions.ts), so deleting one
// rider's row must not blindly remove the storage object out from under the
// others still pointing at it. Scoped to the company (not admin-wide) since
// every row sharing a path is guaranteed to already be visible to whoever
// can delete one of them — same area, same company.
export async function deleteDocumentFileIfOrphaned(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  storagePath: string,
  excludeRowId: string,
) {
  const { data: others } = await supabase
    .from("rider_documents")
    .select("id")
    .eq("company_id", companyId)
    .eq("storage_path", storagePath)
    .neq("id", excludeRowId)
    .limit(1);
  if ((others ?? []).length > 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.storage.from("rider-documents").remove([storagePath]);
}

const UploadInput = z.object({
  riderId: z.string().uuid(),
  docType: DocTypeSchema,
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  expiryDate: ExpiryDateSchema,
  cardNumber: z.string().nullable().optional(),
  // Required only the first time a custom (non-fixed) document is created —
  // the 7 fixed slots get their name from the UI translations instead.
  label: z.string().max(100).nullable().optional(),
  // Only meaningful (and only ever sent) the first time a custom document
  // is created — whether THIS particular custom type carries an expiry
  // date at all. Ignored for the 7 fixed slots, which already know this
  // from their own type key.
  needsExpiry: z.boolean().nullable().optional(),
  // Only meaningful for an operating-card-type document (fixed or a custom
  // one named "كرت تشغيل...").
  plateNumber: z.string().trim().max(20).nullable().optional(),
});

// Uploads (or replaces) one rider's document. The file itself is already in
// storage by the time this runs — the client uploads it directly then calls
// this to record it — so validation here is defense in depth, the real gate
// is the client's file-picker check before it ever uploads.
export const uploadRiderDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);

    if (!hasAllowedDocExtension(data.fileName)) {
      throw new Error("امتداد الملف غير مسموح — يُقبل فقط JPG أو PNG أو PDF");
    }

    const { data: rider } = await supabase
      .from("riders")
      .select("id, area")
      .eq("id", data.riderId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!rider) throw new Error("المندوب غير موجود");

    const { data: prev } = await supabase
      .from("rider_documents")
      .select("storage_path, label, needs_expiry")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .maybeSingle();

    let label: string | null = null;
    if (!isKnownDocType(data.docType)) {
      label = data.label?.trim() || prev?.label || null;
      if (!label) throw new Error("لازم تكتب اسم المستند");
    }
    // A fixed slot's expiry requirement is baked into its type key; a
    // custom one is whatever was chosen when it was created (or re-chosen
    // now, on re-upload), defaulting to "needs an expiry" if never set.
    const needsExpiry = data.needsExpiry ?? prev?.needs_expiry ?? true;

    const cardNumber = data.cardNumber?.trim() || null;
    const isCard = isOperatingCardDocType(data.docType, label);

    if (isCard) {
      if (!cardNumber) throw new Error("لازم إدخال رقم كرت التشغيل");
      if (!isValidOperatingCardNumber(cardNumber)) {
        throw new Error(`رقم كرت التشغيل لازم يكون بالشكل ${OPERATING_CARD_NUMBER_FORMAT} بالظبط`);
      }
      await assertOperatingCardAssignment(
        companyId,
        data.riderId,
        rider.area,
        data.docType,
        cardNumber,
        label,
      );
    }

    const { error } = await supabase.from("rider_documents").upsert(
      {
        company_id: companyId,
        rider_id: data.riderId,
        doc_type: data.docType,
        storage_path: data.storagePath,
        file_name: data.fileName,
        card_number: isCard ? cardNumber : null,
        plate_number: isCard ? data.plateNumber?.trim() || null : null,
        expiry_date: resolveExpiryDate(data.docType, data.expiryDate, needsExpiry),
        needs_expiry: needsExpiry,
        label,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "rider_id,doc_type" },
    );
    if (error) throw new Error(error.message);

    if (prev?.storage_path && prev.storage_path !== data.storagePath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("rider-documents").remove([prev.storage_path]);
    }

    return { ok: true };
  });

const UpdateExpiryInput = z.object({
  riderId: z.string().uuid(),
  docType: DocTypeSchema,
  expiryDate: ExpiryDateSchema,
  cardNumber: z.string().nullable().optional(),
  plateNumber: z.string().trim().max(20).nullable().optional(),
});

// Changes just the expiry date (and, for an operating card, the card number)
// of an already-uploaded document — no new file needed.
export const updateRiderDocumentExpiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateExpiryInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);

    const { data: existing } = await supabase
      .from("rider_documents")
      .select("id, card_number, label, needs_expiry")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!existing) throw new Error("لازم ترفع الملف أول مرة قبل ما تقدر تعدّل تاريخه");
    if (!docTypeNeedsExpiry(data.docType, existing.needs_expiry)) {
      throw new Error("هذا النوع من المستندات ليس له تاريخ انتهاء");
    }

    const isCard = isOperatingCardDocType(data.docType, existing.label);
    let cardNumber: string | null = existing.card_number;
    if (isCard) {
      const newCardNumber = data.cardNumber?.trim() || null;
      if (!newCardNumber) throw new Error("لازم إدخال رقم كرت التشغيل");
      if (!isValidOperatingCardNumber(newCardNumber)) {
        throw new Error(`رقم كرت التشغيل لازم يكون بالشكل ${OPERATING_CARD_NUMBER_FORMAT} بالظبط`);
      }
      if (newCardNumber !== existing.card_number) {
        const { data: rider } = await supabase
          .from("riders")
          .select("id, area")
          .eq("id", data.riderId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (!rider) throw new Error("المندوب غير موجود");
        await assertOperatingCardAssignment(
          companyId,
          data.riderId,
          rider.area,
          data.docType,
          newCardNumber,
          existing.label,
        );
      }
      cardNumber = newCardNumber;
    }

    const { error } = await supabase
      .from("rider_documents")
      .update({
        expiry_date: resolveExpiryDate(data.docType, data.expiryDate, existing.needs_expiry),
        card_number: cardNumber,
        ...(isCard ? { plate_number: data.plateNumber?.trim() || null } : {}),
      })
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const deleteRiderDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ riderId: z.string().uuid(), docType: DocTypeSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const companyId = await resolveDocumentsCompany(supabase, userId, true);

    const { data: existing } = await supabase
      .from("rider_documents")
      .select("id, storage_path")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!existing) throw new Error("المستند غير موجود");

    const { error } = await supabase
      .from("rider_documents")
      .delete()
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .eq("company_id", companyId);
    if (error) throw new Error(error.message);

    if (existing.storage_path) {
      await deleteDocumentFileIfOrphaned(supabase, companyId, existing.storage_path, existing.id);
    }

    return { ok: true };
  });

export const getRiderDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        riderId: z.string().uuid(),
        docType: DocTypeSchema,
        preview: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc } = await supabase
      .from("rider_documents")
      .select("storage_path, file_name")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .maybeSingle();
    if (!doc) throw new Error("المستند غير موجود");
    if (!doc.storage_path) throw new Error("لم يتم رفع ملف لهذا المستند بعد");

    // Preview opens the file inline (a PDF or image tab); otherwise the
    // `download` option forces the browser to save it under its real name.
    const { data: signed, error } = await supabase.storage
      .from("rider-documents")
      .createSignedUrl(
        doc.storage_path,
        60,
        data.preview ? undefined : { download: doc.file_name ?? undefined },
      );
    if (error || !signed) throw new Error(error?.message ?? "تعذر تجهيز رابط الملف");
    return { url: signed.signedUrl };
  });
