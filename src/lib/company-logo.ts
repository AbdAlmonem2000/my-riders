import { supabase } from "@/integrations/supabase/client";

// Storage keys reject non-ASCII/special characters (see the report-upload
// fix in admin.tsx) — never embed the raw file name.
export async function uploadCompanyLogo(file: File): Promise<string> {
  const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
  const safeExt = extMatch ? extMatch[0] : "";
  const path = `${crypto.randomUUID()}${safeExt}`;
  const { error } = await supabase.storage
    .from("company-logos")
    .upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadCompanyStamp(file: File): Promise<string> {
  const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
  const safeExt = extMatch ? extMatch[0] : "";
  const path = `${crypto.randomUUID()}${safeExt}`;
  const { error } = await supabase.storage
    .from("company-stamps")
    .upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("company-stamps").getPublicUrl(path);
  return data.publicUrl;
}

// Signature is a separate image from the stamp, but shares the same public
// bucket — no reason to stand up a second bucket for one more image type.
export async function uploadCompanySignature(file: File): Promise<string> {
  const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name);
  const safeExt = extMatch ? extMatch[0] : "";
  const path = `${crypto.randomUUID()}${safeExt}`;
  const { error } = await supabase.storage
    .from("company-stamps")
    .upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("company-stamps").getPublicUrl(path);
  return data.publicUrl;
}
