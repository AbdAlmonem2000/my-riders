import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  hasAllowedDocExtension,
  isValidExpiryDate,
  RENEWABLE_DOC_TYPES,
  type RenewableDocType,
} from "@/lib/document-status";
import { loadVerifiedRider } from "@/lib/rider-photo.functions";

const DocTypeSchema = z.enum(RENEWABLE_DOC_TYPES);

const DOC_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"] as const;

export interface RenewableDocInfo {
  docType: RenewableDocType;
  fileName: string | null;
  expiryDate: string | null;
  uploadedAt: string | null;
  lastUpdatedBy: "admin" | "rider" | null;
}

const GetInput = z.object({
  riderId: z.string().uuid(),
  password: z.string(),
});

// Riders have no Supabase Auth session, same reasoning as rider-photo —
// verifies the password itself (via loadVerifiedRider, which also checks
// the rider isn't blocked and the company isn't suspended) instead of
// requireSupabaseAuth, then reads straight off the service-role client.
export const getRiderRenewableDocuments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GetInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadVerifiedRider(supabaseAdmin, data.riderId, data.password);

    const { data: rows, error } = await supabaseAdmin
      .from("rider_documents")
      .select("doc_type, file_name, expiry_date, uploaded_at, last_updated_by")
      .eq("rider_id", data.riderId)
      .in("doc_type", RENEWABLE_DOC_TYPES);
    if (error) throw new Error(error.message);
    const byType = new Map((rows ?? []).map((r) => [r.doc_type, r]));

    return RENEWABLE_DOC_TYPES.map((docType) => {
      const row = byType.get(docType);
      return {
        docType,
        fileName: row?.file_name ?? null,
        expiryDate: row?.expiry_date ?? null,
        uploadedAt: row?.uploaded_at ?? null,
        lastUpdatedBy: (row?.last_updated_by as "admin" | "rider" | undefined) ?? null,
      };
    });
  });

// Mints a short-lived signed URL on demand, right when the rider actually
// clicks "view current file" — not stored and handed out ahead of time
// (getRiderRenewableDocuments doesn't return one), so it can never go stale
// sitting unused in a query cache the way an eagerly-generated one would.
const GetViewUrlInput = z.object({
  riderId: z.string().uuid(),
  password: z.string(),
  docType: DocTypeSchema,
});

export const getRiderDocumentViewUrl = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GetViewUrlInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadVerifiedRider(supabaseAdmin, data.riderId, data.password);

    const { data: row } = await supabaseAdmin
      .from("rider_documents")
      .select("storage_path")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .maybeSingle();
    if (!row?.storage_path) throw new Error("لا يوجد ملف مرفوع لهذا المستند بعد");

    const { data: signed, error } = await supabaseAdmin.storage
      .from("rider-documents")
      .createSignedUrl(row.storage_path, 60);
    if (error || !signed) throw new Error(error?.message ?? "تعذر تجهيز رابط الملف");
    return { url: signed.signedUrl };
  });

// Step 1 of the rider renewing their own iqama/license: same signed-upload-URL
// handoff as rider-photo.functions.ts's photo upload, just into the private
// rider-documents bucket instead of the public rider-photos one.
const RequestUploadInput = z.object({
  riderId: z.string().uuid(),
  password: z.string(),
  docType: DocTypeSchema,
  fileExt: z.enum(DOC_EXTENSIONS),
});

export const requestRiderDocumentUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RequestUploadInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rider = await loadVerifiedRider(supabaseAdmin, data.riderId, data.password);

    const path = `${rider.company_id}/${data.riderId}/${data.docType}-${Date.now()}${data.fileExt}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("rider-documents")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "تعذر تجهيز رابط الرفع");
    return { path, token: signed.token };
  });

// Step 2: the file is already sitting at `path` by now — records it as this
// rider's iqama_photo/driving_license, exactly the same row shape (and the
// same onConflict target) the admin's own uploadRiderDocument writes, so
// whichever side updates it next simply overwrites the other's.
const ConfirmUploadInput = z.object({
  riderId: z.string().uuid(),
  password: z.string(),
  docType: DocTypeSchema,
  path: z.string().min(1),
  expiryDate: z.string(),
});

export const confirmRiderDocumentUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ConfirmUploadInput.parse(d))
  .handler(async ({ data }) => {
    if (!isValidExpiryDate(data.expiryDate)) {
      throw new Error("تاريخ الانتهاء غير صحيح");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rider = await loadVerifiedRider(supabaseAdmin, data.riderId, data.password);

    // `path` is client-supplied — requestRiderDocumentUpload only ever
    // grants a signed URL under this exact prefix, so requiring it here
    // stops this rider's own valid password from being used to "confirm"
    // some OTHER rider's (or doc type's) existing file instead.
    const prefix = `${rider.company_id}/${data.riderId}/${data.docType}-`;
    if (!data.path.startsWith(prefix)) {
      throw new Error("مسار الملف غير صالح");
    }
    // The file's name/extension comes from `path` itself (which carries the
    // exact fileExt requestRiderDocumentUpload already validated) rather
    // than a second, independently-supplied fileName — so there's no gap
    // where the recorded extension could disagree with the uploaded bytes'
    // real one.
    const extMatch = /\.[a-zA-Z0-9]+$/.exec(data.path);
    const ext = extMatch ? extMatch[0].toLowerCase() : "";
    if (!hasAllowedDocExtension(ext)) {
      throw new Error("امتداد الملف غير مسموح — يُقبل فقط JPG أو PNG أو PDF");
    }
    const fileName = `${data.docType}${ext}`;

    const { data: prev } = await supabaseAdmin
      .from("rider_documents")
      .select("storage_path")
      .eq("rider_id", data.riderId)
      .eq("doc_type", data.docType)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("rider_documents").upsert(
      {
        company_id: rider.company_id,
        rider_id: data.riderId,
        doc_type: data.docType,
        storage_path: data.path,
        file_name: fileName,
        card_number: null,
        plate_number: null,
        expiry_date: data.expiryDate,
        needs_expiry: true,
        label: null,
        uploaded_at: new Date().toISOString(),
        last_updated_by: "rider",
      },
      { onConflict: "rider_id,doc_type" },
    );
    if (error) throw new Error(error.message);

    if (prev?.storage_path && prev.storage_path !== data.path) {
      await supabaseAdmin.storage.from("rider-documents").remove([prev.storage_path]);
    }

    return { ok: true };
  });
