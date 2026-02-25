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
 * Core 5 Organic Presets — "Surgical Strikes" for AI video generation.
 *
 * Five fundamental cinematography profiles that cover every room type
 * in a property tour. Each preset uses deliberately low camera_motion magnitudes
 * to produce organic, natural-feeling motion that minimises AI warping artifacts.
 *
 * Every room_type maps to exactly one of the Core 5. This is the only set of
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

// ── The Core 5 Organic Presets (+ legacy room-specific variants) ────────────
// All camera_motion values capped at ±4.5 to prevent AI warping.
// Every promptText anchors: camera height + motion bias + anti-morphing directive.
//
// PROVEN FORMULA (from Parallax Glide & Foyer Glide — verified good output):
//   1. zoom ≤ 4, horizontal ≤ 3, pan ≤ 1 — combined lateral (h+p) must not exceed 4
//   2. Unused axes are STRICTLY 0 — no noise
//   3. promptText names SPECIFIC fixtures in the room (roofline, doorframes, countertops)
//   4. promptText describes the MOTION itself (approach, glide, sweep), not just the room
//   5. Motion bias: "Focus on interior furnishings, not windows or light sources."
//   6. Anti-morphing tail: "Locked geometry. No morphing, no liquid surfaces, no structural movement."

// 🔒 LOCKED — Parallax Glide: matched to FOYER_GLIDE formula (zoom 2 + horizontal 3 + pan 1 = lateral 4).
// Was zoom:4 h:0 p:0 tilt:-1 — felt like a "security camera" rush. Now a premium lateral reveal.
const FACADE_APPROACH: CinematicPreset = {
  camera_motion: { zoom: 2, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
  promptText: "Cinematic architectural reveal. Eye-level perspective, chest-height camera. Smooth lateral parallax glide with a subtle forward push. Maintain perfect vertical lines of the building. Focus on the symmetry of the entrance and the texture of the facade. Stable, locked geometry. No morphing, no liquid surfaces, no structural movement.",
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

// Wide bedroom orbit — zoom reduced to 1 to prevent zooming into bed
// Horizontal 3 + pan 1 creates a wide sweeping motion that showcases the room
const BEDSIDE_ARC: CinematicPreset = {
  camera_motion: { zoom: 1, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
  promptText: "Wide bedroom orbit. Eye-level, chest-height camera perspective. Focus on the full bedroom space, furnishings, and room layout, not windows or light sources. Smooth wide sweeping motion showcasing the entire room. Stable walls, fixed headboard and window frames. Locked geometry. No morphing, no liquid surfaces, no structural movement.",
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

// ── Room Type → Preset Mapping (legacy fallback) ────────────────────────────
// Backward-compat: when only room_type is provided (no cameraAction), resolve here.

const CINEMATIC_PRESETS: Record<string, CinematicPreset> = {
  // Parallax Glide (exterior)
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

// ── Camera Action System (Core 5) ───────────────────────────────────────────
// The frontend dropdown exposes 5 fundamental Camera Actions.
// When cameraAction is provided, we combine the action's camera_motion with
// room-aware prompt anchors so any action can pair with any detected room.

type CameraActionKey = "parallax-glide" | "space-sweep" | "kitchen-sweep" | "feature-push" | "aerial-float";

const CAMERA_ACTION_MAP: Record<CameraActionKey, CinematicPreset> = {
  "parallax-glide": FACADE_APPROACH,  // Side Slide
  "space-sweep":    LOUNGE_DRIFT,     // Wide Orbit
  "kitchen-sweep":  KITCHEN_SWEEP,    // Tight Orbit
  "feature-push":   BATH_REVEAL,      // Push In
  "aerial-float":   GARDEN_FLOAT,     // Pull Out
};

// Motion templates — describe HOW the camera moves (Core 5 actions)
const ACTION_MOTION: Record<CameraActionKey, { motion: string; perspective: string }> = {
  "parallax-glide": {
    motion: "Cinematic architectural reveal. Smooth lateral parallax glide with a subtle forward push.",
    perspective: "Eye-level perspective, chest-height camera.",
  },
  "space-sweep": {
    motion: "Wide sweeping orbit. Smooth lateral glide showcasing the full room space.",
    perspective: "Eye-level, chest-height camera perspective.",
  },
  "kitchen-sweep": {
    motion: "Smooth sweep. Gentle arc past focal points.",
    perspective: "Eye-level, chest-height camera perspective.",
  },
  "feature-push": {
    motion: "Slow reveal push. Gentle forward motion toward focal point.",
    perspective: "Eye-level, chest-height camera perspective.",
  },
  "aerial-float": {
    motion: "Floating pullback reveal. Gentle rising motion over the space.",
    perspective: "Elevated drone-level camera perspective.",
  },
};

// Room anchors — describe WHAT the camera sees (from the AI-detected room)
const ROOM_CONTEXT_KEY: Record<string, string> = {
  "exterior-arrival": "exterior", "front-door": "exterior",
  "entry-foyer": "entry",
  "living-room-wide": "living-room", "living-room-orbit": "living-room",
  "kitchen-orbit": "kitchen", "kitchen-push": "kitchen",
  "master-bedroom": "bedroom", "bedroom": "bedroom",
  "bathroom": "bathroom",
  "outdoor-entertaining": "outdoor", "backyard-pool": "outdoor", "view-balcony": "outdoor",
};

const ROOM_ANCHORS: Record<string, { focus: string; stability: string }> = {
  "exterior": {
    focus: "Focus on the symmetry of the entrance and the texture of the facade.",
    stability: "Maintain perfect vertical lines of the building. Stable roofline and facade, fixed driveway geometry.",
  },
  "entry": {
    focus: "Focus on interior furnishings and flooring, not windows or light sources.",
    stability: "Stable walls and flooring, fixed doorframes.",
  },
  "living-room": {
    focus: "Focus on interior furnishings like sofa and coffee table, not windows or light sources.",
    stability: "Fixed walls, stable ceiling lines, fixed window frames.",
  },
  "kitchen": {
    focus: "Focus on island bench and cabinetry, not windows or light sources.",
    stability: "Stable island bench, fixed splashback and appliances.",
  },
  "bedroom": {
    focus: "Focus on bed, nightstands, and the full room space, not windows or light sources.",
    stability: "Stable walls, fixed headboard and window frames.",
  },
  "bathroom": {
    focus: "Focus on vanity and shower fixtures, not windows or light sources.",
    stability: "Stable tiles, fixed mirror and tapware.",
  },
  "outdoor": {
    focus: "Focus on garden landscaping and entertaining area, not the sky.",
    stability: "Stable paving, fixed pool edges and fence line.",
  },
};

// ── Spatial Position Type ─────────────────────────────────────────────────
type SpatialPosition = "left" | "right" | "center" | "none";

// Living room rooms that should orbit away from windows
const LIVING_ROOM_TYPES = new Set(["living-room-wide", "living-room-orbit"]);
const BEDROOM_TYPES = new Set(["master-bedroom", "bedroom"]);

/**
 * Compute directional camera_motion overrides based on spatial detection.
 *
 * Living rooms: orbit AWAY from windows to showcase the interior.
 *   - Windows on left → orbit right (positive horizontal)
 *   - Windows on right → orbit left (negative horizontal)
 *
 * Bedrooms: wide orbit away from bed / away from windows.
 *   - Bed on right → orbit left (negative horizontal)
 *   - Bed on left → orbit right (positive horizontal)
 *   - Window position takes priority over bed position for direction.
 */
function getDirectionalOverride(
  roomType: string | undefined,
  windowPosition: SpatialPosition,
  bedPosition: SpatialPosition,
): { camera_motion: Record<string, number>; promptSuffix: string } | null {
  if (!roomType) return null;

  if (LIVING_ROOM_TYPES.has(roomType)) {
    if (windowPosition === "left") {
      return {
        camera_motion: { zoom: 2, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Orbit away from the windows on the left, revealing the interior of the room to the right.",
      };
    }
    if (windowPosition === "right") {
      return {
        camera_motion: { zoom: 2, horizontal: -3, pan: -1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Orbit away from the windows on the right, revealing the interior of the room to the left.",
      };
    }
    if (windowPosition === "center") {
      // Windows centered: gentle lateral slide so the camera doesn't push into the glass
      return {
        camera_motion: { zoom: 1, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Gentle lateral glide away from the centered windows, showcasing the interior furnishings of the room.",
      };
    }
    // No windows detected: no override, use default orbit
    return null;
  }

  if (BEDROOM_TYPES.has(roomType)) {
    // Window position takes priority for direction choice
    if (windowPosition === "left") {
      return {
        camera_motion: { zoom: 1, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Wide orbit away from the windows on the left. Showcase the full bedroom space, not just the bed.",
      };
    }
    if (windowPosition === "right") {
      return {
        camera_motion: { zoom: 1, horizontal: -3, pan: -1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Wide orbit away from the windows on the right. Showcase the full bedroom space, not just the bed.",
      };
    }
    // No windows — use bed position for direction
    if (bedPosition === "right") {
      return {
        camera_motion: { zoom: 1, horizontal: -3, pan: -1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Wide orbit to the left, showcasing the full bedroom space and surroundings, not zooming into the bed.",
      };
    }
    if (bedPosition === "left") {
      return {
        camera_motion: { zoom: 1, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Wide orbit to the right, showcasing the full bedroom space and surroundings, not zooming into the bed.",
      };
    }
    // Bed centered or unknown — use a gentle wide orbit with low zoom to avoid zooming into bed
    return {
      camera_motion: { zoom: 1, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
      promptSuffix: "Wide sweeping orbit showcasing the full bedroom space, room layout, and surroundings. Do not zoom into the bed.",
    };
  }

  return null;
}

const DEFAULT_ANCHORS = {
  focus: "Focus on interior furnishings and architectural details, not windows or light sources.",
  stability: "Stable walls and fixtures.",
};

const ANTI_MORPHING = "Locked geometry. No morphing, no liquid surfaces, no structural movement.";

// Compose a prompt by combining a Camera Action's motion style with a room's fixture anchors.
// This allows any action to pair with any room without room-mismatched prompts.
function composePrompt(actionKey: CameraActionKey, roomType?: string): string {
  const motion = ACTION_MOTION[actionKey];
  const ctxKey = roomType ? ROOM_CONTEXT_KEY[roomType] : null;
  const anchors = ctxKey ? ROOM_ANCHORS[ctxKey] : DEFAULT_ANCHORS;
  return `${motion.motion} ${motion.perspective} ${anchors.focus} ${anchors.stability} ${ANTI_MORPHING}`;
}

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
    const generationPromises = imageMetadata.map(async (metadata: { url: string; cameraAngle?: string; room_type?: string; cameraAction?: string; duration?: number; seed?: number; motionBias?: "slide-right" | "slide-left" | "push-forward"; windowPosition?: string; bedPosition?: string }, index: number) => {
      const { url: imageUrl, cameraAngle, room_type, cameraAction, duration, seed, motionBias, windowPosition, bedPosition } = metadata;
      try {
        console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
        console.log(`Image: ${imageUrl}`);
        console.log(`cameraAction: ${cameraAction || "(none)"}, room_type: ${room_type || "(none)"}, cameraAngle: ${cameraAngle || "(none)"}`);

        // Cinematic Engine: cameraAction (new dropdown) → room_type (legacy) → cameraAngle (oldest)
        let preset: CinematicPreset;
        const actionKey = cameraAction as CameraActionKey;
        if (actionKey && CAMERA_ACTION_MAP[actionKey]) {
          // New flow: Camera Action dropdown + AI-detected room for prompt anchors
          const basePreset = CAMERA_ACTION_MAP[actionKey];
          preset = {
            camera_motion: { ...basePreset.camera_motion },
            promptText: composePrompt(actionKey, room_type),
            duration: basePreset.duration,
          };
          // Bedroom zoom protection: space-sweep maps to LOUNGE_DRIFT (zoom:2) which
          // zooms into the bed too much. Override to zoom:1 for bedroom room types.
          if (actionKey === "space-sweep" && room_type && BEDROOM_TYPES.has(room_type)) {
            preset.camera_motion = { ...preset.camera_motion, zoom: 1 };
            console.log(`Bedroom zoom protection: reduced zoom from 2 → 1`);
          }
          console.log(`Resolved via cameraAction: ${actionKey} + room context: ${room_type || "generic"}`);
        } else if (room_type && CINEMATIC_PRESETS[room_type]) {
          preset = CINEMATIC_PRESETS[room_type];
          console.log(`Resolved via legacy room_type: ${room_type}`);
        } else {
          preset = getCameraMotionLegacy(cameraAngle || "auto");
          console.log(`Resolved via legacy cameraAngle: ${cameraAngle || "auto"}`);
        }

        // Dual-Crop motion bias: override camera_motion for connected crop pairs
        // Crop A (slide-right): pure lateral slide to reveal right side of scene
        // Crop A (slide-left): pure lateral slide to reveal left side of scene
        // Crop B (push-forward): pure forward push into the detail crop
        let finalCameraMotion = preset.camera_motion;
        if (motionBias === "slide-right") {
          finalCameraMotion = { zoom: 0, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 };
        } else if (motionBias === "slide-left") {
          finalCameraMotion = { zoom: 0, horizontal: -3, pan: -1, tilt: 0, vertical: 0, roll: 0 };
        } else if (motionBias === "push-forward") {
          finalCameraMotion = { zoom: 3, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 };
        }

        // Directional override based on detected window/bed position
        // Only applies when no motionBias (i.e. not a dual-crop pair)
        const winPos = (windowPosition || "none") as SpatialPosition;
        const bedPos = (bedPosition || "none") as SpatialPosition;
        if (!motionBias) {
          const directional = getDirectionalOverride(room_type, winPos, bedPos);
          if (directional) {
            finalCameraMotion = directional.camera_motion;
            // Append directional prompt suffix to the preset's prompt
            preset = {
              ...preset,
              promptText: preset.promptText + " " + directional.promptSuffix,
            };
            console.log(`Directional override: window=${winPos}, bed=${bedPos} → ${JSON.stringify(directional.camera_motion)}`);
          }
        }

        // Always generate 5s — shortest Runway supports. Shotstack hard-cuts to 3.5s for pacing.
        const clipDuration: 5 | 10 = 5;
        console.log(`Preset: ${room_type || cameraAngle}, Duration: ${clipDuration}s (Runway min, Shotstack cuts to 3.5s)`);
        console.log(`Camera motion:`, JSON.stringify(finalCameraMotion));
        if (motionBias) console.log(`Motion bias: ${motionBias}`);
        if (seed) console.log(`Seed: ${seed}`);
        console.log(`Prompt: "${preset.promptText}"`);

        const requestBody: Record<string, unknown> = {
          model: "gen3a_turbo",
          promptImage: imageUrl,
          promptText: preset.promptText,
          camera_motion: finalCameraMotion,
          ratio: "768:1280",
          duration: clipDuration,
        };

        // Shared seed ensures consistent lighting/colors across dual-crop pairs
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
