import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCanManageCompany } from "@/lib/accounts.functions";
import { hasAllowedDocExtension, isValidExpiryDate } from "@/lib/document-status";

const ExpiryDateSchema = z.string().refine(isValidExpiryDate, "تاريخ الانتهاء غير صحيح");

const UploadInput = z.object({
  companyId: z.string().uuid(),
  // Present when replacing an existing document's file/label/date; absent
  // when adding a brand-new one.
  documentId: z.string().uuid().nullable(),
  label: z.string().trim().min(1).max(150),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  expiryDate: ExpiryDateSchema,
});

// Adds (or replaces) one official company document. The file is already in
// storage by the time this runs — the client uploads it directly then calls
// this to record it — so validation here is defense in depth.
export const uploadCompanyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManageCompany(supabase, userId, data.companyId);

    if (!hasAllowedDocExtension(data.fileName)) {
      throw new Error("امتداد الملف غير مسموح — يُقبل فقط JPG أو PNG أو PDF");
    }

    let prevStoragePath: string | null = null;
    if (data.documentId) {
      const { data: existing } = await supabase
        .from("company_documents")
        .select("storage_path")
        .eq("id", data.documentId)
        .eq("company_id", data.companyId)
        .maybeSingle();
      if (!existing) throw new Error("المستند غير موجود");
      prevStoragePath = existing.storage_path;

      const { error } = await supabase
        .from("company_documents")
        .update({
          label: data.label,
          storage_path: data.storagePath,
          file_name: data.fileName,
          expiry_date: data.expiryDate,
          uploaded_at: new Date().toISOString(),
        })
        .eq("id", data.documentId)
        .eq("company_id", data.companyId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("company_documents").insert({
        company_id: data.companyId,
        label: data.label,
        storage_path: data.storagePath,
        file_name: data.fileName,
        expiry_date: data.expiryDate,
      });
      if (error) throw new Error(error.message);
    }

    if (prevStoragePath && prevStoragePath !== data.storagePath) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("company-documents").remove([prevStoragePath]);
    }

    return { ok: true };
  });

export const updateCompanyDocumentExpiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        documentId: z.string().uuid(),
        expiryDate: ExpiryDateSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManageCompany(supabase, userId, data.companyId);

    const { data: updated, error } = await supabase
      .from("company_documents")
      .update({ expiry_date: data.expiryDate })
      .eq("id", data.documentId)
      .eq("company_id", data.companyId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("المستند غير موجود");
    return { ok: true };
  });

export const deleteCompanyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid(), documentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManageCompany(supabase, userId, data.companyId);

    const { data: existing } = await supabase
      .from("company_documents")
      .select("storage_path")
      .eq("id", data.documentId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!existing) throw new Error("المستند غير موجود");

    const { error } = await supabase
      .from("company_documents")
      .delete()
      .eq("id", data.documentId)
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("company-documents").remove([existing.storage_path]);

    return { ok: true };
  });

export const getCompanyDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ companyId: z.string().uuid(), documentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCanManageCompany(supabase, userId, data.companyId);

    const { data: doc } = await supabase
      .from("company_documents")
      .select("storage_path, file_name")
      .eq("id", data.documentId)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!doc) throw new Error("المستند غير موجود");

    const { data: signed, error } = await supabase.storage
      .from("company-documents")
      .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
    if (error || !signed) throw new Error(error?.message ?? "تعذر تجهيز رابط التنزيل");
    return { url: signed.signedUrl };
  });
