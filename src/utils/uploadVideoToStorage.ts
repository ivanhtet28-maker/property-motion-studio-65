import { supabase } from "@/lib/supabase";

/**
 * Upload a canvas-generated video blob to Supabase Storage.
 * Returns the public URL so Shotstack can fetch it for stitching.
 */
export async function uploadVideoToStorage(
  blob: Blob,
  folder: string,
  fileName: string
): Promise<string> {
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  const path = `canvas-clips/${folder}/${fileName}.${ext}`;

  const { data, error } = await supabase.storage
    .from("property-images")
    .upload(path, blob, {
      contentType: blob.type,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload canvas video clip: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("property-images")
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}
