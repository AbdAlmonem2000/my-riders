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
  OPERATING_CARD_NUMBER_FORMAT,
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

function resolveExpiryDate(docType: string, expiryDate: string | null | undefined): string | null {
  if (!docTypeNeedsExpiry(docType)) return null;
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
async function resolveDocumentsCompany(
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
// rider is assigned to.
async function assertOperatingCardAssignment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  companyId: string,
  riderId: string,
  riderArea: string | null,
  docType: string,
  cardNumber: string,
) {
  const { data: sameCardRaw } = await supabase
    .from("rider_documents")
    .select("rider_id")
    .eq("company_id", companyId)
    .eq("doc_type", docType)
    .eq("card_number", cardNumber)
    .neq("rider_id", riderId);
  const otherRiderIds = [
    ...new Set((sameCardRaw ?? []).map((r: { rider_id: string }) => r.rider_id)),
  ];

  if (otherRiderIds.length >= 3) {
    throw new Error(`كرت التشغيل رقم ${cardNumber} وصل للحد الأقصى (3 مناديب)`);
  }

  if (otherRiderIds.length > 0) {
    const { data: othersRaw } = await supabase
      .from("riders")
      .select("id, area")
      .in("id", otherRiderIds);
    const myArea = riderArea?.trim() || null;
    const mismatched = (othersRaw ?? []).find(
      (o: { area: string | null }) => (o.area?.trim() || null) !== myArea,
    );
    if (mismatched) {
      throw new Error(
        "رقم كرت التشغيل ده مستخدم بالفعل لمندوب في منطقة مختلفة — لازم يكونوا في نفس المنطقة",
      );
    }
  }
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

    const cardNumber = data.cardNumber?.trim() || null;

    if (isOperatingCardDocType(data.docType)) {
      if (!cardNumber) throw new Error("لازم إدخال رقم كرت التشغيل");
      if (!isValidOperatingCardNumber(cardNumber)) {
        throw new Error(`رقم كرت التشغيل لازم يكون بالشكل ${OPERATING_CARD_NUMBER_FORMAT} بالظبط`);
      }
      await assertOperatingCardAssignment(
        supabase,
        companyId,
        data.riderId,
        rider.area,
        data.docType,
        cardNumber,
      );
    }

    const { data: prev } = await supabase
      .from("rider_documents")
      .select("storage_path, label")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .maybeSingle();

    let label: string | null = null;
    if (!isKnownDocType(data.docType)) {
      label = data.label?.trim() || prev?.label || null;
      if (!label) throw new Error("لازم تكتب اسم المستند");
    }

    const { error } = await supabase.from("rider_documents").upsert(
      {
        company_id: companyId,
        rider_id: data.riderId,
        doc_type: data.docType,
        storage_path: data.storagePath,
        file_name: data.fileName,
        card_number: isOperatingCardDocType(data.docType) ? cardNumber : null,
        expiry_date: resolveExpiryDate(data.docType, data.expiryDate),
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
      .select("id, card_number")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!existing) throw new Error("لازم ترفع الملف أول مرة قبل ما تقدر تعدّل تاريخه");
    if (!docTypeNeedsExpiry(data.docType)) {
      throw new Error("هذا النوع من المستندات ليس له تاريخ انتهاء");
    }

    let cardNumber: string | null = existing.card_number;
    if (isOperatingCardDocType(data.docType)) {
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
          supabase,
          companyId,
          data.riderId,
          rider.area,
          data.docType,
          newCardNumber,
        );
      }
      cardNumber = newCardNumber;
    }

    const { error } = await supabase
      .from("rider_documents")
      .update({
        expiry_date: resolveExpiryDate(data.docType, data.expiryDate),
        card_number: cardNumber,
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
      .select("storage_path")
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("rider-documents").remove([existing.storage_path]);

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

    // Preview opens the file inline (a PDF or image tab); otherwise the
    // `download` option forces the browser to save it under its real name.
    const { data: signed, error } = await supabase.storage
      .from("rider-documents")
      .createSignedUrl(
        doc.storage_path,
        60,
        data.preview ? undefined : { download: doc.file_name },
      );
    if (error || !signed) throw new Error(error?.message ?? "تعذر تجهيز رابط الملف");
    return { url: signed.signedUrl };
  });
