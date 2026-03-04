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

// ============================================
// CAMERA INTENT SYSTEM (Phase 2)
// ============================================
// Claude Vision made the creative decision.
// This code translates intent → Runway values.
// Safety clamps run last and are non-negotiable.
// ============================================

// --- INTENT → MOTION LOOKUP ---

interface IntentConfig {
  camera_motion: { zoom: number; horizontal: number; pan: number; tilt: number; vertical: number; roll: number };
  basePrompt: string;
}

const INTENT_MAP: Record<string, IntentConfig> = {
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

// --- ROOM STABILITY STRINGS ---

const ROOM_STABILITY: Record<string, string> = {
  "exterior": "Maintain perfect vertical lines of the building. Stable fence line, fixed gate geometry.",
  "entry": "Stable walls and flooring, fixed doorframes.",
  "living-room": "Fixed walls, stable ceiling lines, fixed window frames.",
  "kitchen": "Stable island bench, fixed splashback and appliances.",
  "bedroom": "Stable walls, fixed headboard and window frames.",
  "bathroom": "Stable tiles, fixed mirror and tapware.",
  "outdoor": "Stable paving, fixed pool edges and fence line.",
};

const ANTI_HALLUCINATION = "Locked geometry. No morphing, no liquid surfaces, no structural movement. Do not add lens flares, light blooms, god rays, or modify existing light sources. Preserve exact lighting conditions from the source photo.";

// --- ROOM GROUP HELPER ---

function getRoomGroup(roomType: string): string {
  if (roomType.startsWith("exterior") || roomType === "front-door") return "exterior";
  if (roomType === "entry-foyer") return "entry";
  if (roomType.startsWith("living-room")) return "living-room";
  if (roomType.startsWith("kitchen")) return "kitchen";
  if (roomType === "master-bedroom" || roomType === "bedroom") return "bedroom";
  if (roomType === "bathroom") return "bathroom";
  return "outdoor";
}

// --- DEFAULT INTENT FALLBACK ---

function getDefaultIntent(roomType: string): string {
  const roomGroup = getRoomGroup(roomType);
  switch (roomGroup) {
    case "exterior": return "truck-right";
    case "entry": return "push-in";
    case "living-room": return "orbit";
    case "kitchen": return "orbit";
    case "bedroom": return "pull-out";
    case "bathroom": return "push-in";
    case "outdoor": return "drone-up";
    default: return "pull-out";
  }
}

// --- PROMPT COMPOSER ---

function composeIntentPrompt(
  cameraIntent: string,
  roomType: string,
  heroFeature: string,
  hazards: string,
): string {
  const config = INTENT_MAP[cameraIntent];
  if (!config) return INTENT_MAP["pull-out"].basePrompt + " " + ANTI_HALLUCINATION;

  let prompt = config.basePrompt;

  // Add hero feature
  if (heroFeature && heroFeature !== "none") {
    prompt += ` Reveal and showcase the ${heroFeature}.`;
  }

  // Add room stability
  const roomGroup = getRoomGroup(roomType);
  const stability = ROOM_STABILITY[roomGroup];
  if (stability) {
    prompt += ` ${stability}`;
  }

  // Add hazard instructions
  if (hazards && hazards !== "none") {
    const hazardList = hazards.split(",").map(h => h.trim());
    if (hazardList.includes("fence-obstruction")) {
      prompt += " Clear the foreground fence and gate. Ignore driveway geometry.";
    }
    if (hazardList.includes("driveway-flat")) {
      prompt += " Ignore driveway and foreground hardscape.";
    }
    if (hazardList.includes("window-glare")) {
      prompt += " Avoid focusing on bright windows or light sources.";
    }
  }

  // Anti-morphing tail — always last
  prompt += ` ${ANTI_HALLUCINATION}`;

  return prompt;
}

// --- SAFETY CLAMPS (run LAST, non-negotiable) ---

function applySafetyClamps(
  motion: { zoom: number; horizontal: number; pan: number; tilt: number; vertical: number; roll: number },
  roomType: string,
  hazards: string,
): { zoom: number; horizontal: number; pan: number; tilt: number; vertical: number; roll: number } {
  const clamped = { ...motion };
  const roomGroup = getRoomGroup(roomType);
  const hazardList = (hazards || "").split(",").map(h => h.trim());

  // CLAMP 1: Bedroom zoom ALWAYS negative
  if (roomGroup === "bedroom") {
    clamped.zoom = Math.min(clamped.zoom, -0.5);
  }

  // CLAMP 2: Bedroom lateral is soft
  if (roomGroup === "bedroom") {
    clamped.horizontal = Math.max(Math.min(clamped.horizontal, 2), -2);
    clamped.pan = Math.max(Math.min(clamped.pan, 0.5), -0.5);
  }

  // CLAMP 3: No forward zoom through fences
  if (roomGroup === "exterior" && hazardList.includes("fence-obstruction")) {
    clamped.zoom = Math.min(clamped.zoom, 0);
  }

  // CLAMP 4: Rising cameras must tilt down
  if (clamped.vertical >= 1.5 && clamped.tilt > -1) {
    clamped.tilt = -1;
  }

  // CLAMP 5: Global motion caps
  clamped.zoom = Math.max(Math.min(clamped.zoom, 4), -4);
  const lateralSum = Math.abs(clamped.horizontal) + Math.abs(clamped.pan);
  if (lateralSum > 4) {
    const scale = 4 / lateralSum;
    clamped.horizontal *= scale;
    clamped.pan *= scale;
  }

  return clamped;
}

// --- USER DROPDOWN MAPPING ---
// Camera actions now map 1:1 to intent keys — no indirection needed.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    console.log("=== generate-runway-batch INVOKED (INTENT SYSTEM) ===");
    const { imageMetadata, propertyAddress } = await req.json();

    if (!imageMetadata || !Array.isArray(imageMetadata) || imageMetadata.length === 0) {
      throw new Error("imageMetadata array is required");
    }

    if (!RUNWAY_API_KEY) {
      console.error("RUNWAY_API_KEY is NOT set in secrets!");
      throw new Error("RUNWAY_API_KEY not configured");
    }

    console.log(`=== RUNWAY GEN3A TURBO BATCH: Generating ${imageMetadata.length} clips ===`);
    console.log(`RUNWAY_API_KEY present: ${!!RUNWAY_API_KEY}, length: ${RUNWAY_API_KEY.length}`);

    // Submit all at once — Runway queues excess tasks with THROTTLED status.
    const generationPromises = imageMetadata.map(async (metadata: {
      url: string;
      cameraAngle?: string;
      room_type?: string;
      cameraAction?: string;
      camera_intent?: string;
      hero_feature?: string;
      hazards?: string;
      duration?: number;
      seed?: number;
      userOverridden?: boolean;
    }, index: number) => {
      const { url: imageUrl, room_type, cameraAction, camera_intent, hero_feature, hazards, seed } = metadata;
      try {
        console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
        console.log(`Image: ${imageUrl}`);

        // For each image in the batch:
        const roomType = room_type || "living-room-wide";
        // DO NOT pre-fill camera_intent with a default here — let the priority logic below decide
        const aiCameraIntent = camera_intent || null;
        const heroFeature = hero_feature || "none";
        const hazardsStr = hazards || "none";

        // PRIORITY LOGIC (Phase 2):
        // 1. If user MANUALLY changed the dropdown (userOverridden === true), respect their choice
        // 2. Otherwise, use Claude Vision's camera_intent (the whole point of Phase 2)
        // 3. Fallback to room-type default if neither exists
        const userOverridden = metadata.userOverridden === true;
        let effectiveIntent: string;
        let intentSource: string;

        if (userOverridden && cameraAction && INTENT_MAP[cameraAction]) {
          // User explicitly chose a camera action — dropdown values map 1:1 to intents
          effectiveIntent = cameraAction;
          intentSource = `USER OVERRIDE (dropdown="${cameraAction}")`;
        } else if (aiCameraIntent && INTENT_MAP[aiCameraIntent]) {
          // Claude Vision's intelligent, photo-aware decision — PRIMARY path
          effectiveIntent = aiCameraIntent;
          intentSource = `AI VISION (camera_intent="${aiCameraIntent}")`;
        } else {
          // No valid AI intent — fall back to room-type default
          effectiveIntent = getDefaultIntent(roomType);
          intentSource = `FALLBACK (room="${roomType}" → "${effectiveIntent}")${aiCameraIntent ? ` [AI returned "${aiCameraIntent}" but not found in INTENT_MAP]` : " [no AI intent received]"}`;
        }

        // 1. Look up motion values
        const intentConfig = INTENT_MAP[effectiveIntent] || INTENT_MAP["pull-out"];
        let finalMotion = { ...intentConfig.camera_motion };

        // 2. Compose prompt
        const promptText = composeIntentPrompt(effectiveIntent, roomType, heroFeature, hazardsStr);

        // 3. Apply safety clamps (LAST — non-negotiable)
        finalMotion = applySafetyClamps(finalMotion, roomType, hazardsStr);

        // 4. Log FULL decision chain
        console.log(`\n=== Clip ${index + 1} INTENT DECISION ===`);
        console.log(`  room_type:       ${roomType}`);
        console.log(`  camera_intent:   ${camera_intent || "(none)"}`);
        console.log(`  cameraAction:    ${cameraAction || "(none)"}`);
        console.log(`  userOverridden:  ${userOverridden}`);
        console.log(`  effectiveIntent: ${effectiveIntent}`);
        console.log(`  intentSource:    ${intentSource}`);
        console.log(`  hero_feature:    ${heroFeature}`);
        console.log(`  hazards:         ${hazardsStr}`);
        console.log(`  motion:          ${JSON.stringify(finalMotion)}`);
        console.log(`  prompt:          ${promptText}`);
        console.log(`=== End Clip ${index + 1} ===\n`);

        // Always generate 5s — shortest Runway supports. Shotstack hard-cuts to 3.5s for pacing.
        const clipDuration: 5 | 10 = 5;
        if (seed) console.log(`Image ${index + 1}: Seed = ${seed}`);

        // 5. Send to Runway
        const requestBody: Record<string, unknown> = {
          model: "gen3a_turbo",
          promptImage: imageUrl,
          promptText: promptText,
          camera_motion: finalMotion,
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
