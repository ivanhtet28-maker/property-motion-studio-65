/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
    const { imageUrl, cropRegion, outputPath }: CropRequest = await req.json();

    if (!imageUrl || !cropRegion || !outputPath) {
      return new Response(
        JSON.stringify({ error: "Missing imageUrl, cropRegion, or outputPath" }),
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
      .upload(outputPath, croppedBytes, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from("property-images")
      .getPublicUrl(outputPath);

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
