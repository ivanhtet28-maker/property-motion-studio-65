/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1/image_to_video";
const RUNWAY_VERSION = "2024-11-06";

async function fetchWithRetry(url: string, options: RequestInit, retries = 2, attempt = 1): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.status === 429 && retries > 0) {
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

// ============================================
// CAMERA MOTION SYSTEM — User's manual choice
// No AI detection. User picks the camera move.
// Runway receives the full uncropped image with
// matching aspect ratio so it sees the whole picture.
// ============================================

interface MotionConfig {
  camera_motion: { zoom: number; horizontal: number; pan: number; tilt: number; vertical: number; roll: number };
  basePrompt: string;
}

const MOTION_MAP: Record<string, MotionConfig> = {
  "push-in": {
    camera_motion: { zoom: 2, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Slow forward dolly toward the focal point. Eye-level, chest-height camera perspective.",
  },
  "pull-out": {
    camera_motion: { zoom: -2, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Gentle pullback revealing the full space. Eye-level, chest-height camera perspective.",
  },
  "truck-left": {
    camera_motion: { zoom: 0, horizontal: -3, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Smooth lateral slide to the left. Eye-level, chest-height camera perspective.",
  },
  "truck-right": {
    camera_motion: { zoom: 0, horizontal: 3, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Smooth lateral slide to the right. Eye-level, chest-height camera perspective.",
  },
  "pedestal-up": {
    camera_motion: { zoom: 0, horizontal: 0, pan: 0, tilt: -1, vertical: 2, roll: 0 },
    basePrompt: "Camera rises vertically, tilting down to hold the subject in frame.",
  },
  "pedestal-down": {
    camera_motion: { zoom: 0, horizontal: 0, pan: 0, tilt: 1, vertical: -2, roll: 0 },
    basePrompt: "Camera lowers vertically, tilting up to hold the subject in frame.",
  },
  "orbit": {
    camera_motion: { zoom: 0, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Cinematic orbit arc around the subject. Eye-level, chest-height camera perspective.",
  },
  "static": {
    camera_motion: { zoom: 0, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Locked tripod shot. Minimal camera movement. Let the space speak for itself.",
  },
  "drone-up": {
    camera_motion: { zoom: -1, horizontal: 0, pan: 0, tilt: -2, vertical: 3, roll: 0 },
    basePrompt: "Rising drone reveal. Camera lifts and tilts down to showcase the property from above.",
  },
};

const ANTI_HALLUCINATION = "Locked geometry. No morphing, no liquid surfaces, no structural movement. Do not add lens flares, light blooms, god rays, or modify existing light sources. Preserve exact lighting conditions from the source photo. Keep all walls, floors, ceilings, and furniture perfectly stable.";

function composePrompt(cameraAction: string): string {
  const config = MOTION_MAP[cameraAction];
  if (!config) return MOTION_MAP["push-in"].basePrompt + " " + ANTI_HALLUCINATION;
  return config.basePrompt + " " + ANTI_HALLUCINATION;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    console.log("=== generate-runway-batch INVOKED (MANUAL CAMERA SYSTEM) ===");
    const { imageMetadata, propertyAddress } = await req.json();

    if (!imageMetadata || !Array.isArray(imageMetadata) || imageMetadata.length === 0) {
      throw new Error("imageMetadata array is required");
    }

    if (!RUNWAY_API_KEY) {
      console.error("RUNWAY_API_KEY is NOT set in secrets!");
      throw new Error("RUNWAY_API_KEY not configured");
    }

    console.log(`=== RUNWAY GEN3A TURBO BATCH: ${imageMetadata.length} clips ===`);

    const generationPromises = imageMetadata.map(async (metadata: {
      url: string;
      cameraAction?: string;
      cameraAngle?: string;
      duration?: number;
      seed?: number;
      isLandscape?: boolean;
    }, index: number) => {
      const { url: imageUrl, cameraAction, seed, isLandscape } = metadata;
      try {
        // Use the user's chosen camera action (no AI override)
        const effectiveAction = (cameraAction && MOTION_MAP[cameraAction]) ? cameraAction : "push-in";
        const motionConfig = MOTION_MAP[effectiveAction];
        const finalMotion = { ...motionConfig.camera_motion };
        const promptText = composePrompt(effectiveAction);

        // Match Runway ratio to image orientation so the full picture is visible
        const ratio = isLandscape === false ? "768:1280" : "1280:768";

        console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
        console.log(`  Image: ${imageUrl}`);
        console.log(`  cameraAction: ${effectiveAction}`);
        console.log(`  isLandscape: ${isLandscape}`);
        console.log(`  ratio: ${ratio}`);
        console.log(`  motion: ${JSON.stringify(finalMotion)}`);
        console.log(`  prompt: ${promptText}`);

        const requestBody: Record<string, unknown> = {
          model: "gen3a_turbo",
          promptImage: imageUrl,
          promptText: promptText,
          camera_motion: finalMotion,
          ratio: ratio,
          duration: 5,
        };

        if (seed) {
          requestBody.seed = seed;
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
          console.error(`Runway API error for clip ${index + 1}:`, {
            status: response.status,
            error: errorText,
          });
          return {
            imageUrl,
            generationId: null,
            status: "error" as const,
            error: `Runway API ${response.status}: ${errorText}`,
          };
        }

        const data = await response.json();
        console.log(`Clip ${index + 1} started: ${data.id}`);

        if (!data.id) {
          return {
            imageUrl,
            generationId: null,
            status: "error" as const,
            error: `Runway API returned no task ID. Response: ${JSON.stringify(data)}`,
          };
        }

        return {
          imageUrl,
          generationId: data.id,
          status: "queued" as const,
        };
      } catch (error) {
        console.error(`Error creating clip ${index + 1}:`, error);
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
      failed.forEach((result, index) => {
        console.error(`Clip ${index + 1} error:`, result.error);
      });

      const firstError = failed[0]?.error || "Unknown error";

      if (firstError.includes("401") || firstError.includes("Unauthorized")) {
        throw new Error("Invalid Runway API key. Please check your RUNWAY_API_KEY secret.");
      } else if (firstError.includes("402") || firstError.includes("Payment Required") || firstError.includes("insufficient") || firstError.includes("credits")) {
        throw new Error("Runway account has insufficient credits. Please add credits at https://app.runwayml.com/billing");
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
