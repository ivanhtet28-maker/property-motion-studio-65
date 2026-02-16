/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
  import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

  // Stability prompt - replaces verbose motion prompts since end-frames handle motion
  const STABILITY_PROMPT = `ULTRA-STABLE architecture, no morphing, no distortion, locked walls and furniture.
Maintain strict architectural accuracy and straight vertical lines.
Consistent exposure, no flicker, no warping.
Natural interior/exterior lighting, soft realistic shadows and reflections.
Luxury real estate cinematography, calm and elegant mood.
No people, no vehicles, no text, no watermarks, no UI, no camera artifacts.
Photorealistic, clean, stable, professional property marketing video.
4K quality.`;

  /**
   * Create an end-frame by cropping 10% from the original image and resizing back.
   * This forces the AI to create a smooth zoom/pan path between start and end frames.
   *
   * Crop strategies:
   * - zoom-in/auto: 10% center crop (simulates dolly-in)
   * - pan-right: 10% crop aligned to right edge
   * - pan-left: 10% crop aligned to left edge
   */
  async function createEndFrame(
    imageUrl: string,
    cameraAngle: string
  ): Promise<string | null> {
    try {
      console.log(`Creating end frame for: ${imageUrl} (angle: ${cameraAngle})`);

      // Fetch the original image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }

      const imageBuffer = new Uint8Array(await response.arrayBuffer());
      const image = await Image.decode(imageBuffer);

      const originalWidth = image.width;
      const originalHeight = image.height;
      console.log(`Original dimensions: ${originalWidth}x${originalHeight}`);

      // Calculate crop dimensions (90% of original = 10% crop)
      const cropWidth = Math.round(originalWidth * 0.9);
      const cropHeight = Math.round(originalHeight * 0.9);

      let cropX: number;
      let cropY: number;

      switch (cameraAngle) {
        case "pan-right":
          // Crop aligned to right edge
          cropX = originalWidth - cropWidth;
          cropY = Math.round((originalHeight - cropHeight) / 2);
          break;
        case "pan-left":
          // Crop aligned to left edge
          cropX = 0;
          cropY = Math.round((originalHeight - cropHeight) / 2);
          break;
        case "zoom-in":
        case "auto":
        default:
          // Center crop (simulates zoom-in)
          cropX = Math.round((originalWidth - cropWidth) / 2);
          cropY = Math.round((originalHeight - cropHeight) / 2);
          break;
      }

      // Add subtle random jitter to avoid robotic motion (AutoReel-style)
      const jitterX = Math.round(Math.random() * 6 - 3);
      const jitterY = Math.round(Math.random() * 6 - 3);
      cropX = Math.max(0, Math.min(cropX + jitterX, originalWidth - cropWidth));
      cropY = Math.max(0, Math.min(cropY + jitterY, originalHeight - cropHeight));

      console.log(`Cropping: ${cropWidth}x${cropHeight} at (${cropX}, ${cropY}) [jitter: ${jitterX}, ${jitterY}]`);

      // Crop the image
      const cropped = image.crop(cropX, cropY, cropWidth, cropHeight);

      // Resize back to original dimensions (forces the AI to see a zoom path)
      cropped.resize(originalWidth, originalHeight);

      console.log(`End frame created: ${originalWidth}x${originalHeight}`);

      // Encode as JPEG
      const endFrameBuffer = await cropped.encodeJPEG(85);

      // Upload to Supabase Storage
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const fileName = `end-frame-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const filePath = `end-frames/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("video-assets")
        .upload(filePath, endFrameBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) {
        console.error("Failed to upload end frame:", uploadError);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from("video-assets")
        .getPublicUrl(filePath);

      console.log("End frame uploaded:", urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error("Error creating end frame:", error);
      return null;
    }
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    try {
      const { imageMetadata, propertyAddress } = await req.json();

      if (!imageMetadata || !Array.isArray(imageMetadata) || imageMetadata.length === 0) {
        throw new Error("imageMetadata array is required");
      }

      if (!LUMA_API_KEY) {
        throw new Error("LUMA_API_KEY not configured");
      }

      console.log(`=== END-FRAME LOGIC: Batch generation for ${imageMetadata.length} images ===`);

      const generationPromises = imageMetadata.map(async (metadata: { url: string; cameraAngle: string; duration: number }, index) => {
        const { url: imageUrl, cameraAngle, duration } = metadata;
        try {
          console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
          console.log(`Image: ${imageUrl}`);
          console.log(`Camera angle: ${cameraAngle}, Duration: ${duration}s`);

          // Step 1: Create end frame (10% cropped version)
          const endFrameUrl = await createEndFrame(imageUrl, cameraAngle);

          if (!endFrameUrl) {
            console.warn(`Failed to create end frame for clip ${index + 1}, falling back to start-frame-only`);
          }

          // Step 2: Build simplified prompt (end-frames handle motion, prompt handles quality)
          const motionDescription = cameraAngle === "zoom-in" || cameraAngle === "auto"
            ? "Smooth subtle zoom into the scene."
            : cameraAngle === "pan-right"
              ? "Smooth subtle pan to the right."
              : cameraAngle === "pan-left"
                ? "Smooth subtle pan to the left."
                : "Smooth subtle camera movement.";

          const fullPrompt = `High-end cinematic real estate video of ${propertyAddress}.
${motionDescription}
${STABILITY_PROMPT}`.trim();

          console.log(`Prompt: ${fullPrompt.substring(0, 100)}...`);

          // Step 3: Build keyframes (start + end frame if available)
          const keyframes: Record<string, { type: string; url: string }> = {
            frame0: {
              type: "image",
              url: imageUrl,
            },
          };

          // Add end frame if successfully created (THE KEY IMPROVEMENT)
          if (endFrameUrl) {
            keyframes.frame1 = {
              type: "image",
              url: endFrameUrl,
            };
            console.log(`Using END-FRAME approach: frame0 (original) + frame1 (10% crop)`);
          } else {
            console.log(`Using START-FRAME only (fallback)`);
          }

          // Step 4: Call Luma API with both keyframes
          const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LUMA_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "ray-2",
              prompt: fullPrompt,
              keyframes: keyframes,
              aspect_ratio: "9:16",
              loop: false,
              duration: "9s",
              negative_prompt: "morphing, room distortion, melting walls, wavy floors, changing furniture, flickering, structural changes, hallucination, blurry architecture, zooming into darkness, changing light sources, shifting shadows, shaking, camera shake, jitter, wobble, vibration, handheld, unstable",
              motion_bucket_id: 3,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Luma API error for image ${index + 1}:`, {
              status: response.status,
              statusText: response.statusText,
              error: errorText,
              imageUrl: imageUrl,
            });
            return {
              imageUrl,
              generationId: null,
              status: "error" as const,
              error: `Luma API ${response.status}: ${errorText}`,
            };
          }

          const data = await response.json();
          console.log(`Generation ${index + 1} started: ${data.id}`);

          return {
            imageUrl,
            generationId: data.id,
            status: "queued" as const,
          };
        } catch (error) {
          console.error(`Error creating generation for image ${index + 1}:`, error);
          return {
            imageUrl,
            generationId: null,
            status: "error" as const,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      });

      const results = await Promise.all(generationPromises);

      const successful = results.filter((r) => r.status === "queued");
      const failed = results.filter((r) => r.status === "error");

      console.log(`\n=== Batch complete: ${successful.length} queued, ${failed.length} failed ===`);

      if (successful.length === 0) {
        console.error("All generations failed. Error details:");
        failed.forEach((result, index) => {
          console.error(`Image ${index + 1} error:`, result.error);
        });

        const firstError = failed[0]?.error || "Unknown error";

        if (firstError.includes("Insufficient credits")) {
          throw new Error("Luma AI account has insufficient credits. Please add credits at https://lumalabs.ai/billing");
        } else if (firstError.includes("401")) {
          throw new Error("Invalid Luma API key. Please check your LUMA_API_KEY secret.");
        } else if (firstError.includes("403")) {
          throw new Error("Luma API access forbidden. Please check your account status.");
        }

        throw new Error(`All Luma generations failed. First error: ${firstError}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          generations: results,
          totalRequested: imageMetadata.length,
          successful: successful.length,
          failed: failed.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error in batch generation:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  });
