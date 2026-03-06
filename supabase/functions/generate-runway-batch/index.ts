/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
//
// PROMPTING RULES (Runway Gen-4 official guide + research):
// 1. Describe MOTION only — the image provides all visuals
// 2. Use POSITIVE phrasing — "don't X" produces unpredictable results
// 3. One scene, one camera move per clip
// 4. Short, specific, cinematic language
// 5. Use filmmaker vocabulary: dolly, crane, orbit, tracking, truck
// 6. Include lighting cues for atmosphere
// 7. ALL clips are 5s — quality degrades in longer generations
//    (research shows 73% perfect consistency at 5s vs significant
//     drift at 10s, especially for architecture/interiors)
// ============================================

interface MotionConfig {
  promptText: string;
  duration: 5; // Always 5s — research shows best quality and consistency
}

const MOTION_MAP: Record<string, MotionConfig> = {
  "push-in": {
    promptText: "Slow steady dolly forward toward the focal point. Smooth gentle forward glide. Natural window light. Cinematic real estate footage.",
    duration: 5,
  },
  "pull-out": {
    promptText: "Slow cinematic pullback revealing the full space. Steady backward dolly glide. Natural ambient lighting. Cinematic real estate footage.",
    duration: 5,
  },
  "truck-left": {
    promptText: "Smooth lateral tracking shot sliding left. Camera faces forward while gliding sideways. Soft natural light. Cinematic real estate footage.",
    duration: 5,
  },
  "truck-right": {
    promptText: "Smooth lateral tracking shot sliding right. Camera faces forward while gliding sideways. Soft natural light. Cinematic real estate footage.",
    duration: 5,
  },
  "pedestal-up": {
    promptText: "Camera rises vertically like a crane shot, tilting down to keep the scene centered. Smooth upward movement. Cinematic real estate footage.",
    duration: 5,
  },
  "pedestal-down": {
    promptText: "Camera lowers vertically like a descending crane, tilting up to keep the scene centered. Smooth downward movement. Cinematic real estate footage.",
    duration: 5,
  },
  "orbit": {
    promptText: "Slow cinematic arc orbit around the center of the scene. Gentle partial circular dolly path. Warm natural light. Cinematic real estate footage.",
    duration: 5,
  },
  "orbit-360": {
    promptText: "Smooth circular orbit arc around the room, revealing the space from a new angle. Steady circular dolly track. Cinematic real estate footage.",
    duration: 5,
  },
  "static": {
    promptText: "Locked tripod shot. Camera perfectly still with only subtle ambient light shifts across the scene. Cinematic real estate footage.",
    duration: 5,
  },
  "drone-up": {
    promptText: "Rising aerial drone reveal. Camera ascends vertically, tilting down to keep the property centered. Golden hour light. Cinematic real estate footage.",
    duration: 5,
  },
};

function composePrompt(cameraAction: string): string {
  const config = MOTION_MAP[cameraAction];
  if (!config) return MOTION_MAP["push-in"].promptText;
  return config.promptText;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
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
        const promptText = composePrompt(effectiveAction);

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
