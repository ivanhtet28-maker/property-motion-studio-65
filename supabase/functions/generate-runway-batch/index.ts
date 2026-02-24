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
 * Super 7 Organic Engine — Strict preset system with human-level physics.
 *
 * Each preset uses ONLY the axes specified — all unlisted axes are strictly 0.
 * This eliminates robotic motion and ensures every shot feels like a
 * professional gimbal operator captured it.
 *
 * The 13 original room types are collapsed into 7 cinematic categories,
 * each with its own signature motion profile.
 */

interface CinematicPreset {
  camera_motion: Record<string, number>;
  promptText: string;
  duration: 5 | 10;
}

// Organic prompt suffix appended to every shot for consistent cinema-grade output
const ORGANIC_PROMPT_SUFFIX = "Professional real estate cinematography, camera at chest height, eye-level perspective, steady organic gimbal motion, no low-angle distortion, stable architecture.";

const CINEMATIC_PRESETS: Record<string, CinematicPreset> = {
  // ── Foyer, Entry, Hallway ─────────────────────────────────────────────────
  "foyer-glide": {
    camera_motion: { zoom: 2.5, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Slow welcoming glide into elegant entryway. Stable walls and flooring.",
    duration: 5,
  },

  // ── Living Room, Lounge, Dining ───────────────────────────────────────────
  // Spatial intelligence: AI detects window position and picks the right direction
  "room-slide": {
    camera_motion: { zoom: 0, horizontal: 4.5, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Cinematic lateral parallax slide. Maintain stable window frames and glass reflections. Ensure natural light remains consistent. Camera at chest height, no floor-level tilting.",
    duration: 5,
  },
  "room-slide-right": {
    camera_motion: { zoom: 0, horizontal: 5.0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Cinematic lateral parallax slide. Maintain stable window frames and glass reflections. Ensure natural light remains consistent. Camera at chest height, no floor-level tilting.",
    duration: 5,
  },
  "room-slide-left": {
    camera_motion: { zoom: 0, horizontal: -5.0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Cinematic lateral parallax slide. Maintain stable window frames and glass reflections. Ensure natural light remains consistent. Camera at chest height, no floor-level tilting.",
    duration: 5,
  },

  // ── Bedroom, Master Suite ─────────────────────────────────────────────────
  "bedside-arc": {
    camera_motion: { zoom: 0, horizontal: 2.0, pan: 3.0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Gentle wrap-around arc through bedroom. Fixed walls and ceiling, stable furnishings.",
    duration: 5,
  },

  // ── Kitchen, Bathroom, Laundry ────────────────────────────────────────────
  "detail-push": {
    camera_motion: { zoom: 3.5, horizontal: 0, pan: 0, tilt: 0, vertical: 0.5, roll: 0 },
    promptText: "Slow inhale push into detail surfaces. Stable fixtures and cabinetry.",
    duration: 5,
  },

  // ── Exterior, Facade, Street ──────────────────────────────────────────────
  "hero-arrival": {
    camera_motion: { zoom: 6.0, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Smooth grounded walk-up toward property exterior. Stable architecture, fixed roofline.",
    duration: 5,
  },

  // ── Backyard, Pool, Terrace ───────────────────────────────────────────────
  "view-reveal": {
    camera_motion: { zoom: -4.0, horizontal: 0, pan: 0, tilt: 0, vertical: 1.5, roll: 0 },
    promptText: "Gentle pull-back and rise revealing outdoor space. Stable landscape and structure.",
    duration: 5,
  },

  // ── Balcony, View, Scenic ─────────────────────────────────────────────────
  "vista-pan": {
    camera_motion: { zoom: 0, horizontal: 0, pan: 4.5, tilt: 0, vertical: 0, roll: 0 },
    promptText: "Pure sweeping panoramic pan across scenic vista. Fixed horizon line.",
    duration: 5,
  },
};

// Fallback for legacy cameraAngle inputs or unknown room_type values.
// Maps to the closest Super 7 preset.
function getCameraMotionLegacy(cameraAngle: string): CinematicPreset {
  switch (cameraAngle) {
    case "push-in": case "auto": case "zoom-in":
      return CINEMATIC_PRESETS["foyer-glide"];
    case "push-out":
      return CINEMATIC_PRESETS["view-reveal"];
    case "orbit-right": case "orbit-left":
      return CINEMATIC_PRESETS["room-slide"];
    default:
      return CINEMATIC_PRESETS["foyer-glide"];
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
          promptText: `${preset.promptText} ${ORGANIC_PROMPT_SUFFIX}`,
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
