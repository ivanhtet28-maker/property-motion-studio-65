/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1/image_to_video";
const RUNWAY_VERSION = "2024-11-06";

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  try {
    const response = await fetch(url, options);
    // Retry on 5xx server errors (Runway sometimes flakes)
    if (response.status >= 500 && retries > 0) {
      console.warn(`Server error ${response.status}, retrying in 2s (${retries} retries left)...`);
      await new Promise(r => setTimeout(r, 2000));
      return fetchWithRetry(url, options, retries - 1);
    }
    return response;
  } catch (err) {
    if (retries === 0) throw err;
    console.warn(`Fetch failed, retrying in 2s (${retries} retries left)...`);
    await new Promise(r => setTimeout(r, 2000));
    return fetchWithRetry(url, options, retries - 1);
  }
}

/**
 * Map camera angle to a prompt-based motion description.
 * Gen4 Turbo doesn't have a camera_control parameter —
 * motion is controlled via promptText.
 */
function getMotionPrompt(cameraAngle: string): string {
  switch (cameraAngle) {
    case "pan-right":
      return `
Confident steady camera pan to the right, clearly revealing the full space.
Smooth continuous motion throughout the shot.
      `;
    case "pan-left":
      return `
Confident steady camera pan to the left, clearly revealing the full space.
Smooth continuous motion throughout the shot.
      `;
    case "zoom-in":
      return `
Smooth dolly forward into the scene, pushing steadily toward the focal point.
Clear forward momentum throughout the shot.
      `;
    case "wide-shot":
      return `
Locked tripod shot.
Absolutely no camera movement.
Perfectly stable frame.
      `;
    case "auto":
    default:
      return `
Gentle cinematic camera glide through the space.
Steady continuous drift with clear visible movement.
      `;
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

    if (!RUNWAY_API_KEY) {
      throw new Error("RUNWAY_API_KEY not configured");
    }

    console.log(`=== RUNWAY GEN4 TURBO BATCH: Generating ${imageMetadata.length} clips ===`);

    const MAX_CONCURRENT = 1;
    const results: { imageUrl: string; generationId: string | null; status: "queued" | "error"; error?: string }[] = [];

    for (let i = 0; i < imageMetadata.length; i += MAX_CONCURRENT) {
      const slice = imageMetadata.slice(i, i + MAX_CONCURRENT);
      console.log(`\n=== Processing batch ${Math.floor(i / MAX_CONCURRENT) + 1} (${slice.length} clips) ===`);

      const batchResults = await Promise.all(slice.map(async (metadata: { url: string; cameraAngle: string; duration: number }, sliceIndex: number) => {
        const index = i + sliceIndex;
        const { url: imageUrl, cameraAngle, duration } = metadata;
        try {
          console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
          console.log(`Image: ${imageUrl}`);
          const clipDuration = Math.min(Math.max(duration ?? 6, 2), 10);
          console.log(`Camera angle: ${cameraAngle}, Duration: ${clipDuration}s`);

          const motionPrompt = getMotionPrompt(cameraAngle);

          const structuralGuardrails = `
No warping, no bending walls, no perspective distortion.
Architecture remains perfectly rigid and realistic.
`;

          const promptText = `
High-end cinematic real estate video of ${propertyAddress}.
${motionPrompt}
${structuralGuardrails}
Consistent natural lighting, soft realistic shadows.
Ultra-clean photorealistic footage.
No film grain, no motion blur artifacts.
Professional luxury property marketing.
Bright, airy, calm atmosphere.
`.trim();

          console.log(`Prompt: ${promptText.substring(0, 120)}...`);

          const response = await fetchWithRetry(RUNWAY_API_URL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RUNWAY_API_KEY}`,
              "Content-Type": "application/json",
              "X-Runway-Version": RUNWAY_VERSION,
            },
            body: JSON.stringify({
              model: "gen4_turbo",
              promptImage: [{ uri: imageUrl, position: "first" }],
              promptText: promptText,
              ratio: "720:1280",
              duration: clipDuration,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Runway API error for image ${index + 1}:`, {
              status: response.status,
              statusText: response.statusText,
              error: errorText,
              imageUrl: imageUrl,
              promptLength: promptText.length,
              duration: clipDuration,
            });
            return {
              imageUrl,
              generationId: null,
              status: "error" as const,
              error: `Runway API ${response.status}: ${errorText}`,
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
      }));

      results.push(...batchResults);
    }

    const successful = results.filter((r) => r.status === "queued");
    const failed = results.filter((r) => r.status === "error");

    console.log(`\n=== Batch complete: ${successful.length} queued, ${failed.length} failed ===`);

    if (successful.length === 0) {
      console.error("All generations failed. Error details:");
      failed.forEach((result, index) => {
        console.error(`Image ${index + 1} error:`, result.error);
      });

      const firstError = failed[0]?.error || "Unknown error";

      if (firstError.includes("401") || firstError.includes("Unauthorized")) {
        throw new Error("Invalid Runway API key. Please check your RUNWAY_API_KEY secret.");
      } else if (firstError.includes("403")) {
        throw new Error("Runway API access forbidden. Please check your account status.");
      } else if (firstError.includes("429")) {
        throw new Error("Runway API rate limit exceeded. Please try again later.");
      }

      throw new Error(`All Runway generations failed. First error: ${firstError}`);
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
