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


// Target aspect ratio for portrait social media (9:16 = 0.5625)
const TARGET_RATIO = 9 / 16;
// Threshold: if image is already within this ratio of portrait, skip cropping
const RATIO_TOLERANCE = 0.15; // 15% tolerance

interface SmartCropRequest {
  imageUrl: string;
  // Optional: bias the crop toward a specific region (0.0 = left/top, 1.0 = right/bottom)
  horizontalBias?: number;
}

interface SmartCropResult {
  url: string;
  cropped: boolean;
  originalWidth?: number;
  originalHeight?: number;
  croppedWidth?: number;
  croppedHeight?: number;
}

/**
 * Smart 9:16 portrait crop for real estate photos.
 *
 * Runway Gen4 Turbo center-crops blindly when aspect ratio doesn't match.
 * This function intelligently crops landscape images to 9:16 BEFORE sending
 * to Runway, preserving the most important content.
 *
 * Strategy:
 * - Portrait/square images: pass through unchanged
 * - Landscape images: crop to 9:16 using center-weighted positioning
 *   (real estate photos typically have the subject centered)
 * - Preserves full height, crops width symmetrically from edges
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const body = await req.json();

    // Support both single image and batch mode
    const isBatch = Array.isArray(body.images);

    if (isBatch) {
      const images: SmartCropRequest[] = body.images;
      if (!images || images.length === 0) {
        throw new Error("images array is required");
      }

      console.log(`=== SMART CROP BATCH: ${images.length} images ===`);

      const results = await Promise.all(
        images.map((img, i) => processImage(img.imageUrl, img.horizontalBias, i))
      );

      const cropped = results.filter(r => r.cropped).length;
      console.log(`Batch done: ${cropped}/${images.length} images cropped to 9:16`);

      return new Response(
        JSON.stringify({ success: true, results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single image mode
    const { imageUrl, horizontalBias }: SmartCropRequest = body;
    if (!imageUrl) {
      throw new Error("imageUrl is required");
    }

    const result = await processImage(imageUrl, horizontalBias, 0);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Smart crop error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Smart crop failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processImage(
  imageUrl: string,
  horizontalBias: number | undefined,
  index: number
): Promise<SmartCropResult> {
  try {
    // SSRF protection: validate the image URL
    const urlCheck = validateImageUrl(imageUrl);
    if (!urlCheck.valid) {
      console.warn(`[${index}] URL validation failed: ${urlCheck.error}`);
      return { url: imageUrl, cropped: false };
    }

    // Fetch the source image
    const imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!imageResponse.ok) {
      console.warn(`[${index}] Failed to fetch image: HTTP ${imageResponse.status}`);
      return { url: imageUrl, cropped: false };
    }

    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());

    // Read dimensions and decide whether to crop
    const result = ImageMagick.read(imageBytes, (image) => {
      const width = image.width;
      const height = image.height;
      const currentRatio = width / height;

      console.log(`[${index}] Image: ${width}x${height} (ratio: ${currentRatio.toFixed(3)})`);

      // Already portrait or close enough — no crop needed
      if (currentRatio <= TARGET_RATIO * (1 + RATIO_TOLERANCE)) {
        console.log(`[${index}] Already portrait-ish (${currentRatio.toFixed(3)} <= ${(TARGET_RATIO * (1 + RATIO_TOLERANCE)).toFixed(3)}), skipping`);
        return { skip: true, width, height } as const;
      }

      // Calculate the 9:16 crop region
      // Keep full height, crop width to match 9:16
      const targetWidth = Math.round(height * TARGET_RATIO);
      const targetHeight = height;

      // Center-weighted horizontal crop (bias defaults to 0.5 = center)
      const bias = horizontalBias ?? 0.5;
      const maxOffset = width - targetWidth;
      const xOffset = Math.round(maxOffset * bias);

      console.log(`[${index}] Cropping: ${width}x${height} → ${targetWidth}x${targetHeight} (x=${xOffset}, bias=${bias})`);

      const geometry = new MagickGeometry(xOffset, 0, targetWidth, targetHeight);
      image.crop(geometry);
      image.resetPage();
      image.quality = 90;

      const croppedData = image.write((data) => new Uint8Array(data));
      return {
        skip: false,
        width,
        height,
        croppedWidth: targetWidth,
        croppedHeight: targetHeight,
        data: croppedData,
      } as const;
    });

    if (result.skip) {
      return {
        url: imageUrl,
        cropped: false,
        originalWidth: result.width,
        originalHeight: result.height,
      };
    }

    // Upload cropped image to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const folder = `portrait-crops/${Date.now()}`;
    const filePath = `${folder}/image-${index}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("video-assets")
      .upload(filePath, result.data, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.warn(`[${index}] Upload failed: ${uploadError.message}, using original`);
      return { url: imageUrl, cropped: false };
    }

    const { data: urlData } = supabase.storage
      .from("video-assets")
      .getPublicUrl(filePath);

    console.log(`[${index}] Cropped and uploaded: ${urlData.publicUrl.substring(0, 80)}...`);

    return {
      url: urlData.publicUrl,
      cropped: true,
      originalWidth: result.width,
      originalHeight: result.height,
      croppedWidth: result.croppedWidth,
      croppedHeight: result.croppedHeight,
    };
  } catch (err) {
    console.warn(`[${index}] Smart crop failed: ${err instanceof Error ? err.message : err}`);
    return { url: imageUrl, cropped: false };
  }
}
