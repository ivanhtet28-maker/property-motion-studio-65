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

// Enhanced geometry preservation for rotational/vertical motions.
// Mitigates hallucination risk on orbit, crane, drone motions.
const GEOMETRY_PRESERVATION =
  "Critical: Maintain perfect perspective geometry—walls remain perfectly straight, " +
  "floor lines parallel, ceiling lines parallel. No architectural distortion, no furniture repositioning, " +
  "no morphing of existing elements. All architectural lines must remain unchanged.";

interface MotionConfig {
  promptText: string;
  duration: 5; // Always 5s — research shows best quality and consistency
}

const MOTION_MAP: Record<string, MotionConfig> = {
  "push-in": {
    promptText:
      "Professional videography: Steady dolly forward at a gentle pace, easing in from stillness over the first half-second and maintaining constant speed. " +
      "Camera advances straight ahead toward the center of the frame on a smooth rail with minimal vibration. " +
      "Cinematic framing, subject centered and well-composed. " +
      STABILITY_SUFFIX,
    duration: 5,
  },
  "pull-out": {
    promptText:
      "Professional videography: Steady dolly backward at a gentle pace, easing in from stillness and maintaining constant speed. " +
      "Camera retreats straight back along a smooth rail, gradually revealing the full context and spatial depth of the property. " +
      "Cinematic reveal showcasing the entire room or space. " +
      STABILITY_SUFFIX,
    duration: 5,
  },
  "tracking": {
    promptText:
      "Professional lateral tracking shot sliding sideways at a steady pace. Camera faces forward while the entire rig glides on a dolly track. " +
      "Ease in gently from stillness, hold constant speed, ease out in the final half-second. Smooth cinematic pan revealing adjacent areas. " +
      STABILITY_SUFFIX,
    duration: 5,
  },
  "orbit": {
    promptText:
      "Slow cinematic orbit arc of approximately 20 degrees around the center of the scene. " +
      "Camera moves along a curved dolly track, maintaining a fixed distance from the subject. " +
      "Ease in from stillness, constant arc speed, ease out to stillness. Subtle parallax shift between foreground and background revealing depth. " +
      STABILITY_SUFFIX,
    duration: 5,
  },
  "orbit-right": {
    promptText:
      "Slow cinematic orbit moving clockwise around the center of the scene at approximately 20 degrees. " +
      "Camera follows a curved dolly track moving to the right, maintaining a fixed distance from the subject. " +
      "Ease in from stillness, constant arc speed, ease out to stillness. Smooth rightward motion revealing adjacent features and spatial depth. " +
      GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
    duration: 5,
  },
  "orbit-left": {
    promptText:
      "Slow cinematic orbit moving counter-clockwise around the center of the scene at approximately 20 degrees. " +
      "Camera follows a curved dolly track moving to the left, maintaining a fixed distance from the subject. " +
      "Ease in from stillness, constant arc speed, ease out to stillness. Smooth leftward motion revealing adjacent features and spatial depth. " +
      GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
    duration: 5,
  },
  "crane-up": {
    promptText:
      "Professional videography: Slow vertical crane rise revealing the full vertical extent of the space. " +
      "Camera ascends straight up while tilting gently downward to keep the scene centered in frame. " +
      "Ease in from stillness, constant ascent speed, ease out at the top. Cinematic vertical reveal showcasing room height and features. " +
      GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
    duration: 5,
  },
  "drone-up": {
    promptText:
      "Professional aerial videography: Rising drone reveal ascending vertically while tilting down to keep the property centered in frame. " +
      "Smooth constant rise speed with gentle ease-in from the ground. The landscape and context gradually enter the frame from the edges. " +
      "Cinematic aerial reveal showcasing property scale and surroundings. " +
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

// Portrait 9:16 orbit on wide-angle interior photos loses the sides of the room.
// A wider arc (35°) lets Runway's camera sweep far enough to reveal connected
// spaces (e.g. kitchen visible in the source but cropped out by the portrait frame).
const ORBIT_PORTRAIT_PROMPT =
  "Slow cinematic orbit arc of approximately 35 degrees around the center of the scene. " +
  "Camera moves along a wide curved dolly track, sweeping from the left side of the room toward the right, " +
  "maintaining a fixed distance from the subject. " +
  "Ease in from stillness, constant arc speed, ease out to stillness. Noticeable parallax shift between foreground and background. " +
  STABILITY_SUFFIX;

function composePrompt(cameraAction: string, outputFormat?: string): string {
  // Use the wider orbit prompt for portrait format to compensate for the crop
  if (cameraAction === "orbit" && outputFormat !== "landscape") {
    return ORBIT_PORTRAIT_PROMPT;
  }
  const config = MOTION_MAP[cameraAction];
  if (!config) return MOTION_MAP["push-in"].promptText;
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
        // Social media pacing (3.5s hard-cut in Shotstack) means we only
        // use the first 3.5s anyway — the extra 1.5s is buffer.
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
