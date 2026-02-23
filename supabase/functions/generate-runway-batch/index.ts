/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
const RUNWAY_API_URL = "https://api.runwayml.com/v1/image_to_video";
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
 * Cinematic Engine — Option B: Shot List with pre-calibrated cinematography physics.
 *
 * Each room_type has:
 *   - camera_motion: numeric sliders calibrated to the space scale
 *     (bathroom uses low magnitudes — camera doesn't punch through walls;
 *      exterior uses high magnitudes — drone scale requires faster movement to look right)
 *   - promptText: room-specific scene description that anchors the AI's geometry model
 *     (Telling the AI "stable cabinetry and countertops" prevents kitchen hallucination
 *      better than a generic "stable walls" prompt)
 *   - duration: always 5s (Runway minimum; 10s available for future hero shots)
 *
 * This replaces user-selected generic angles (push-in, orbit-right, etc.) with
 * professionally directed presets — "ghostwriting the cinematography."
 */

interface CinematicPreset {
  camera_motion: Record<string, number>;
  promptText: string;
  duration: 5 | 10;
}

const CINEMATIC_PRESETS: Record<string, CinematicPreset> = {
  // ── Exterior ──────────────────────────────────────────────────────────────
  "exterior-arrival": {
    camera_motion: { zoom: 8, horizontal: 0, pan: 0, tilt: -2, vertical: 0, roll: 0 },
    promptText: "Cinematic aerial drone push toward luxury property exterior. Stable architecture, fixed roofline, no distortion.",
    duration: 5,
  },
  "front-door": {
    camera_motion: { zoom: 5, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Professional real estate push toward front entrance. Stable door frame, fixed walls, no geometry change.",
    duration: 5,
  },

  // ── Interior common areas ─────────────────────────────────────────────────
  "entry-foyer": {
    camera_motion: { zoom: 3, horizontal: 4, pan: 2, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Elegant entryway orbit reveal. Stable walls and flooring. No architectural distortion.",
    duration: 5,
  },
  "living-room-wide": {
    camera_motion: { zoom: 3, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Spacious living room slow push. Fixed walls, stable furniture. Professional real estate.",
    duration: 5,
  },
  "living-room-orbit": {
    camera_motion: { zoom: 0, horizontal: 6, pan: 3, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Living room cinematic orbit. Stable interior architecture, fixed wall positions. Professional real estate.",
    duration: 5,
  },

  // ── Kitchen ───────────────────────────────────────────────────────────────
  "kitchen-orbit": {
    camera_motion: { zoom: 0, horizontal: 5, pan: 2, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Gourmet kitchen orbit. Stable cabinetry and countertops. Fixed island position. Professional real estate.",
    duration: 5,
  },
  "kitchen-push": {
    camera_motion: { zoom: 5, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Kitchen counter detail push-in. Stable stone surfaces, fixed cabinetry. Professional real estate.",
    duration: 5,
  },

  // ── Bedrooms ──────────────────────────────────────────────────────────────
  "master-bedroom": {
    camera_motion: { zoom: 3, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Master bedroom sanctuary slow reveal. Fixed walls and ceiling, stable furnishings. Professional real estate.",
    duration: 5,
  },
  "bedroom": {
    camera_motion: { zoom: 3, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Bedroom slow push reveal. Stable walls and furniture. Professional real estate.",
    duration: 5,
  },

  // ── Bathroom (low magnitude — small space) ────────────────────────────────
  "bathroom": {
    camera_motion: { zoom: 3, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Luxury bathroom slow push. Stable tiles and fixtures, fixed vanity. Professional real estate. No geometry distortion.",
    duration: 5,
  },

  // ── Outdoor ───────────────────────────────────────────────────────────────
  "outdoor-entertaining": {
    camera_motion: { zoom: -5, horizontal: 0, pan: 0, tilt: 0, vertical: 2, roll: 0 },
    promptText: "Outdoor entertaining area wide reveal pullback. Stable pavers and structure. Professional real estate.",
    duration: 5,
  },
  "backyard-pool": {
    camera_motion: { zoom: -6, horizontal: 0, pan: 0, tilt: -2, vertical: 2, roll: 0 },
    promptText: "Aerial-style backyard pool reveal. Stable landscape, fixed pool edges, stable water surface.",
    duration: 5,
  },
  "view-balcony": {
    camera_motion: { zoom: -4, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Panoramic balcony view reveal. Stable architectural framing, fixed horizon line.",
    duration: 5,
  },
};

// Fallback for legacy cameraAngle inputs — preserves backwards compatibility
// when room_type is not provided.
function getCameraMotionLegacy(cameraAngle: string): CinematicPreset {
  const fallbackPrompt = "Cinematic real estate interior. Stable walls and furniture. Professional photography.";
  switch (cameraAngle) {
    case "push-in": case "auto": case "zoom-in":
      return { camera_motion: { zoom: 5, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 }, promptText: fallbackPrompt, duration: 5 };
    case "push-out":
      return { camera_motion: { zoom: -5, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 }, promptText: fallbackPrompt, duration: 5 };
    case "orbit-right":
      return { camera_motion: { zoom: 0, horizontal: 5, pan: 2, tilt: 0, vertical: 0, roll: 0 }, promptText: fallbackPrompt, duration: 5 };
    case "orbit-left":
      return { camera_motion: { zoom: 0, horizontal: -5, pan: -2, tilt: 0, vertical: 0, roll: 0 }, promptText: fallbackPrompt, duration: 5 };
    default:
      return { camera_motion: { zoom: 0, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 }, promptText: fallbackPrompt, duration: 5 };
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
    const generationPromises = imageMetadata.map(async (metadata: { url: string; cameraAngle?: string; room_type?: string; duration?: number }, index: number) => {
      const { url: imageUrl, cameraAngle, room_type, duration } = metadata;
      try {
        console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
        console.log(`Image: ${imageUrl}`);
        console.log(`room_type: ${room_type || "(none)"}, cameraAngle: ${cameraAngle || "(none)"}`);

        // Cinematic Engine: room_type takes priority over generic cameraAngle
        const preset = (room_type && CINEMATIC_PRESETS[room_type])
          ? CINEMATIC_PRESETS[room_type]
          : getCameraMotionLegacy(cameraAngle || "auto");

        const clipDuration = toValidRunwayDuration(duration ?? preset.duration);
        console.log(`Preset: ${room_type || cameraAngle}, Duration: ${clipDuration}s`);
        console.log(`Camera motion:`, JSON.stringify(preset.camera_motion));
        console.log(`Prompt: "${preset.promptText}"`);

        const requestBody = {
          model: "gen3a_turbo",
          promptImage: imageUrl,
          promptText: preset.promptText,
          camera_motion: preset.camera_motion,
          ratio: "768:1280",
          duration: clipDuration,
        };

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
