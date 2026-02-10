/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

  // Camera angle prompts for Luma AI
  const CAMERA_ANGLE_PROMPTS: Record<string, string> = {
    auto: `Ultra-stable camera with locked horizon and tripod-level steadiness.
Extremely slow, controlled motion only: subtle forward dolly OR micro parallax (choose one), no rotation.
No shaking, no jitter, no wobble, no handheld motion.
Smooth continuous motion start-to-finish with constant speed and no sudden changes.`,

    "wide-shot": `Locked static wide establishing shot.
Tripod-mounted, completely motionless.
No panning, no tilting, no zooming, no movement at all.
Horizon perfectly level, vertical lines perfectly straight.`,

    "zoom-in": `Ultra-stable slow push-in (dolly-in) toward the center focal point.
Camera moves forward ONLY on a straight slider path.
No rotation, no pan, no tilt, no vertical movement.
Constant speed push-in, smooth from start to end.
No shaking, no jitter, no wobble.`,

    "pan-left": `Ultra-stable pan left ONLY.
Rotation-only motion around a fixed pivot point (tripod fluid head).
No dolly, no zoom, no tilt, no vertical movement.
Constant speed rotation, smooth from start to end.
No shaking, no jitter, no wobble.`,

    "pan-right": `Ultra-stable pan right ONLY.
Rotation-only motion around a fixed pivot point (tripod fluid head).
No dolly, no zoom, no tilt, no vertical movement.
Constant speed rotation, smooth from start to end.
No shaking, no jitter, no wobble.`,
  };

  const BASE_PROMPT_SUFFIX = `Maintain strict architectural accuracy and straight vertical lines.
Consistent exposure, no flicker, no warping.
Natural interior/exterior lighting (match the input image), soft realistic shadows and reflections.
Luxury real estate cinematography, calm and elegant mood.
No people, no vehicles, no text, no watermarks, no UI, no camera artifacts.
Photorealistic, clean, stable, professional property marketing video.
4K quality.`;

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

      console.log(`Starting batch generation for ${imageMetadata.length} images...`);

      const generationPromises = imageMetadata.map(async (metadata: { url: string; cameraAngle: string; duration: number }, index) => {
        const { url: imageUrl, cameraAngle, duration } = metadata;
        try {
          console.log(`Creating generation ${index + 1}/${imageMetadata.length} for image:`, imageUrl);
          console.log(`Camera angle: ${cameraAngle}, Duration: ${duration}s`);

          // Build custom prompt based on camera angle
          const anglePrompt = CAMERA_ANGLE_PROMPTS[cameraAngle] || CAMERA_ANGLE_PROMPTS["auto"];
          const fullPrompt = `High-end cinematic real estate video of ${propertyAddress}.
${anglePrompt}
${BASE_PROMPT_SUFFIX}`;

          // Luma API v1
          const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LUMA_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "ray-2",
              prompt: fullPrompt,
              keyframes: {
                frame0: {
                  type: "image",
                  url: imageUrl,
                },
              },
              aspect_ratio: "9:16",
              loop: false,
              // Note: Luma AI may not support custom durations yet
              // If supported in future, use: duration: duration
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Luma API error for image ${index + 1}:`, errorText);
            return {
              imageUrl,
              generationId: null,
              status: "error" as const,
              error: `Luma API error: ${errorText}`,
            };
          }

          const data = await response.json();
          console.log(`Generation ${index + 1} started:`, data.id);

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

      console.log(`Batch generation complete: ${successful.length} queued, ${failed.length} failed`);

      if (successful.length === 0) {
        throw new Error("All generations failed");
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