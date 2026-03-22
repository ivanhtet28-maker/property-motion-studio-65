/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";


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
//
// PROMPTING RULES (Runway Gen-4 Turbo best practices):
// 1. Describe MOTION only — the source image provides all visuals
// 2. Use POSITIVE phrasing — negative instructions cause unpredictable results
// 3. One scene, one camera move per clip
// 4. Include STABILITY language — preserve surfaces, geometry, lighting
// 5. Specify EASING — ease-in/ease-out prevents jarring starts/stops
// 6. Specify SPEED precisely — "2 inches per second" beats "slow"
// 7. Reference the SOURCE IMAGE lighting — never invent lighting
// 8. ALL clips are 5s — quality degrades in longer generations
//    (73% perfect consistency at 5s vs significant drift at 10s)
// ============================================

// Shared stability suffix appended to every prompt.
// Prevents Gen4 from hallucinating new objects, warping geometry,
// or shifting the lighting away from the source image.
const STABILITY_SUFFIX =
  "Maintain all visible surfaces, furniture, and architectural geometry exactly as shown. " +
  "Preserve the existing lighting and color temperature throughout. " +
  "Photo-realistic cinematography, 24fps filmic motion blur.";

// Concise geometry lock for rotational/vertical motions.
// Research shows one clear sentence outperforms a full paragraph — the model
// responds better to concise constraints than detailed lists of prohibitions.
const GEOMETRY_PRESERVATION =
  "Maintain perfect perspective geometry — all architectural lines stay straight and unchanged.";

interface MotionConfig {
  promptText: string;
  landscapePromptText?: string; // Landscape-specific prompt (wider arc for orbit motions)
  duration: 5; // Always 5s — research shows best quality and consistency
}

const MOTION_MAP: Record<string, MotionConfig> = {
  "push-in": {
    promptText:
      "Steady dolly forward — camera advances straight ahead toward the center of the frame on a smooth rail with minimal vibration. " +
      "Smooth, steady speed throughout. " +
      STABILITY_SUFFIX,
    duration: 5,
  },
  "pull-out": {
    promptText:
      "Steady dolly backward — camera retreats straight back along the room's center axis on a smooth rail with minimal vibration. " +
      "Frame stays perfectly centered throughout, gradually revealing the full width and depth of the space. " +
      "Smooth, steady speed throughout. " +
      STABILITY_SUFFIX,
    duration: 5,
  },
  "glide-left": {
    promptText:
      "Lateral tracking shot — camera glides smoothly to the left on a straight dolly track while facing forward. " +
      "Pure sideways movement — no forward push, no zoom, no arc. The camera slides left in a straight line. " +
      "Steady speed throughout, revealing adjacent areas and connected spaces. " +
      STABILITY_SUFFIX,
    duration: 5,
  },
  "glide-right": {
    promptText:
      "Lateral tracking shot — camera glides smoothly to the right on a straight dolly track while facing forward. " +
      "Pure sideways movement — no forward push, no zoom, no arc. The camera slides right in a straight line. " +
      "Steady speed throughout, revealing adjacent areas and connected spaces. " +
      STABILITY_SUFFIX,
    duration: 5,
  },
  "orbit-right": {
    promptText:
      "Sweeping arc shot — camera curves clockwise on a circular dolly track, arcing approximately 50 degrees to the right around the room's center. " +
      "Constant radial distance from the subject — no forward or backward movement, only lateral arc. " +
      "Foreground objects shift against the background, creating strong parallax depth. " +
      "Steady orbital speed throughout. " +
      GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
    landscapePromptText:
      "Wide sweeping arc shot — camera orbits clockwise around the room in a dramatic 60-degree arc to the right. " +
      "Strong lateral camera displacement — the viewpoint physically moves sideways, not zooming. " +
      "Foreground objects shift significantly against the background, creating bold parallax. " +
      "The camera traces a curved dolly path, never pushing straight forward. " +
      "Steady orbital speed throughout. " +
      GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
    duration: 5,
  },
  "orbit-left": {
    promptText:
      "Sweeping arc shot — camera curves counter-clockwise on a circular dolly track, arcing approximately 50 degrees to the left around the room's center. " +
      "Constant radial distance from the subject — no forward or backward movement, only lateral arc. " +
      "Foreground objects shift against the background, creating strong parallax depth. " +
      "Steady orbital speed throughout. " +
      GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
    landscapePromptText:
      "Wide sweeping arc shot — camera orbits counter-clockwise around the room in a dramatic 60-degree arc to the left. " +
      "Strong lateral camera displacement — the viewpoint physically moves sideways, not zooming. " +
      "Foreground objects shift significantly against the background, creating bold parallax. " +
      "The camera traces a curved dolly path, never pushing straight forward. " +
      "Steady orbital speed throughout. " +
      GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
    duration: 5,
  },
  "drone-up": {
    promptText:
      "Crane up — camera rises smoothly upward at a moderate, steady speed while gently tilting down to keep the scene centered. " +
      "The landscape and surroundings gradually enter the frame from the edges, revealing the full scale of the property. " +
      GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
    duration: 5,
  },
  "static": {
    promptText:
      "Locked-off tripod shot. Camera is perfectly stationary on a heavy tripod with zero movement. " +
      "Professional still composition highlighting the space. Natural ambient environment with subtle life — gentle light shifts, soft atmosphere. The frame is completely stable. " +
      STABILITY_SUFFIX,
    duration: 5,
  },
};

function composePrompt(cameraAction: string, outputFormat?: string): string {
  // Backwards compat: map legacy "orbit" to orbit-right
  const action = cameraAction === "orbit" ? "orbit-right" : cameraAction;
  const config = MOTION_MAP[action];
  if (!config) return MOTION_MAP["push-in"].promptText;
  // Use landscape-specific prompt if available and format is landscape
  if (outputFormat === "landscape" && config.landscapePromptText) {
    return config.landscapePromptText;
  }
  return config.promptText;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    console.log("=== generate-runway-batch INVOKED (GEN4 TURBO — 5s CLIPS ONLY) ===");
    const { imageMetadata, propertyAddress, outputFormat } = await req.json();

    if (!imageMetadata || !Array.isArray(imageMetadata) || imageMetadata.length === 0) {
      throw new Error("imageMetadata array is required");
    }

    if (!RUNWAY_API_KEY) {
      console.error("RUNWAY_API_KEY is NOT set in secrets!");
      throw new Error("RUNWAY_API_KEY not configured");
    }

    console.log(`=== RUNWAY GEN4 TURBO BATCH: ${imageMetadata.length} clips ===`);

    // Portrait 9:16 at 720:1280 — Gen4 Turbo native portrait ratio.
    // Runway center-crops landscape source images to fill the frame.
    // Pre-cropping to 9:16 before submission prevents losing important content.
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
        const effectiveAction = (cameraAction && MOTION_MAP[cameraAction]) ? cameraAction : "push-in";
        const promptText = composePrompt(effectiveAction, outputFormat);

        // All clips are 5s — research shows quality degrades significantly
        // after 5s with Gen4 Turbo, especially for architecture/interiors.
        // Shotstack uses first 4.5s (trimming the last ~0.5s melt zone).
        const clipDuration = 5;

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
