/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
  import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

  // Target output aspect ratio (portrait video)
  const TARGET_ASPECT = 9 / 16;

  // Stability prompt - end-frames handle motion, this handles quality/realism
  const STABILITY_PROMPT = `ULTRA-STABLE architecture, no morphing, no distortion, locked walls and furniture.
Maintain strict architectural accuracy and straight vertical lines.
Consistent exposure, no flicker, no warping.
Natural interior/exterior lighting, soft realistic shadows and reflections.
High-energy luxury real estate cinematography, dynamic and impactful.
No people, no vehicles, no text, no watermarks, no UI, no camera artifacts.
Photorealistic, clean, stable, professional property marketing video.
4K quality.`;

  const NEGATIVE_PROMPT = [
    // Content hallucination
    "morphing, room distortion, melting walls, wavy floors, changing furniture, flickering",
    "structural changes, hallucination, blurry architecture, zooming into darkness",
    "changing light sources, shifting shadows, surreal elements, AI artifacts, unnatural colors",
    // Camera instability
    "camera shake, jitter, wobble, vibration, handheld, unstable, shaking",
    // Aspect ratio / framing distortion — the main cause of landscape hallucinations
    "aspect ratio distortion, stretching, squishing, letterbox, pillarbox, black bars",
    "warped perspective, fisheye, wide angle distortion, content outside original frame",
    "generated background, padding, cropped borders, image borders",
  ].join(", ");

  /**
   * For a given image URL and camera angle, returns:
   *   startFrameUrl — portrait-cropped version of the original (uploaded to storage if landscape)
   *   endFrameUrl   — the motion end frame (10% crop of the portrait start, resized back)
   *
   * For landscape inputs the image is first center-cropped to 9:16 so Luma never
   * has to invent content outside the original frame. Both keyframes are then
   * derived purely from real pixels.
   */
  async function createFrames(
    imageUrl: string,
    cameraAngle: string
  ): Promise<{ startFrameUrl: string | null; endFrameUrl: string | null }> {
    try {
      console.log(`Creating frames for: ${imageUrl} (angle: ${cameraAngle})`);

      const fetchResponse = await fetch(imageUrl);
      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch image: ${fetchResponse.status} ${fetchResponse.statusText}`);
      }

      const imageBuffer = new Uint8Array(await fetchResponse.arrayBuffer());
      const image = await Image.decode(imageBuffer);

      const originalWidth = image.width;
      const originalHeight = image.height;
      const originalAspect = originalWidth / originalHeight;
      const isLandscape = originalAspect > TARGET_ASPECT + 0.02; // tolerance for near-square images

      console.log(`Original dimensions: ${originalWidth}x${originalHeight} ratio:${originalAspect.toFixed(3)} (${isLandscape ? "LANDSCAPE — will pre-crop to portrait" : "portrait/square — no pre-crop needed"})`);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // --- Step 1: Portrait normalisation ---
      // If the image is landscape, center-crop to 9:16 before Luma sees it.
      // This ensures both keyframes are made of 100% real pixels.
      let workImage = image;
      let startFrameUrl: string | null = null; // null means "use the original URL as-is"

      if (isLandscape) {
        const portraitWidth = Math.round(originalHeight * TARGET_ASPECT);
        const portraitCropX = Math.round((originalWidth - portraitWidth) / 2);

        console.log(`Portrait crop: ${portraitWidth}x${originalHeight} at x=${portraitCropX}`);
        workImage = image.crop(portraitCropX, 0, portraitWidth, originalHeight);

        const startFrameBuffer = await workImage.encodeJPEG(90);
        const startFileName = `start-frame-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
        const startFilePath = `end-frames/${startFileName}`;

        const { error: startUploadError } = await supabase.storage
          .from("video-assets")
          .upload(startFilePath, startFrameBuffer, { contentType: "image/jpeg", upsert: true });

        if (startUploadError) {
          console.error("Failed to upload portrait start frame:", startUploadError);
          // Fall back to original URL — Luma will still do aspect conversion, but
          // at least the end-frame crop will be consistent.
          workImage = image;
        } else {
          const { data: urlData } = supabase.storage
            .from("video-assets")
            .getPublicUrl(startFilePath);
          startFrameUrl = urlData.publicUrl;
          console.log("Portrait start frame uploaded:", startFrameUrl);
        }
      }

      // --- Step 2: Motion end-frame crop (applied to portrait workImage) ---
      const workWidth = workImage.width;
      const workHeight = workImage.height;

      // Crop 18% inward — resizing back creates a zoom path from real pixels
      const cropWidth = Math.round(workWidth * 0.82);
      const cropHeight = Math.round(workHeight * 0.82);

      let cropX: number;
      let cropY: number;

      switch (cameraAngle) {
        case "orbit-right":
          cropX = workWidth - cropWidth;
          cropY = Math.round((workHeight - cropHeight) / 2);
          break;
        case "orbit-left":
          cropX = 0;
          cropY = Math.round((workHeight - cropHeight) / 2);
          break;
        case "push-out":
          cropX = 0;
          cropY = 0;
          break;
        case "push-in":
        case "zoom-in":
        case "auto":
        default:
          cropX = Math.round((workWidth - cropWidth) / 2);
          cropY = Math.round((workHeight - cropHeight) / 2);
          break;
      }

      // Subtle jitter to avoid robotic motion
      const jitterX = Math.round(Math.random() * 6 - 3);
      const jitterY = Math.round(Math.random() * 6 - 3);
      cropX = Math.max(0, Math.min(cropX + jitterX, workWidth - cropWidth));
      cropY = Math.max(0, Math.min(cropY + jitterY, workHeight - cropHeight));

      console.log(`Motion crop: ${cropWidth}x${cropHeight} at (${cropX}, ${cropY}) [jitter: ${jitterX}, ${jitterY}]`);

      const endFrameImage = workImage.crop(cropX, cropY, cropWidth, cropHeight);
      endFrameImage.resize(workWidth, workHeight);

      const endFrameBuffer = await endFrameImage.encodeJPEG(85);
      const endFileName = `end-frame-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
      const endFilePath = `end-frames/${endFileName}`;

      const { error: endUploadError } = await supabase.storage
        .from("video-assets")
        .upload(endFilePath, endFrameBuffer, { contentType: "image/jpeg", upsert: true });

      if (endUploadError) {
        console.error("Failed to upload end frame:", endUploadError);
        return { startFrameUrl, endFrameUrl: null };
      }

      const { data: endUrlData } = supabase.storage
        .from("video-assets")
        .getPublicUrl(endFilePath);

      console.log("End frame uploaded:", endUrlData.publicUrl);
      return { startFrameUrl, endFrameUrl: endUrlData.publicUrl };
    } catch (error) {
      console.error("Error creating frames:", error);
      return { startFrameUrl: null, endFrameUrl: null };
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

      console.log(`=== LUMA BATCH: ${imageMetadata.length} images ===`);

      const generationPromises = imageMetadata.map(async (metadata: { url: string; cameraAngle: string; duration: number }, index) => {
        const { url: imageUrl, cameraAngle, duration } = metadata;
        try {
          console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
          console.log(`Image: ${imageUrl}`);
          console.log(`Camera angle: ${cameraAngle}, Duration: ${duration}s`);

          // Step 1: Build portrait start frame + motion end frame from real pixels only
          const { startFrameUrl, endFrameUrl } = await createFrames(imageUrl, cameraAngle);

          // Use the portrait-normalised start frame if we had to convert from landscape
          const effectiveStartUrl = startFrameUrl || imageUrl;

          if (startFrameUrl) {
            console.log(`Landscape detected — using portrait-cropped start frame`);
          }
          if (!endFrameUrl) {
            console.warn(`Failed to create end frame for clip ${index + 1}, falling back to start-frame-only`);
          }

          // Step 2: Build motion prompt
          const motionDescription =
            cameraAngle === "push-in" || cameraAngle === "zoom-in" || cameraAngle === "auto"
              ? "Fast aggressive cinematic push-in toward the focal point, high-velocity forward camera drive."
              : cameraAngle === "push-out"
                ? "Fast aggressive cinematic pull-back from the scene, rapid dramatic reveal."
                : cameraAngle === "orbit-right"
                  ? "Fast aggressive cinematic sweep right, rapid horizontal camera drive across the space."
                  : cameraAngle === "orbit-left"
                    ? "Fast aggressive cinematic sweep left, rapid horizontal camera drive across the space."
                    : "Fast aggressive cinematic camera movement, high-velocity drive.";

          const fullPrompt = `High-end cinematic real estate video of ${propertyAddress}.
${motionDescription}
${STABILITY_PROMPT}`.trim();

          // Step 3: Build keyframes
          const keyframes: Record<string, { type: string; url: string }> = {
            frame0: { type: "image", url: effectiveStartUrl },
          };

          if (endFrameUrl) {
            keyframes.frame1 = { type: "image", url: endFrameUrl };
            console.log(`Using END-FRAME approach: frame0 (portrait start) + frame1 (motion crop)`);
          } else {
            console.log(`Using START-FRAME only (fallback)`);
          }

          // Step 4: Call Luma API
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
              duration: "5s",
              negative_prompt: NEGATIVE_PROMPT,
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
