import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { copyBetweenBuckets } from "@/lib/documents.functions";

const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png"] as const;

// Riders have no Supabase Auth session — same custom-password model every
// other rider-initiated write in this app uses (see set_rider_password,
// register_rider_push) — so every function here verifies the password
// itself via rider_password_ok (service role; granted to it in
// 20261104000000_rider_own_photo_upload.sql) instead of requireSupabaseAuth.
//
// rider_password_ok alone isn't enough here: it returns true for ANY
// riderId that matches no row at all (password_hash IS NULL → "no password
// required"), which every existing caller is safe from because they all
// JOIN against real rider/report rows first. These two functions don't join
// against anything else, so they'd otherwise issue a signed upload URL (and
// later write riders.photo_url) for a fabricated riderId. This also brings
// in the same company-suspended / rider-blocked checks every other
// rider-initiated read/write in this app already has (e.g. register_rider_push,
// list_rider_reports) that were missing here entirely.
async function loadVerifiedRider(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  riderId: string,
  password: string,
): Promise<{ id: string; company_id: string }> {
  const { data: rider } = await supabaseAdmin
    .from("riders")
    .select("id, company_id, is_blocked")
    .eq("id", riderId)
    .maybeSingle();
  if (!rider) throw new Error("المندوب غير موجود");
  if (rider.is_blocked) throw new Error("تم حظر هذا المندوب");

  const { data: companyActive } = await supabaseAdmin.rpc("is_company_active", {
    _company_id: rider.company_id,
  });
  if (!companyActive) throw new Error("الشركة غير مفعّلة حاليًا");

  const { data: ok, error } = await supabaseAdmin.rpc("rider_password_ok", {
    _rider_id: riderId,
    _password: password,
  });
  if (error || !ok) throw new Error("كلمة المرور غير صحيحة");

  return { id: rider.id, company_id: rider.company_id };
}

// Step 1 of the rider uploading their own photo: once their password
// checks out, hands back a short-lived signed URL the browser uploads the
// file to directly — the actual bytes never pass through this function, the
// same "client uploads straight to storage" shape every other upload in
// this app follows, just via a signed URL instead of an RLS-gated session
// (which a rider doesn't have one of).
const RequestUploadInput = z.object({
  riderId: z.string().uuid(),
  // Empty when the rider never set a password — rider_password_ok treats
  // that as "no password required" and returns true regardless, same as
  // every other rider-initiated RPC in this app.
  password: z.string(),
  fileExt: z.enum(PHOTO_EXTENSIONS),
});

export const requestRiderPhotoUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RequestUploadInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadVerifiedRider(supabaseAdmin, data.riderId, data.password);

    const path = `${data.riderId}-${Date.now()}${data.fileExt}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("rider-photos")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "تعذر تجهيز رابط الرفع");
    return { path, token: signed.token };
  });

// Step 2: the file is already sitting at `path` in the public rider-photos
// bucket by now (the browser just uploaded it there with the signed token
// from step 1) — this records it as the rider's photo (the same field
// riders.tsx's own photo editor writes) and mirrors the same image into the
// private "الصورة الشخصية" document, so whichever side next changes the
// photo — the rider here, or an admin via Documents — shows the exact same
// image instead of two that can drift apart.
const ConfirmUploadInput = z.object({
  riderId: z.string().uuid(),
  password: z.string(),
  path: z.string().min(1),
});

export const confirmRiderPhotoUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ConfirmUploadInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rider = await loadVerifiedRider(supabaseAdmin, data.riderId, data.password);

    // `path` is client-supplied — requestRiderPhotoUpload only ever grants a
    // signed URL at `${riderId}-...`, so requiring that same prefix here
    // stops this rider's own valid password from being used to "confirm"
    // some OTHER rider's existing public photo path instead.
    if (!data.path.startsWith(`${data.riderId}-`)) {
      throw new Error("مسار الملف غير صالح");
    }

    // Storage side first, riders.photo_url last — that update is what makes
    // the new photo "go live" everywhere it's rendered, so if anything above
    // it throws, the rider's current photo is left untouched instead of
    // showing a new public image before its private document mirror exists.
    const extMatch = /\.[a-zA-Z0-9]+$/.exec(data.path);
    const ext = extMatch ? extMatch[0].toLowerCase() : ".jpg";
    const privatePath = `${rider.company_id}/${data.riderId}/personal_photo-${Date.now()}${ext}`;
    await copyBetweenBuckets(
      supabaseAdmin,
      "rider-photos",
      data.path,
      "rider-documents",
      privatePath,
    );

    const { data: prevDoc } = await supabaseAdmin
      .from("rider_documents")
      .select("storage_path")
      .eq("rider_id", data.riderId)
      .eq("doc_type", "personal_photo")
      .maybeSingle();
    const { error: docErr } = await supabaseAdmin.from("rider_documents").upsert(
      {
        company_id: rider.company_id,
        rider_id: data.riderId,
        doc_type: "personal_photo",
        storage_path: privatePath,
        file_name: `photo${ext}`,
        card_number: null,
        plate_number: null,
        expiry_date: null,
        needs_expiry: false,
        label: null,
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: "rider_id,doc_type" },
    );
    if (docErr) throw new Error(docErr.message);
    if (prevDoc?.storage_path && prevDoc.storage_path !== privatePath) {
      await supabaseAdmin.storage.from("rider-documents").remove([prevDoc.storage_path]);
    }

    const { data: pub } = supabaseAdmin.storage.from("rider-photos").getPublicUrl(data.path);
    const photoUrl = pub.publicUrl as string;
    // A new photo was just uploaded — any rotation an admin set to correct
    // the OLD image (updateRiderPhotoRotation) no longer applies to it.
    const { error: updateErr } = await supabaseAdmin
      .from("riders")
      .update({ photo_url: photoUrl, photo_rotation: 0 })
      .eq("id", data.riderId);
    if (updateErr) throw new Error(updateErr.message);

    return { photoUrl };
  });
