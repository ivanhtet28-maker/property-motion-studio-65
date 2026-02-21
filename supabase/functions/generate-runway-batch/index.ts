/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1/image_to_video";
const RUNWAY_VERSION = "2024-11-06";

// Both gen3a_turbo and gen4_turbo only support 5 or 10 second durations
function toValidRunwayDuration(duration: number): 5 | 10 {
  return duration <= 7 ? 5 : 10;
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2, attempt = 1): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.status === 429 && retries > 0) {
      // Rate limit — exponential backoff: 15s, 30s, 60s
      const waitSec = 15 * Math.pow(2, attempt - 1);
      console.warn(`Rate limited (429), waiting ${waitSec}s before retry (${retries} retries left)...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      return fetchWithRetry(url, options, retries - 1, attempt + 1);
    }
    if (response.status >= 500 && retries > 0) {
      console.warn(`Server error ${response.status}, retrying in 2s (${retries} retries left)...`);
      await new Promise(r => setTimeout(r, 2000));
      return fetchWithRetry(url, options, retries - 1, attempt + 1);
    }
    return response;
  } catch (err) {
    if (retries === 0) throw err;
    console.warn(`Fetch failed, retrying in 2s (${retries} retries left)...`);
    await new Promise(r => setTimeout(r, 2000));
    return fetchWithRetry(url, options, retries - 1, attempt + 1);
  }
}

/**
 * Camera motion config for Gen-3 Alpha Turbo.
 *
 * WHY gen3a_turbo instead of gen4_turbo:
 *   gen3a_turbo supports explicit numeric camera control parameters (cameraMotion)
 *   with values from -10 to 10. This gives precise, deterministic camera movement.
 *   gen4_turbo only supports text-based camera description, which the model interprets
 *   unpredictably — causing unwanted scene animations alongside camera movement.
 *
 * cameraMotion axes:
 *   horizontal: lateral slide — negative = left, positive = right
 *   pan:        rotational yaw — negative = left, positive = right
 *   zoom:       dolly — negative = out, positive = in
 *   vertical:   vertical slide — negative = down, positive = up
 *   tilt:       rotational pitch — negative = down, positive = up
 *   roll:       camera rotation around its own axis
 *
 * Combining horizontal + pan creates smooth cinematic pans (Runway's own recommendation).
 * Text prompt is kept minimal — it complements the cameraMotion, not replaces it.
 */
interface CameraMotionConfig {
  cameraMotion?: {
    horizontal?: number;
    vertical?: number;
    pan?: number;
    tilt?: number;
    zoom?: number;
    roll?: number;
  };
  promptText: string;
}

function getCameraConfig(cameraAngle: string): CameraMotionConfig {
  switch (cameraAngle) {
    case "pan-right":
      return {
        cameraMotion: { horizontal: 5, pan: 3 },
        promptText: "Smooth camera pan right. The scene is completely still.",
      };
    case "pan-left":
      return {
        cameraMotion: { horizontal: -5, pan: -3 },
        promptText: "Smooth camera pan left. The scene is completely still.",
      };
    case "zoom-in":
      return {
        cameraMotion: { zoom: 5 },
        promptText: "Slow camera zoom in. The scene is completely still.",
      };
    case "wide-shot":
      return {
        // No cameraMotion — all axes default to 0 (locked-off shot)
        promptText: "Locked-off static shot. The entire scene is completely motionless.",
      };
    case "auto":
    default:
      return {
        cameraMotion: { zoom: 3 },
        promptText: "Gentle slow push-in. The scene is completely still.",
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    console.log("=== generate-runway-batch INVOKED ===");
    const { imageMetadata, propertyAddress } = await req.json();

    if (!imageMetadata || !Array.isArray(imageMetadata) || imageMetadata.length === 0) {
      throw new Error("imageMetadata array is required");
    }

    if (!RUNWAY_API_KEY) {
      console.error("RUNWAY_API_KEY is NOT set in secrets!");
      throw new Error("RUNWAY_API_KEY not configured");
    }

    console.log(`=== RUNWAY GEN3A TURBO BATCH: Generating ${imageMetadata.length} clips ===`);
    console.log(`RUNWAY_API_KEY present: ${!!RUNWAY_API_KEY}, length: ${RUNWAY_API_KEY.length}, prefix: ${RUNWAY_API_KEY.substring(0, 8)}...`);

    // Submit all at once — Runway queues excess tasks with THROTTLED status.
    // No requests-per-minute rate limit; no concurrency cap needed client-side.
    const generationPromises = imageMetadata.map(async (metadata: { url: string; cameraAngle: string; duration: number }, index: number) => {
      const { url: imageUrl, cameraAngle, duration } = metadata;
      try {
        console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
        console.log(`Image: ${imageUrl}`);
        const clipDuration = toValidRunwayDuration(duration ?? 5);
        console.log(`Camera angle: ${cameraAngle}, Duration: ${clipDuration}s`);

        const { cameraMotion, promptText } = getCameraConfig(cameraAngle);
        console.log(`Prompt: ${promptText}`);
        if (cameraMotion) {
          console.log(`cameraMotion: ${JSON.stringify(cameraMotion)}`);
        }

        // gen3a_turbo uses 768:1280 for portrait (vs gen4_turbo's 720:1280)
        const requestBody: Record<string, unknown> = {
          model: "gen3a_turbo",
          promptImage: imageUrl,
          promptText: promptText,
          ratio: "768:1280",
          duration: clipDuration,
        };

        // Only include cameraMotion when there is actual camera movement
        if (cameraMotion) {
          requestBody.cameraMotion = cameraMotion;
        }

        const response = await fetchWithRetry(RUNWAY_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RUNWAY_API_KEY}`,
            "Content-Type": "application/json",
            "X-Runway-Version": RUNWAY_VERSION,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Runway API error for image ${index + 1}:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            imageUrl: imageUrl,
            apiUrl: RUNWAY_API_URL,
            apiVersion: RUNWAY_VERSION,
          });
          return {
            imageUrl,
            generationId: null,
            status: "error" as const,
            error: `Runway API ${response.status}: ${errorText}`,
          };
        }

        const data = await response.json();
        console.log(`Generation ${index + 1} response:`, JSON.stringify(data));

        if (!data.id) {
          console.error(`Runway API returned 200 but no task ID for image ${index + 1}:`, data);
          return {
            imageUrl,
            generationId: null,
            status: "error" as const,
            error: `Runway API returned no task ID. Response: ${JSON.stringify(data)}`,
          };
        }

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
