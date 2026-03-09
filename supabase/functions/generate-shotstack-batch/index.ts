/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { corsHeaders } from "../_shared/cors.ts";


const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");
const SHOTSTACK_CREATE_URL = "https://api.shotstack.io/create/v1/assets";

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
// Camera action → Shotstack motion mapping
//
// Shotstack's image-to-video uses Stable Video Diffusion which only
// exposes two knobs: `motion` (1-255) and `guidanceScale`.
// We map each user-selected camera action to an appropriate motion
// intensity so clips feel varied rather than uniform.
//
// guidanceScale: 1.8 keeps the output faithful to the source image —
// critical for real estate where hallucinated furniture/walls are unacceptable.
// ============================================

interface MotionConfig {
  motion: number;       // 1-255: amount of motion in the generated video
  guidanceScale: number; // how closely video matches the source image
}

const MOTION_MAP: Record<string, MotionConfig> = {
  "push-in":  { motion: 140, guidanceScale: 1.8 }, // moderate forward dolly feel
  "pull-out": { motion: 140, guidanceScale: 1.8 }, // moderate backward dolly feel
  "tracking": { motion: 160, guidanceScale: 1.8 }, // lateral movement — needs more motion
  "orbit":    { motion: 180, guidanceScale: 1.6 }, // arc around subject — highest motion
  "crane-up": { motion: 150, guidanceScale: 1.8 }, // vertical rise — medium-high
  "drone-up": { motion: 170, guidanceScale: 1.6 }, // aerial reveal — high motion
  "static":   { motion: 40,  guidanceScale: 2.0 }, // locked tripod — minimal motion, max fidelity
};

const DEFAULT_MOTION: MotionConfig = { motion: 127, guidanceScale: 1.8 };

function getMotionConfig(cameraAction?: string): MotionConfig {
  if (!cameraAction) return DEFAULT_MOTION;
  return MOTION_MAP[cameraAction] || DEFAULT_MOTION;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    console.log("=== generate-shotstack-batch INVOKED (Shotstack Create API — Image to Video) ===");
    const { imageMetadata, propertyAddress } = await req.json();

    if (!imageMetadata || !Array.isArray(imageMetadata) || imageMetadata.length === 0) {
      throw new Error("imageMetadata array is required");
    }

    if (!SHOTSTACK_API_KEY) {
      console.error("SHOTSTACK_API_KEY is NOT set in secrets!");
      throw new Error("SHOTSTACK_API_KEY not configured");
    }

    console.log(`=== SHOTSTACK CREATE API BATCH: ${imageMetadata.length} clips for ${propertyAddress || "unknown"} ===`);

    const generationPromises = imageMetadata.map(async (metadata: {
      url: string;
      cameraAction?: string;
      cameraAngle?: string;
      duration?: number;
    }, index: number) => {
      const { url: imageUrl, cameraAction, cameraAngle } = metadata;
      try {
        // Resolve the effective camera action from user selection
        const effectiveAction = cameraAction || cameraAngle || "push-in";
        const motionConfig = getMotionConfig(effectiveAction);

        console.log(`\n--- Clip ${index + 1}/${imageMetadata.length} ---`);
        console.log(`  Image: ${imageUrl}`);
        console.log(`  cameraAction: ${effectiveAction}`);
        console.log(`  motion: ${motionConfig.motion}, guidanceScale: ${motionConfig.guidanceScale}`);

        const requestBody = {
          provider: "shotstack",
          options: {
            type: "image-to-video",
            url: imageUrl,
            motion: motionConfig.motion,
            guidanceScale: motionConfig.guidanceScale,
          },
        };

        const response = await fetchWithRetry(SHOTSTACK_CREATE_URL, {
          method: "POST",
          headers: {
            "x-api-key": SHOTSTACK_API_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Shotstack Create API error for clip ${index + 1}:`, {
            status: response.status,
            error: errorText,
          });
          return {
            imageUrl,
            generationId: null,
            status: "error" as const,
            error: `Shotstack API ${response.status}: ${errorText}`,
          };
        }

        const data = await response.json();
        const assetId = data.data?.id || data.id;
        console.log(`Clip ${index + 1} started: ${assetId}`);

        if (!assetId) {
          return {
            imageUrl,
            generationId: null,
            status: "error" as const,
            error: `Shotstack API returned no asset ID. Response: ${JSON.stringify(data)}`,
          };
        }

        return {
          imageUrl,
          generationId: assetId,
          status: "queued" as const,
          duration: 4, // Shotstack image-to-video produces 4s clips
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
        throw new Error("Invalid Shotstack API key. Please check your SHOTSTACK_API_KEY secret.");
      } else if (firstError.includes("402") || firstError.includes("Payment Required") || firstError.includes("insufficient") || firstError.includes("credits")) {
        throw new Error("Shotstack account has insufficient credits. Please add credits at https://dashboard.shotstack.io/billing");
      } else if (firstError.includes("429")) {
        throw new Error("Shotstack API rate limit exceeded. Please try again later.");
      }

      throw new Error(`All Shotstack generations failed. First error: ${firstError}`);
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
    console.error("Error in Shotstack batch generation:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
