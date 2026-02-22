/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

const STABILITY_PROMPT = `ULTRA-STABLE architecture, no morphing, no distortion, locked walls and furniture.
Maintain strict architectural accuracy and straight vertical lines.
Consistent exposure, no flicker, no warping.
Natural interior/exterior lighting, soft realistic shadows and reflections.
High-energy luxury real estate cinematography, dynamic and impactful.
No people, no vehicles, no text, no watermarks, no UI, no camera artifacts.
Photorealistic, clean, stable, professional property marketing video.
4K quality.`;

const NEGATIVE_PROMPT = [
  "morphing, room distortion, melting walls, wavy floors, changing furniture, flickering",
  "structural changes, hallucination, blurry architecture, zooming into darkness",
  "changing light sources, shifting shadows, surreal elements, AI artifacts, unnatural colors",
  "camera shake, jitter, wobble, vibration, handheld, unstable, shaking",
  "aspect ratio distortion, stretching, squishing, letterbox, pillarbox, black bars",
  "warped perspective, fisheye, wide angle distortion, content outside original frame",
  "generated background, padding, cropped borders, image borders",
].join(", ");

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
      const { url: imageUrl, cameraAngle } = metadata;
      try {
        console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
        console.log(`Image: ${imageUrl}, angle: ${cameraAngle}`);

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
              frame0: { type: "image", url: imageUrl },
            },
            aspect_ratio: "9:16",
            loop: false,
            duration: "5s",
            negative_prompt: NEGATIVE_PROMPT,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Luma API error for image ${index + 1}:`, response.status, errorText);
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
      failed.forEach((result, i) => console.error(`Image ${i + 1} error:`, result.error));

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
