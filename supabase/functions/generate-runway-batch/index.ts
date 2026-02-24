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
 * Super 7 Organic Presets — "Surgical Strikes" for AI video generation.
 *
 * Seven carefully calibrated cinematography profiles that cover every room type
 * in a property tour. Each preset uses deliberately low camera_motion magnitudes
 * to produce organic, natural-feeling motion that minimises AI warping artifacts.
 *
 * Every room_type maps to exactly one of the Super 7. This is the only set of
 * camera motions sent to Runway — no generic angles, no high-magnitude moves.
 *
 * The prompts anchor Runway's geometry model to the specific room elements,
 * preventing hallucination of walls, furniture, and fixtures.
 */

interface CinematicPreset {
  camera_motion: Record<string, number>;
  promptText: string;
  duration: 5 | 10;
}

// ── The Super 7 Organic Presets ─────────────────────────────────────────────
// All camera_motion values capped at ±4.5 to prevent AI warping.
// Every promptText anchors: camera height + motion bias + anti-morphing directive.
//
// PROVEN FORMULA (from Façade Approach & Foyer Glide — verified good output):
//   1. zoom ≤ 4, horizontal ≤ 3, pan ≤ 1 — combined lateral (h+p) must not exceed 4
//   2. Unused axes are STRICTLY 0 — no noise
//   3. promptText names SPECIFIC fixtures in the room (roofline, doorframes, countertops)
//   4. promptText describes the MOTION itself (approach, glide, sweep), not just the room
//   5. Motion bias: "Focus on interior furnishings, not windows or light sources."
//   6. Anti-morphing tail: "Locked geometry. No morphing, no liquid surfaces, no structural movement."

// 🔒 LOCKED — verified good output. Do not modify camera_motion or promptText.
const FACADE_APPROACH: CinematicPreset = {
  camera_motion: { zoom: 4, horizontal: 0, pan: 0, tilt: -1, vertical: 0, roll: 0 },
  promptText: "Smooth cinematic approach toward property exterior. Eye-level camera perspective. Focus on the front facade and entry, not the sky or street. Stable roofline and facade, fixed driveway geometry. Locked geometry. No morphing, no liquid surfaces, no structural movement.",
  duration: 5,
};

// 🔒 LOCKED — verified good output. Do not modify camera_motion or promptText.
const FOYER_GLIDE: CinematicPreset = {
  camera_motion: { zoom: 2, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
  promptText: "Elegant entryway glide. Eye-level, chest-height camera perspective. Focus on interior furnishings and flooring, not windows or light sources. Smooth lateral motion through foyer. Stable walls and flooring, fixed doorframes. Locked geometry. No morphing, no liquid surfaces, no structural movement.",
  duration: 5,
};

// Matched to FOYER_GLIDE formula: zoom 2 + horizontal 3 + pan 1
const LOUNGE_DRIFT: CinematicPreset = {
  camera_motion: { zoom: 2, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
  promptText: "Gentle living room drift. Eye-level, chest-height camera perspective. Focus on interior furnishings like sofa and coffee table, not windows or light sources. Smooth lateral glide through the room. Fixed walls, stable ceiling lines, fixed window frames. Locked geometry. No morphing, no liquid surfaces, no structural movement.",
  duration: 5,
};

// 🔒 LOCKED — matched to proven formula (zoom 2 + horizontal 3 + pan 1).
// Was horizontal:4 pan:2 (combined lateral 6) — caused kitchen melt on reflective surfaces.
const KITCHEN_SWEEP: CinematicPreset = {
  camera_motion: { zoom: 2, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
  promptText: "Smooth kitchen sweep. Eye-level, chest-height camera perspective. Focus on island bench and cabinetry, not windows or light sources. Gentle arc past stone countertops. Stable island bench, fixed splashback and appliances. Locked geometry. No morphing, no liquid surfaces, no structural movement.",
  duration: 5,
};

// Matched to FOYER_GLIDE formula: zoom 2 + horizontal 3 + pan 1
const BEDSIDE_ARC: CinematicPreset = {
  camera_motion: { zoom: 2, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
  promptText: "Gentle bedside arc. Eye-level, chest-height camera perspective. Focus on bed and nightstands, not windows or light sources. Smooth curving motion past bedroom furnishings. Stable walls, fixed headboard and window frames. Locked geometry. No morphing, no liquid surfaces, no structural movement.",
  duration: 5,
};

// Pure forward push — small spaces need no lateral motion
const BATH_REVEAL: CinematicPreset = {
  camera_motion: { zoom: 2, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
  promptText: "Slow bathroom reveal push. Eye-level, chest-height camera perspective. Focus on vanity and shower fixtures, not windows or light sources. Gentle forward motion toward shower screen. Stable tiles, fixed mirror and tapware. Locked geometry. No morphing, no liquid surfaces, no structural movement.",
  duration: 5,
};

// Outdoor pullback — drone-level perspective, gentle rise
const GARDEN_FLOAT: CinematicPreset = {
  camera_motion: { zoom: -3, horizontal: 0, pan: 0, tilt: -1, vertical: 1, roll: 0 },
  promptText: "Floating outdoor pullback reveal. Elevated drone-level camera perspective. Focus on garden landscaping and entertaining area, not the sky. Gentle rising motion over pool and outdoor space. Stable paving, fixed pool edges and fence line. Locked geometry. No morphing, no liquid surfaces, no structural movement.",
  duration: 5,
};

// ── Room Type → Super 7 Mapping ─────────────────────────────────────────────
// Every room type maps to exactly one of the Super 7 Organic Presets.

const CINEMATIC_PRESETS: Record<string, CinematicPreset> = {
  // Façade Approach
  "exterior-arrival": FACADE_APPROACH,
  "front-door":       FACADE_APPROACH,

  // Foyer Glide
  "entry-foyer":      FOYER_GLIDE,

  // Lounge Drift
  "living-room-wide":  LOUNGE_DRIFT,
  "living-room-orbit": LOUNGE_DRIFT,

  // Kitchen Sweep
  "kitchen-orbit":    KITCHEN_SWEEP,
  "kitchen-push":     KITCHEN_SWEEP,

  // Bedside Arc
  "master-bedroom":   BEDSIDE_ARC,
  "bedroom":          BEDSIDE_ARC,

  // Bath Reveal
  "bathroom":         BATH_REVEAL,

  // Garden Float
  "outdoor-entertaining": GARDEN_FLOAT,
  "backyard-pool":        GARDEN_FLOAT,
  "view-balcony":         GARDEN_FLOAT,
};

// Fallback for legacy cameraAngle inputs — maps to closest Super 7 preset.
// When room_type is not provided, we route legacy angles through the organic presets.
function getCameraMotionLegacy(cameraAngle: string): CinematicPreset {
  switch (cameraAngle) {
    case "push-in": case "auto": case "zoom-in":
      return LOUNGE_DRIFT;   // Gentle forward drift — safest default
    case "push-out":
      return GARDEN_FLOAT;   // Pullback reveal
    case "orbit-right": case "orbit-left":
      return KITCHEN_SWEEP;  // Lateral sweep
    default:
      return LOUNGE_DRIFT;   // Safe organic fallback
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
