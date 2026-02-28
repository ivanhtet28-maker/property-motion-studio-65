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

  // INTERIOR
  "orbit-right": {
    camera_motion: { zoom: 2, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Smooth cinematic orbit to the right, revealing the space. Eye-level, chest-height camera perspective.",
  },
  "orbit-left": {
    camera_motion: { zoom: 2, horizontal: -3, pan: -1, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Smooth cinematic orbit to the left, revealing the space. Eye-level, chest-height camera perspective.",
  },
  "pullback-wide": {
    camera_motion: { zoom: -1.5, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Gentle pullback revealing the full room. Eye-level, chest-height camera perspective. Showcase room scale and proportions.",
  },
  "pullback-reveal-right": {
    camera_motion: { zoom: -1, horizontal: 2, pan: 0.5, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Gentle pullback drifting right, revealing room space and features. Eye-level, chest-height camera perspective.",
  },
  "pullback-reveal-left": {
    camera_motion: { zoom: -1, horizontal: -2, pan: -0.5, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Gentle pullback drifting left, revealing room space and features. Eye-level, chest-height camera perspective.",
  },
  "gentle-push": {
    camera_motion: { zoom: 2, horizontal: 0, pan: 0, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Slow forward reveal. Eye-level, chest-height camera perspective. Gentle motion toward focal point.",
  },
  "drift-through": {
    camera_motion: { zoom: 0, horizontal: 3, pan: 1, tilt: 0, vertical: 0, roll: 0 },
    basePrompt: "Floating lateral drift through the space. Eye-level, chest-height camera perspective. Showcase flow and connection between areas.",
  },

  // EXTERIOR
  "crane-up": {
    camera_motion: { zoom: 0, horizontal: 0, pan: 0, tilt: -1.5, vertical: 2, roll: 0 },
    basePrompt: "Majestic vertical crane reveal. Camera rises straight up from street level, clearing the foreground. Maintain perfect centered composition.",
  },
  "crane-up-drift-right": {
    camera_motion: { zoom: 0, horizontal: 2, pan: 0.5, tilt: -1.5, vertical: 2, roll: 0 },
    basePrompt: "Rising crane reveal drifting right toward the main entrance. Camera lifts from street level to clear the foreground.",
  },
  "crane-up-drift-left": {
    camera_motion: { zoom: 0, horizontal: -2, pan: -0.5, tilt: -1.5, vertical: 2, roll: 0 },
    basePrompt: "Rising crane reveal drifting left toward the main entrance. Camera lifts from street level to clear the foreground.",
  },
  "approach-gentle": {
    camera_motion: { zoom: 1.5, horizontal: 0, pan: 0, tilt: -0.5, vertical: 0.5, roll: 0 },
    basePrompt: "Cinematic approach toward the main entrance. Gentle forward motion with subtle camera rise. Focus on the front door.",
  },
  "parallax-exterior": {
    camera_motion: { zoom: 0.5, horizontal: 2, pan: 0.5, tilt: 0, vertical: 0.3, roll: 0 },
    basePrompt: "Smooth lateral glide past the facade. Gentle parallax revealing building frontage.",
  },

  // OUTDOOR
  "float-back": {
    camera_motion: { zoom: -3, horizontal: 0, pan: 0, tilt: -1, vertical: 1, roll: 0 },
    basePrompt: "Floating outdoor pullback reveal. Elevated drone-level camera perspective. Gentle rising motion over the space.",
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

const ANTI_MORPHING = "Locked geometry. No morphing, no liquid surfaces, no structural movement.";

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
    case "exterior": return "crane-up";
    case "entry": return "drift-through";
    case "living-room": return "orbit-right";
    case "kitchen": return "orbit-right";
    case "bedroom": return "pullback-wide";
    case "bathroom": return "gentle-push";
    case "outdoor": return "float-back";
    default: return "pullback-wide";
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
  if (!config) return INTENT_MAP["pullback-wide"].basePrompt + " " + ANTI_MORPHING;

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
  prompt += ` ${ANTI_MORPHING}`;

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

const USER_ACTION_TO_INTENT: Record<string, string> = {
  "parallax-glide": "orbit-right",
  "space-sweep": "orbit-right",
  "kitchen-sweep": "orbit-right",
  "feature-push": "gentle-push",
  "aerial-float": "float-back",
};

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
    console.log(`RUNWAY_API_KEY present: ${!!RUNWAY_API_KEY}, length: ${RUNWAY_API_KEY.length}, prefix: ${RUNWAY_API_KEY.substring(0, 8)}...`);

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
    }, index: number) => {
      const { url: imageUrl, room_type, cameraAction, camera_intent, hero_feature, hazards, seed } = metadata;
      try {
        console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
        console.log(`Image: ${imageUrl}`);

        // For each image in the batch:
        const roomType = room_type || "living-room-wide";
        const cameraIntent = camera_intent || getDefaultIntent(roomType);
        const heroFeature = hero_feature || "none";
        const hazardsStr = hazards || "none";

        // If user overrode the camera action via dropdown, map it to an intent
        const effectiveIntent = cameraAction
          ? (USER_ACTION_TO_INTENT[cameraAction] || cameraIntent)
          : cameraIntent;

        // 1. Look up motion values
        const intentConfig = INTENT_MAP[effectiveIntent] || INTENT_MAP["pullback-wide"];
        let finalMotion = { ...intentConfig.camera_motion };

        // 2. Compose prompt
        const promptText = composeIntentPrompt(effectiveIntent, roomType, heroFeature, hazardsStr);

        // 3. Apply safety clamps (LAST — non-negotiable)
        finalMotion = applySafetyClamps(finalMotion, roomType, hazardsStr);

        // 4. Log everything
        console.log(`Image ${index + 1}: room=${roomType}, intent=${effectiveIntent}, hero=${heroFeature}, hazards=${hazardsStr}`);
        console.log(`Image ${index + 1}: motion=${JSON.stringify(finalMotion)}`);
        console.log(`Image ${index + 1}: prompt=${promptText.substring(0, 120)}...`);

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
