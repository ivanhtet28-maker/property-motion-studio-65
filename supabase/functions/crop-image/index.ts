/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth, validateImageUrl } from "../_shared/auth.ts";
import {
  ImageMagick,
  initializeImageMagick,
  MagickGeometry,
} from "npm:@imagemagick/magick-wasm@0.0.30";

// Load and initialize the WASM binary once at module level
const wasmBytes = await Deno.readFile(
  new URL(
    "magick.wasm",
    import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30"),
  ),
);
await initializeImageMagick(wasmBytes);


interface CropRequest {
  imageUrl: string;
  cropRegion: { x: number; y: number; width: number; height: number };
  outputPath: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { user, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const { imageUrl, cropRegion, outputPath }: CropRequest = await req.json();

    if (!imageUrl || !cropRegion || !outputPath) {
      return new Response(
        JSON.stringify({ error: "Missing imageUrl, cropRegion, or outputPath" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Path traversal protection: sanitize outputPath
    const normalizedPath = outputPath.replace(/\\/g, "/");
    if (
      normalizedPath.includes("..") ||
      normalizedPath.startsWith("/") ||
      normalizedPath.includes("//")
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid output path" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure output goes to the authenticated user's folder
    const userFolder = user!.id;
    const safePath = normalizedPath.startsWith(`${userFolder}/`)
      ? normalizedPath
      : `${userFolder}/${normalizedPath}`;

    // SSRF protection: validate the image URL
    const urlCheck = validateImageUrl(imageUrl);
    if (!urlCheck.valid) {
      return new Response(
        JSON.stringify({ error: urlCheck.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Cropping ${imageUrl} → region(${cropRegion.x},${cropRegion.y},${cropRegion.width}x${cropRegion.height})`);

    // Fetch the source image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: HTTP ${imageResponse.status}`);
    }
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());

    // Crop using magick-wasm
    const croppedBytes = ImageMagick.read(imageBytes, (image) => {
      // Set the crop geometry with offset
      const geometry = new MagickGeometry(
        cropRegion.x,
        cropRegion.y,
        cropRegion.width,
        cropRegion.height,
      );
      image.crop(geometry);

      // Reset the page to remove offset metadata (standard ImageMagick practice after crop)
      image.resetPage();

      // Write as JPEG at 90% quality
      image.quality = 90;
      return image.write((data) => new Uint8Array(data));
    });

    // Upload cropped image to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: uploadError } = await supabase.storage
      .from("property-images")
      .upload(safePath, croppedBytes, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from("property-images")
      .getPublicUrl(safePath);

    console.log(`Crop uploaded → ${urlData.publicUrl}`);

    return new Response(
      JSON.stringify({ success: true, url: urlData.publicUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Crop error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Crop failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
