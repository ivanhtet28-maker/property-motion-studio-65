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
// GEN4 TURBO — Prompt-driven camera control
// No numeric camera_motion sliders.
// Gen4 Turbo uses natural language in promptText
// for superior motion quality and zero hallucinations.
// ============================================

interface MotionConfig {
  promptText: string;
  duration: number; // 5 or 10 seconds — complex motions get 10s
}

// ============================================
// PROMPTING RULES (from Runway Gen-4 official guide):
// 1. Focus prompts on MOTION, not visual description (image provides visuals)
// 2. Use POSITIVE phrasing only — negative phrasing ("no X", "don't X")
//    produces unpredictable or OPPOSITE results
// 3. Keep it simple — one scene, one motion per clip
// 4. Short, direct, cinematic language
// ============================================

// Gen4 Turbo best practice: short prompts focused on MOTION only.
// The image provides all visual context — the prompt just directs camera movement.
const SCENE_ANCHOR = "Cinematic real estate. Stable architecture, sharp detail.";

const MOTION_MAP: Record<string, MotionConfig> = {
  "push-in": {
    promptText: `Slow steady dolly forward toward the focal point. Smooth, gentle forward glide. ${SCENE_ANCHOR}`,
    duration: 5,
  },
  "pull-out": {
    promptText: `Slow cinematic pullback revealing the full space. Steady backward glide. ${SCENE_ANCHOR}`,
    duration: 5,
  },
  "truck-left": {
    promptText: `Smooth lateral tracking shot sliding left. Camera faces forward while moving sideways. ${SCENE_ANCHOR}`,
    duration: 5,
  },
  "truck-right": {
    promptText: `Smooth lateral tracking shot sliding right. Camera faces forward while moving sideways. ${SCENE_ANCHOR}`,
    duration: 5,
  },
  "pedestal-up": {
    promptText: `Camera rises vertically like a crane shot, tilting down to keep the scene centered. ${SCENE_ANCHOR}`,
    duration: 5,
  },
  "pedestal-down": {
    promptText: `Camera lowers vertically like a descending crane, tilting up to keep the scene centered. ${SCENE_ANCHOR}`,
    duration: 5,
  },
  "orbit": {
    promptText: `Slow cinematic arc orbit around the center of the scene. Gentle circular dolly path. ${SCENE_ANCHOR}`,
    duration: 10,
  },
  "orbit-360": {
    promptText: `Full 360-degree orbit around the room at chest height, revealing every angle. Steady circular dolly track. ${SCENE_ANCHOR}`,
    duration: 10,
  },
  "static": {
    promptText: `Locked tripod shot. Camera perfectly still with only subtle ambient light shifts. ${SCENE_ANCHOR}`,
    duration: 5,
  },
  "drone-up": {
    promptText: `Rising aerial drone reveal. Camera ascends vertically, tilting down to keep the property centered. ${SCENE_ANCHOR}`,
    duration: 10,
  },
};

function composePrompt(cameraAction: string): string {
  const config = MOTION_MAP[cameraAction];
  if (!config) return MOTION_MAP["push-in"].promptText;
  return config.promptText;
}

function getDuration(cameraAction: string): number {
  const config = MOTION_MAP[cameraAction];
  if (!config) return 5;
  return config.duration;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    console.log("=== generate-runway-batch INVOKED (GEN4 TURBO — PROMPT-DRIVEN CAMERA) ===");
    const { imageMetadata, propertyAddress, outputFormat } = await req.json();

    if (!imageMetadata || !Array.isArray(imageMetadata) || imageMetadata.length === 0) {
      throw new Error("imageMetadata array is required");
    }

    if (!RUNWAY_API_KEY) {
      console.error("RUNWAY_API_KEY is NOT set in secrets!");
      throw new Error("RUNWAY_API_KEY not configured");
    }

    console.log(`=== RUNWAY GEN4 TURBO BATCH: ${imageMetadata.length} clips ===`);

    // All clips generated in portrait (9:16) at 720:1280 — the Gen4 Turbo
    // native portrait ratio. Runway center-crops landscape source images
    // to fill the portrait frame, which is the standard approach for
    // portrait reels (same as Auto Reel, etc.).
    const ratio = outputFormat === "landscape" ? "1280:720" : "720:1280";
    console.log(`Output format: ${outputFormat || "portrait (default)"} — ratio: ${ratio}`);

    const generationPromises = imageMetadata.map(async (metadata: {
      url: string;
      cameraAction?: string;
      cameraAngle?: string;
      duration?: number;
      seed?: number;
      isLandscape?: boolean;
    }, index: number) => {
      const { url: imageUrl, cameraAction, seed } = metadata;
      try {
        // Use the user's chosen camera action (no AI override)
        const effectiveAction = (cameraAction && MOTION_MAP[cameraAction]) ? cameraAction : "push-in";
        const promptText = composePrompt(effectiveAction);
        const clipDuration = getDuration(effectiveAction);

        console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
        console.log(`  Image: ${imageUrl}`);
        console.log(`  cameraAction: ${effectiveAction}`);
        console.log(`  ratio: ${ratio}`);
        console.log(`  duration: ${clipDuration}s`);
        console.log(`  prompt: ${promptText.substring(0, 120)}...`);

        const requestBody: Record<string, unknown> = {
          model: "gen4_turbo",
          promptImage: imageUrl,
          promptText: promptText,
          ratio: ratio,
          duration: clipDuration,
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
          duration: clipDuration,
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
