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
  promptText: "Cinematic architectural reveal. Eye-level perspective, mid-height camera locked to the front door. Smooth lateral parallax glide with a subtle forward push. Maintain perfect vertical lines of the building. Focus specifically on the front entrance door at eye-level. Ignore the ground, driveway, and foreground gates. Stable, locked geometry. No morphing, no liquid surfaces, no structural movement.",
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

// Bedroom pullback — always negative zoom to pull AWAY from bed, not into it.
// Soft lateral motion (h:2, p:0.5) avoids hallucination in tight 9:16 portrait crops.
const BEDSIDE_ARC: CinematicPreset = {
  camera_motion: { zoom: -1, horizontal: 2, pan: 0.5, tilt: 0, vertical: 0, roll: 0 },
  promptText: "Gentle bedroom pullback. Eye-level, chest-height camera perspective. Showcase the full bedroom space, pulling back to reveal room size and proportions. Focus on floor space, furnishings, and room layout. Stable walls, fixed headboard and window frames. Locked geometry. No morphing, no liquid surfaces, no structural movement.",
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
    perspective: "Eye-level perspective, mid-height camera locked to the front door.",
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
    focus: "Focus specifically on the front entrance door at eye-level. Ignore the ground and foreground gates.",
    stability: "Maintain perfect vertical lines of the building. Stable roofline and facade.",
  },
  "exterior-slide": {
    focus: "Cinematic lateral reveal of the building facade. Smooth parallax showcasing architectural details and building width.",
    stability: "Maintain perfect vertical lines of the building. Stable roofline and facade.",
  },
  "exterior-push": {
    focus: "Gentle approach toward the front entrance. Focus on the entry as the architectural focal point.",
    stability: "Maintain perfect vertical lines. Stable roofline and facade.",
  },
  "entry": {
    focus: "Focus on interior furnishings and flooring, not windows or light sources.",
    stability: "Stable walls and flooring, fixed doorframes.",
  },
  "living-room": {
    focus: "Focus on interior furnishings like sofa and coffee table, not windows or light sources.",
    stability: "Fixed walls, stable ceiling lines, fixed window frames.",
  },
  "living-room-open-plan": {
    focus: "Focus on the full open-plan layout. Start from the living area furnishings and reveal the kitchen bench, island, or countertops as the camera orbits. Showcase the connected flow between living and kitchen spaces.",
    stability: "Fixed walls, stable ceiling lines, fixed window frames. Stable kitchen island and cabinetry. Fixed countertop edges.",
  },
  "kitchen": {
    focus: "Focus on island bench and cabinetry, not windows or light sources.",
    stability: "Stable island bench, fixed splashback and appliances.",
  },
  "bedroom": {
    focus: "Showcase the full bedroom space, pulling back to reveal room size and proportions. Focus on floor space, furnishings, and room layout.",
    stability: "Stable walls, fixed headboard and window frames.",
  },
  "bedroom-anchored": {
    focus: "Reveal the visual feature while showcasing the bedroom space. Pull back to show room proportions and luxury details.",
    stability: "Stable walls, fixed headboard and window frames.",
  },
  "bedroom-dualcrop-slide": {
    focus: "Wide lateral glide showcasing the full bedroom space and furnishings. Smooth parallax revealing room depth and proportions.",
    stability: "Stable walls, fixed headboard and window frames.",
  },
  "bedroom-dualcrop-push": {
    focus: "Gentle reveal of bedroom details and styling. Showcase bed arrangement and room features.",
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
type KitchenVisiblePosition = "left" | "right" | "none";
type VisualAnchorType = "kitchen-island" | "fireplace" | "feature-wall" | "window-view" | "bed-styling" | "vanity" | "entertainment" | "ceiling-detail" | "open-plan-flow" | "none";
type AnchorPosition = "left" | "right" | "center";

type FacadeSymmetry = "symmetric" | "asymmetric-left" | "asymmetric-right" | "none";
type DoorPosition = "left" | "center" | "right" | "none";
type Stories = "1" | "2" | "3" | "none";
type FenceObstruction = "yes" | "no" | "none";
type DrivewayDominance = "yes" | "no" | "none";

const LIVING_ROOM_TYPES = new Set(["living-room-wide", "living-room-orbit"]);
const BEDROOM_TYPES = new Set(["master-bedroom", "bedroom"]);
const EXTERIOR_TYPES = new Set(["exterior-arrival", "front-door"]);

// Human-readable anchor names for prompt interpolation
const ANCHOR_LABEL: Record<string, string> = {
  "kitchen-island": "kitchen island",
  "fireplace": "fireplace",
  "feature-wall": "feature wall",
  "window-view": "window view",
  "bed-styling": "styled bed",
  "vanity": "vanity",
  "entertainment": "entertainment unit",
  "ceiling-detail": "ceiling detail",
  "open-plan-flow": "open-plan connection",
};

// Anchor-specific stability elements for bedroom prompt interpolation
const ANCHOR_STABILITY: Record<string, string> = {
  "kitchen-island": "countertop edges",
  "fireplace": "mantle and surround",
  "feature-wall": "wainscoting panels",
  "window-view": "window frame",
  "bed-styling": "headboard",
  "vanity": "mirror and basin",
  "entertainment": "shelving unit",
  "ceiling-detail": "ceiling lines",
  "open-plan-flow": "adjoining walls",
};

/**
 * Compute directional camera_motion overrides based on spatial detection.
 *
 * LIVING ROOMS — orbit toward the most interesting thing:
 *   P1: motionBias (dual-crop) → handled upstream, skip here
 *   P2: Kitchen visible → orbit TOWARD kitchen
 *   P3: Visual anchor detected → orbit TOWARD anchor
 *   P4: Windows detected → orbit AWAY from windows
 *   P5: Nothing detected → default right orbit
 *
 * BEDROOMS — always pull back, soft lateral:
 *   P1: motionBias (dual-crop) → handled upstream, skip here
 *   P2: Visual anchor (not bed-styling) → orbit TOWARD anchor
 *   P3: Bed off-center → glide AWAY from bed
 *   P4: Bed centered/nothing → slow pullback reveal
 *
 * Bedroom rules: zoom always negative (-1 or -1.5), h max ±2, p max ±0.5
 */
function getDirectionalOverride(
  roomType: string | undefined,
  windowPosition: SpatialPosition,
  bedPosition: SpatialPosition,
  kitchenVisible: KitchenVisiblePosition = "none",
  visualAnchor: VisualAnchorType = "none",
  anchorPosition: AnchorPosition = "center",
): { camera_motion: Record<string, number>; promptSuffix: string } | null {
  if (!roomType) return null;

  // ── LIVING ROOMS ──────────────────────────────────────────────────────
  if (LIVING_ROOM_TYPES.has(roomType)) {
    // P2: Kitchen visible → orbit TOWARD kitchen
    if (kitchenVisible === "right") {
      return {
        camera_motion: { zoom: 2, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Smooth cinematic orbit revealing the full open-plan layout. Glide toward the kitchen bench and island, showcasing the connected flow between living and kitchen spaces.",
      };
    }
    if (kitchenVisible === "left") {
      return {
        camera_motion: { zoom: 2, horizontal: -3, pan: -1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Smooth cinematic orbit revealing the full open-plan layout. Glide toward the kitchen bench and island, showcasing the connected flow between living and kitchen spaces.",
      };
    }

    // P3: Visual anchor detected → orbit TOWARD anchor
    if (visualAnchor !== "none") {
      const label = ANCHOR_LABEL[visualAnchor] || visualAnchor;
      if (anchorPosition === "right") {
        return {
          camera_motion: { zoom: 1, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
          promptSuffix: `Smooth orbit toward the ${label}, revealing the room's key feature.`,
        };
      }
      if (anchorPosition === "left") {
        return {
          camera_motion: { zoom: 1, horizontal: -3, pan: -1, tilt: 0, vertical: 0, roll: 0 },
          promptSuffix: `Smooth orbit toward the ${label}, revealing the room's key feature.`,
        };
      }
      // anchor center — gentle pull-back with slight lateral to add depth
      return {
        camera_motion: { zoom: -1, horizontal: 2, pan: 0.5, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: `Smooth orbit toward the ${label}, revealing the room's key feature.`,
      };
    }

    // P4: Windows detected → orbit AWAY from windows
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
      return {
        camera_motion: { zoom: 1, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Gentle lateral glide away from the centered windows, showcasing the interior furnishings of the room.",
      };
    }

    // P5: Nothing detected → default right orbit
    return {
      camera_motion: { zoom: 2, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
      promptSuffix: "Smooth interior-facing orbit showcasing furnishings and room layout. Focus on the interior, not windows or light sources.",
    };
  }

  // ── BEDROOMS ──────────────────────────────────────────────────────────
  // No window-away rule. Always negative zoom. Softer lateral (h ≤ 2, p ≤ 0.5).
  if (BEDROOM_TYPES.has(roomType)) {
    // P2: Visual anchor (not bed-styling) → orbit TOWARD anchor
    if (visualAnchor !== "none" && visualAnchor !== "bed-styling") {
      const label = ANCHOR_LABEL[visualAnchor] || visualAnchor;
      if (anchorPosition === "right") {
        return {
          camera_motion: { zoom: -1, horizontal: 2, pan: 0.5, tilt: 0, vertical: 0, roll: 0 },
          promptSuffix: `Subtle lateral glide revealing the ${label}. Pull back gently to showcase the full bedroom space.`,
        };
      }
      if (anchorPosition === "left") {
        return {
          camera_motion: { zoom: -1, horizontal: -2, pan: -0.5, tilt: 0, vertical: 0, roll: 0 },
          promptSuffix: `Subtle lateral glide revealing the ${label}. Pull back gently to showcase the full bedroom space.`,
        };
      }
      // anchor center
      return {
        camera_motion: { zoom: -1.5, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: `Subtle lateral glide revealing the ${label}. Pull back gently to showcase the full bedroom space.`,
      };
    }

    // P3: Bed off-center → glide AWAY from bed
    if (bedPosition === "left") {
      return {
        camera_motion: { zoom: -1, horizontal: 2, pan: 0.5, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Subtle lateral glide away from the bed, revealing bedroom floor space and room proportions.",
      };
    }
    if (bedPosition === "right") {
      return {
        camera_motion: { zoom: -1, horizontal: -2, pan: -0.5, tilt: 0, vertical: 0, roll: 0 },
        promptSuffix: "Subtle lateral glide away from the bed, revealing bedroom floor space and room proportions.",
      };
    }

    // P4: Bed centered or nothing → slow pullback
    return {
      camera_motion: { zoom: -1.5, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
      promptSuffix: "Gentle pullback revealing the full bedroom. Showcase room size, furnishings, and proportions.",
    };
  }

  return null;
}

/**
 * Exterior Adaptive Cinematography — replaces static High-Crane.
 *
 * A drone operator reads the building first:
 * - Symmetrical? Rise straight up — lateral breaks the composition.
 * - Fence in the way? Crane over it — never push into it.
 * - Two stories? Must rise enough to reveal the full height.
 * - Asymmetrical? Drift toward the entrance — that's the hero.
 *
 * 7 priorities + 5 hard enforcement rules.
 */
function getExteriorOverride(
  facadeSymmetry: FacadeSymmetry,
  doorPosition: DoorPosition,
  stories: Stories,
  fenceObstruction: FenceObstruction,
  drivewayDominance: DrivewayDominance,
  motionBias?: string,
): { camera_motion: Record<string, number>; promptText: string } | null {

  // Helper: replace [STORIES] placeholder with actual value
  function replaceStories(prompt: string): string {
    if (stories === "none") {
      return prompt.replace(/\[STORIES\]-story/g, "full");
    }
    return prompt.replace(/\[STORIES\]/g, stories);
  }

  // Priority 1 — motionBias set (dual-crop engine controls motion)
  if (motionBias) {
    return null; // Dual-crop motion wins. Prompt handled by composePrompt() exterior-slide/push anchors.
  }

  let motion: Record<string, number>;
  let prompt: string;

  // Priority 6 — SINGLE STORY (check before symmetry priorities)
  if (stories === "1") {
    if (fenceObstruction === "yes") {
      motion = { horizontal: 0, pan: 0, zoom: 0.5, vertical: 1, tilt: -0.5, roll: 0 };
      prompt = "Gentle crane rise revealing the single-story facade. Lift above the foreground fence to showcase the full building frontage and roofline. Focus on the front entrance. Maintain vertical building lines.";
    } else {
      motion = { horizontal: 2, pan: 0.5, zoom: 1, vertical: 0.3, tilt: 0, roll: 0 };
      prompt = "Smooth lateral glide past the single-story facade. Gentle parallax revealing the building frontage with subtle forward approach toward the entrance. Maintain vertical building lines.";
    }
  }
  // Priority 2 — SYMMETRIC + fence
  else if (facadeSymmetry === "symmetric" && fenceObstruction === "yes") {
    motion = { horizontal: 0, pan: 0, zoom: 0, vertical: 2, tilt: -1.5, roll: 0 };
    prompt = replaceStories("Majestic vertical crane reveal of symmetrical facade. Camera rises straight up from street level, clearing the foreground fence and gate. Reveal the full [STORIES]-story architecture while maintaining perfect centered composition. The front entrance remains the focal anchor as the camera ascends. Maintain perfect vertical lines of the building. Ignore driveway and foreground pavement. Stable fence line, fixed gate.");
  }
  // Priority 3 — SYMMETRIC + no fence
  else if (facadeSymmetry === "symmetric" && fenceObstruction !== "yes") {
    motion = { horizontal: 0, pan: 0, zoom: 0.5, vertical: 1, tilt: -0.5, roll: 0 };
    prompt = replaceStories("Elegant vertical reveal of symmetrical facade. Gentle rising camera with subtle forward approach toward the centered entrance. Reveal the full [STORIES]-story architecture. Maintain perfect centered composition and vertical building lines throughout.");
  }
  // Priority 4 — ASYMMETRIC + fence
  else if ((facadeSymmetry === "asymmetric-left" || facadeSymmetry === "asymmetric-right") && fenceObstruction === "yes") {
    if (doorPosition === "left") {
      motion = { horizontal: -2, pan: -0.5, zoom: 0, vertical: 2, tilt: -1.5, roll: 0 };
    } else if (doorPosition === "right") {
      motion = { horizontal: 2, pan: 0.5, zoom: 0, vertical: 2, tilt: -1.5, roll: 0 };
    } else {
      // door center on asymmetric building → treat as symmetric motion (Priority 2)
      motion = { horizontal: 0, pan: 0, zoom: 0, vertical: 2, tilt: -1.5, roll: 0 };
    }
    prompt = replaceStories("Rising crane reveal drifting toward the main entrance. Camera lifts from street level to clear the foreground fence, settling on the front door as the architectural focal point. Reveal the full [STORIES]-story facade. Maintain vertical building lines. Ignore foreground hardscape.");
  }
  // Priority 5 — ASYMMETRIC + no fence
  else if (facadeSymmetry === "asymmetric-left" || facadeSymmetry === "asymmetric-right") {
    if (doorPosition === "left") {
      motion = { horizontal: -2, pan: -0.5, zoom: 1, vertical: 0.5, tilt: -0.5, roll: 0 };
    } else if (doorPosition === "right") {
      motion = { horizontal: 2, pan: 0.5, zoom: 1, vertical: 0.5, tilt: -0.5, roll: 0 };
    } else {
      motion = { horizontal: 0, pan: 0, zoom: 1.5, vertical: 0.5, tilt: -0.5, roll: 0 };
    }
    prompt = "Cinematic approach toward the main entrance. Smooth lateral glide with gentle forward motion and subtle camera rise. The front door is the destination and focal point. Maintain vertical building lines.";
  }
  // Priority 7 — Fallback (detection failed, all fields "none")
  else {
    motion = { horizontal: 0, pan: 0, zoom: 0, vertical: 1.5, tilt: -1, roll: 0 };
    prompt = "Elevated architectural reveal. Camera rises gently to showcase the full building facade from a high vantage point. Focus on the front entrance. Maintain vertical building lines.";
  }

  // ── HARD RULES (apply after priority selection) ──────────────────────

  // Rule 1: No forward zoom when fence is present
  if (fenceObstruction === "yes") {
    motion.zoom = Math.min(motion.zoom, 0);
  }

  // Rule 2: Must rise for multi-story buildings
  if (stories !== "1" && stories !== "none") {
    motion.vertical = Math.max(motion.vertical, 1.5);
  }

  // Rule 3: Must tilt down when rising significantly
  if (motion.vertical >= 1.5) {
    motion.tilt = Math.min(motion.tilt, -1);
  }

  // Rule 4: No lateral on symmetric facades
  if (facadeSymmetry === "symmetric") {
    motion.horizontal = 0;
    motion.pan = 0;
  }

  // Rule 5: Driveway prompt injection
  if (drivewayDominance === "yes") {
    prompt += " Ignore driveway and foreground hardscape geometry.";
  }

  // Anti-morphing tail on every exterior prompt
  prompt += " Locked geometry. No morphing, no liquid surfaces, no structural movement.";

  return { camera_motion: motion, promptText: prompt };
}

const DEFAULT_ANCHORS = {
  focus: "Focus on interior furnishings and architectural details, not windows or light sources.",
  stability: "Stable walls and fixtures.",
};

const ANTI_MORPHING = "Locked geometry. No morphing, no liquid surfaces, no structural movement.";

// Compose a prompt by combining a Camera Action's motion style with a room's fixture anchors.
// This allows any action to pair with any room without room-mismatched prompts.
// Selects the best anchor variant based on room type, kitchen visibility, visual anchor, and motion bias.
function composePrompt(
  actionKey: CameraActionKey,
  roomType?: string,
  kitchenVisible: KitchenVisiblePosition = "none",
  visualAnchor: VisualAnchorType = "none",
  motionBias?: string,
): string {
  const motion = ACTION_MOTION[actionKey];
  const ctxKey = roomType ? ROOM_CONTEXT_KEY[roomType] : null;

  let anchorsKey: string | null = ctxKey;

  if (ctxKey === "exterior" && motionBias) {
    // Exterior dual-crop: use slide/push specific anchors
    if (motionBias === "slide-right" || motionBias === "slide-left") {
      anchorsKey = "exterior-slide";
    } else if (motionBias === "push-forward") {
      anchorsKey = "exterior-push";
    }
  } else if (ctxKey === "living-room" && kitchenVisible !== "none") {
    // Open-plan living room — kitchen visible
    anchorsKey = "living-room-open-plan";
  } else if (ctxKey === "bedroom") {
    // Bedroom — select variant based on context
    if (motionBias && (motionBias === "slide-right" || motionBias === "slide-left")) {
      anchorsKey = "bedroom-dualcrop-slide";
    } else if (motionBias === "push-forward") {
      anchorsKey = "bedroom-dualcrop-push";
    } else if (visualAnchor !== "none" && visualAnchor !== "bed-styling") {
      anchorsKey = "bedroom-anchored";
    }
    // else: default "bedroom" anchors (pullback)
  }

  const anchors = anchorsKey ? ROOM_ANCHORS[anchorsKey] : DEFAULT_ANCHORS;

  // Interpolate anchor name into bedroom-anchored focus
  let focus = anchors.focus;
  if (anchorsKey === "bedroom-anchored" && visualAnchor !== "none") {
    const label = ANCHOR_LABEL[visualAnchor] || visualAnchor;
    focus = focus.replace("the visual feature", `the ${label}`);
  }

  // Interpolate anchor-specific stability element
  let stability = anchors.stability;
  if (anchorsKey === "bedroom-anchored" && visualAnchor !== "none" && ANCHOR_STABILITY[visualAnchor]) {
    stability = stability + ` Fixed ${ANCHOR_STABILITY[visualAnchor]}.`;
  }

  return `${motion.motion} ${motion.perspective} ${focus} ${stability} ${ANTI_MORPHING}`;
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
    const generationPromises = imageMetadata.map(async (metadata: { url: string; cameraAngle?: string; room_type?: string; cameraAction?: string; duration?: number; seed?: number; motionBias?: "slide-right" | "slide-left" | "push-forward"; windowPosition?: string; bedPosition?: string; kitchenVisible?: string; visualAnchor?: string; anchorPosition?: string; facadeSymmetry?: string; doorPosition?: string; stories?: string; fenceObstruction?: string; drivewayDominance?: string }, index: number) => {
      const { url: imageUrl, cameraAngle, room_type, cameraAction, duration, seed, motionBias, windowPosition, bedPosition, kitchenVisible, visualAnchor, anchorPosition, facadeSymmetry, doorPosition, stories: storiesField, fenceObstruction, drivewayDominance } = metadata;
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
            promptText: composePrompt(actionKey, room_type, (kitchenVisible || "none") as KitchenVisiblePosition, (visualAnchor || "none") as VisualAnchorType, motionBias),
            duration: basePreset.duration,
          };
          // Bedroom zoom protection handled by the zoom cap below (clamps to -1)
          console.log(`Resolved via cameraAction: ${actionKey} + room context: ${room_type || "generic"}`);
        } else if (room_type && CINEMATIC_PRESETS[room_type]) {
          preset = CINEMATIC_PRESETS[room_type];
          console.log(`Resolved via legacy room_type: ${room_type}`);
        } else {
          preset = getCameraMotionLegacy(cameraAngle || "auto");
          console.log(`Resolved via legacy cameraAngle: ${cameraAngle || "auto"}`);
        }

        // Bedroom zoom cap: enforce zoom ≤ -1 for all bedroom room_types.
        // Positive zoom pushes INTO the bed. Always pull back (negative zoom).
        const isBedroom = room_type && BEDROOM_TYPES.has(room_type);
        if (isBedroom && preset.camera_motion.zoom > -1) {
          const oldZoom = preset.camera_motion.zoom;
          preset = {
            ...preset,
            camera_motion: { ...preset.camera_motion, zoom: -1 },
          };
          console.log(`Bedroom zoom cap applied: zoom clamped to -1 (was ${oldZoom})`);
        }

        // Exterior adaptive cinematography — replaces static High-Crane
        const isExterior = room_type && EXTERIOR_TYPES.has(room_type);
        if (isExterior) {
          const facadeSym = (facadeSymmetry || "none") as FacadeSymmetry;
          const doorPos = (doorPosition || "none") as DoorPosition;
          const storiesVal = (storiesField || "none") as Stories;
          const fenceVal = (fenceObstruction || "none") as FenceObstruction;
          const drivewayVal = (drivewayDominance || "none") as DrivewayDominance;

          const exteriorResult = getExteriorOverride(facadeSym, doorPos, storiesVal, fenceVal, drivewayVal, motionBias);
          if (exteriorResult) {
            preset = {
              ...preset,
              camera_motion: exteriorResult.camera_motion,
              promptText: exteriorResult.promptText,
            };
            console.log(`Exterior adaptive: sym=${facadeSym}, door=${doorPos}, stories=${storiesVal}, fence=${fenceVal}, driveway=${drivewayVal} → ${JSON.stringify(exteriorResult.camera_motion)}`);
          }
        }

        // Dual-Crop motion bias: override camera_motion for connected crop pairs
        // Crop A (slide-right): lateral slide with subtle pull-back to reveal room context
        // Crop A (slide-left): lateral slide with subtle pull-back to reveal room context
        // Crop B (push-forward): pure forward push into the detail crop
        let finalCameraMotion = preset.camera_motion;
        if (motionBias === "slide-right") {
          finalCameraMotion = { zoom: -1, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 };
        } else if (motionBias === "slide-left") {
          finalCameraMotion = { zoom: -1, horizontal: -3, pan: -1, tilt: 0, vertical: 0, roll: 0 };
        } else if (motionBias === "push-forward") {
          if (isBedroom) {
            // Bedrooms: never push into bed — gentle detail reveal with pullback
            finalCameraMotion = { zoom: -0.5, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 };
            console.log(`Push-forward overridden for bedroom: zoom: -0.5 (pullback)`);
          } else if (isExterior) {
            // Exterior: gentle approach, slight rise for cinematic feel
            finalCameraMotion = { zoom: 1.5, horizontal: 0, pan: 0, tilt: 0, vertical: 0.3, roll: 0 };
            console.log(`Push-forward overridden for exterior: zoom: 1.5 (gentle approach)`);
          } else {
            // All other rooms: reduced from 3 to 2 for smoother motion
            finalCameraMotion = { zoom: 2, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 };
          }
        }

        // Directional override based on detected spatial positions + visual anchor
        // Applies when no motionBias (dual-crop handles its own motion).
        // For bedrooms with motionBias: skip camera_motion override but prompt is already
        // set by composePrompt() using bedroom-dualcrop-slide/push anchors.
        const winPos = (windowPosition || "none") as SpatialPosition;
        const bedPos = (bedPosition || "none") as SpatialPosition;
        const kitchenPos = (kitchenVisible || "none") as KitchenVisiblePosition;
        const anchorType = (visualAnchor || "none") as VisualAnchorType;
        const anchorPos = (anchorPosition || "center") as AnchorPosition;
        if (!motionBias) {
          const directional = getDirectionalOverride(room_type, winPos, bedPos, kitchenPos, anchorType, anchorPos);
          if (directional) {
            finalCameraMotion = directional.camera_motion;
            // Append directional prompt suffix to the preset's prompt
            preset = {
              ...preset,
              promptText: preset.promptText + " " + directional.promptSuffix,
            };
            console.log(`Directional override: window=${winPos}, bed=${bedPos}, kitchen=${kitchenPos}, anchor=${anchorType}@${anchorPos} → ${JSON.stringify(directional.camera_motion)}`);
          }
        }

        // Final safety nets — ensure room-type constraints are NEVER bypassed,
        // regardless of which code path set finalCameraMotion above.
        if (isBedroom && finalCameraMotion.zoom > -0.5) {
          console.log(`Bedroom final safety: zoom clamped to -0.5 (was ${finalCameraMotion.zoom})`);
          finalCameraMotion = { ...finalCameraMotion, zoom: -0.5 };
        }
        if (isExterior && fenceObstruction === "yes" && finalCameraMotion.zoom > 0) {
          console.log(`Exterior fence safety: zoom clamped to 0 (was ${finalCameraMotion.zoom})`);
          finalCameraMotion = { ...finalCameraMotion, zoom: 0 };
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
