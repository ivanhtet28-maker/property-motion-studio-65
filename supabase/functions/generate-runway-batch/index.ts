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
// No numeric camera_motion sliders (Gen3a only).
// Gen4 Turbo uses natural language in promptText
// for superior motion quality and zero hallucinations.
// ============================================

interface MotionConfig {
  promptText: string;
  duration: number; // 5 or 10 seconds — complex motions get 10s
}

const ANTI_HALLUCINATION = "Photorealistic. Locked geometry — all walls, floors, ceilings, roofs, doors, windows, furniture, landscaping, and exterior structures remain perfectly rigid and stationary. No morphing, no liquid surfaces, no warping, no structural movement. Do not add lens flares, light blooms, god rays, or modify existing light sources. Preserve exact lighting conditions from the source photo. No objects appear or disappear. Maintain sharp edges on all architectural elements.";

const WIDE_ANGLE = "Maintain the full wide-angle composition from the source image throughout the entire video. Do not crop, zoom in, or narrow the field of view. Every element visible in the original photo must remain visible in every frame.";

const MOTION_MAP: Record<string, MotionConfig> = {
  "push-in": {
    promptText: `Very slow, subtle cinematic dolly forward toward the center of the scene. The camera glides straight ahead, gradually and gently closing distance with the focal point. Extremely slow movement — the camera barely advances. No lateral drift, no zoom, no cropping. ${WIDE_ANGLE} ${ANTI_HALLUCINATION}`,
    duration: 5,
  },
  "pull-out": {
    promptText: `Very slow, gentle cinematic pullback revealing the full space. The camera retreats backward in a straight line at an extremely slow pace, gradually revealing slightly more of the scene. No lateral drift, no zoom, no cropping. ${WIDE_ANGLE} ${ANTI_HALLUCINATION}`,
    duration: 5,
  },
  "truck-left": {
    promptText: `Very slow, smooth lateral tracking shot sliding gently to the left. The camera moves horizontally while maintaining a fixed forward-facing angle. Extremely subtle lateral movement — the shift is barely perceptible. No zoom, no cropping, no forward/backward movement. The entire scene remains visible throughout. ${WIDE_ANGLE} ${ANTI_HALLUCINATION}`,
    duration: 5,
  },
  "truck-right": {
    promptText: `Very slow, smooth lateral tracking shot sliding gently to the right. The camera moves horizontally while maintaining a fixed forward-facing angle. Extremely subtle lateral movement — the shift is barely perceptible. No zoom, no cropping, no forward/backward movement. The entire scene remains visible throughout. ${WIDE_ANGLE} ${ANTI_HALLUCINATION}`,
    duration: 5,
  },
  "pedestal-up": {
    promptText: `The camera rises very slowly and vertically while gently tilting down to keep the entire scene centered in frame. Extremely subtle upward crane movement. No horizontal drift, no zoom, no cropping. The full wide-angle composition is preserved as the camera gently lifts. ${WIDE_ANGLE} ${ANTI_HALLUCINATION}`,
    duration: 5,
  },
  "pedestal-down": {
    promptText: `The camera lowers very slowly and vertically while gently tilting up to keep the entire scene centered in frame. Extremely subtle downward crane movement. No horizontal drift, no zoom, no cropping. The full wide-angle composition is preserved as the camera gently descends. ${WIDE_ANGLE} ${ANTI_HALLUCINATION}`,
    duration: 5,
  },
  "orbit": {
    promptText: `Very slow, smooth cinematic orbit arc. The camera moves in a gentle circular path around the center of the scene, as if mounted on a curved dolly track. Extremely slow rotational movement — like a premium real estate showcase. The camera maintains a consistent distance and the full wide-angle view throughout. No zoom, no cropping. Every element visible in the original photo stays visible throughout the orbit. ${WIDE_ANGLE} ${ANTI_HALLUCINATION}`,
    duration: 10,
  },
  "orbit-360": {
    promptText: `Full 360-degree cinematic orbit around the entire room. The camera travels in a complete circle around the center of the space at chest height, smoothly revealing every wall and angle of the room as if mounted on a circular dolly track. The movement is continuous, steady, and unhurried — a full revolution showcase of the property interior. The camera maintains a fixed distance from the center throughout the entire rotation. Show all architectural details visible in the source image during the full revolution. ${ANTI_HALLUCINATION}`,
    duration: 10,
  },
  "static": {
    promptText: `Completely locked tripod shot. The camera is perfectly still, mounted on a rigid tripod. Zero camera movement. Zero zoom. The scene is static and calm, like a high-end real estate photograph brought to life with only subtle ambient details such as gentle light shifts or faint reflections. ${WIDE_ANGLE} ${ANTI_HALLUCINATION}`,
    duration: 5,
  },
  "drone-up": {
    promptText: `Rising aerial drone reveal of the property. The camera ascends straight up vertically, as if a drone is lifting off from ground level. The camera tilts gently downward as it rises to keep the full property centered in frame. Strictly vertical movement only — absolutely no horizontal drift, no lateral sliding, no zoom, no forward or backward movement. The camera rises in a perfectly straight vertical column. The full wide-angle view of the property is maintained throughout the ascent. ${WIDE_ANGLE} ${ANTI_HALLUCINATION}`,
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

    // Generate each clip at the SOURCE IMAGE's native aspect ratio.
    // Landscape photos → 1280:768, Portrait photos → 768:1280.
    // This ensures Runway sees the FULL image (no center-crop) and can apply
    // camera motions (orbit, drone-up, etc.) to the complete scene.
    // Shotstack will later composite landscape clips into portrait output
    // using a blurred-background + contain technique (no zoom/crop artifacts).
    console.log(`Output format: ${outputFormat || "portrait (default)"} — clips generated at native source ratio`);

    const generationPromises = imageMetadata.map(async (metadata: {
      url: string;
      cameraAction?: string;
      cameraAngle?: string;
      duration?: number;
      seed?: number;
      isLandscape?: boolean;
    }, index: number) => {
      const { url: imageUrl, cameraAction, seed, isLandscape } = metadata;
      try {
        // Use the user's chosen camera action (no AI override)
        const effectiveAction = (cameraAction && MOTION_MAP[cameraAction]) ? cameraAction : "push-in";
        const promptText = composePrompt(effectiveAction);
        const clipDuration = getDuration(effectiveAction);

        // Use native aspect ratio so Runway sees the full image.
        // Landscape source → 1280:768, Portrait source → 768:1280.
        const ratio = (isLandscape !== false) ? "1280:768" : "768:1280";

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
          isLandscape: isLandscape !== false,
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
