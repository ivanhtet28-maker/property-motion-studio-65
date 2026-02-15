/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

  // Duration-aware motion intensity modifiers
  function getMotionModifier(duration: number): string {
    switch (duration) {
      case 3:
      case 3.5:
        return `Motion intensity: slow and controlled. Clearly visible but stable movement.`;
      case 4:
      case 4.5:
        return `Motion intensity: very slow, nearly static. Reduce movement to prevent drift.`;
      case 5:
        return `Motion intensity: ultra-slow micro-motion only. Minimal parallax, almost static.`;
      default:
        return `Motion intensity: slow and controlled. Clearly visible but stable movement.`;
    }
  }

  // Pan angle budgets based on duration
  function getPanAngleBudget(duration: number): string {
    switch (duration) {
      case 3:
      case 3.5:
        return `Pan angle budget: small pan (about 7–8 degrees total).`;
      case 4:
      case 4.5:
        return `Pan angle budget: micro pan (about 4–5 degrees total).`;
      case 5:
        return `Pan angle budget: very small micro pan (about 3–4 degrees total).`;
      default:
        return `Pan angle budget: small pan (about 7–8 degrees total).`;
    }
  }

  // Push-in distance budgets based on duration
  function getPushInBudget(duration: number): string {
    switch (duration) {
      case 3:
      case 3.5:
        return `Push-in distance: SUBTLE but VISIBLE FORWARD movement.`;
      case 4:
      case 4.5:
        return `Push-in distance: VERY SMALL FORWARD MOVEMENT ONLY.`;
      case 5:
        return `Push-in distance: MICRO FORWARD MOVEMENT ONLY.`;
      default:
        return `Push-in distance: SUBTLE but VISIBLE FORWARD movement.`;
    }
  }

  // Camera angle prompts for Luma AI
  const CAMERA_ANGLE_PROMPTS: Record<string, string> = {
    auto: `ULTRA-STABLE camera, locked horizon, tripod-level steadiness.
Motion: micro parallax only (small), no rotation, no translation.
No shaking, no jitter, no wobble.
Constant motion, no acceleration, no sudden changes.`,

    "wide-shot": `Locked STATIC WIDE ESTABLISHING SHOT.
Tripod-mounted, completely motionless.
No panning, no tilting, no zooming, no movement at all.
Horizon perfectly level, vertical lines perfectly straight.`,

    "zoom-in": `ULTRA-STABLE SLOW PUSH-IN (DOLLY-IN) TOWARD CENTER focal point.
Push-in distance budget: small (subtle).
Forward movement ONLY on a straight slider path.
No rotation, no pan, no tilt, no vertical movement.
Constant speed, no acceleration.
No shaking, no jitter, no wobble.`,

    "pan-left": `ULTRA-STABLE YAW ROTATION to LEFT ONLY.
Pan angle budget: small (about 4–6 degrees total).
Rotation-only around a fixed pivot point (tripod fluid head).
No dolly, no zoom, no tilt, no vertical movement, no forward/backward movement.
Constant speed, no acceleration.
No shaking, no jitter, no wobble.`,

    "pan-right": `Ultra-stable YAW ROTATION to RIGHT ONLY.
Pan angle budget: small (about 4–6 degrees total).
Rotation-only around a fixed pivot point (tripod fluid head).
No dolly, no zoom, no tilt, no vertical movement, no forward/backward movement.
Constant speed, no acceleration.
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

          // Build custom prompt based on camera angle and duration
          const anglePrompt = CAMERA_ANGLE_PROMPTS[cameraAngle] || CAMERA_ANGLE_PROMPTS["auto"];
          const motionModifier = getMotionModifier(duration);

          // Add specific angle budgets for pan and zoom
          const panBudget = (cameraAngle === "pan-left" || cameraAngle === "pan-right")
            ? getPanAngleBudget(duration)
            : "";

          const pushInBudget = (cameraAngle === "zoom-in")
            ? getPushInBudget(duration)
            : "";

          const fullPrompt = `High-end cinematic real estate video of ${propertyAddress}.
${motionModifier}
${panBudget}
${pushInBudget}
${anglePrompt}
${BASE_PROMPT_SUFFIX}`.trim();

          console.log(`Full prompt for clip ${index + 1}:`, fullPrompt);

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
        // Log detailed error information
        console.error("All generations failed. Error details:");
        failed.forEach((result, index) => {
          console.error(`Image ${index + 1} error:`, result.error);
        });

        const firstError = failed[0]?.error || "Unknown error";
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