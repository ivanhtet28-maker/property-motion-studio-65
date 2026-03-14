/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1/image_to_video";
const RUNWAY_TASK_URL = "https://api.dev.runwayml.com/v1/tasks";
const RUNWAY_VERSION = "2024-11-06";

// ── Retry wrapper (matches generate-runway-batch pattern) ────────────────
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  attempt = 1,
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.status === 429 && retries > 0) {
      const waitSec = 15 * Math.pow(2, attempt - 1);
      console.warn(`Rate limited (429), waiting ${waitSec}s before retry (${retries} retries left)...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      return fetchWithRetry(url, options, retries - 1, attempt + 1);
    }
    if (response.status >= 500 && retries > 0) {
      console.warn(`Server error ${response.status}, retrying in 2s (${retries} retries left)...`);
      await new Promise((r) => setTimeout(r, 2000));
      return fetchWithRetry(url, options, retries - 1, attempt + 1);
    }
    return response;
  } catch (err) {
    if (retries === 0) throw err;
    console.warn(`Fetch failed, retrying in 2s (${retries} retries left)...`);
    await new Promise((r) => setTimeout(r, 2000));
    return fetchWithRetry(url, options, retries - 1, attempt + 1);
  }
}

// ── Camera motion prompts (identical to generate-runway-batch) ───────────
const STABILITY_SUFFIX =
  "Maintain all visible surfaces, furniture, and architectural geometry exactly as shown. " +
  "Preserve the existing lighting and color temperature throughout. " +
  "Photo-realistic cinematography, 24fps filmic motion blur.";

const MOTION_MAP: Record<string, string> = {
  "push-in":
    "Steady dolly forward at a gentle pace, easing in from stillness over the first half-second and maintaining constant speed. " +
    "Camera advances straight ahead toward the center of the frame on a smooth rail. " +
    STABILITY_SUFFIX,
  "pull-out":
    "Steady dolly backward at a gentle pace, easing in from stillness and maintaining constant speed. " +
    "Camera retreats straight back along a smooth rail, gradually revealing the full extent of the space. " +
    STABILITY_SUFFIX,
  "tracking":
    "Smooth lateral tracking shot sliding sideways at a steady pace. Camera faces forward while the entire rig glides on a dolly track. " +
    "Ease in gently from stillness, hold constant speed, ease out in the final half-second. " +
    STABILITY_SUFFIX,
  "orbit":
    "Slow cinematic orbit arc of approximately 20 degrees around the center of the scene. " +
    "Camera moves along a curved dolly track, maintaining a fixed distance from the subject. " +
    "Ease in from stillness, constant arc speed, ease out to stillness. Subtle parallax shift between foreground and background. " +
    STABILITY_SUFFIX,
  "crane-up":
    "Slow vertical crane rise. Camera ascends straight up while tilting gently downward to keep the scene centered in frame. " +
    "Ease in from stillness, constant ascent speed, ease out at the top. " +
    STABILITY_SUFFIX,
  "drone-up":
    "Rising aerial drone reveal. Camera ascends vertically while tilting down to keep the property centered in frame. " +
    "Smooth constant rise speed with gentle ease-in from the ground. The landscape gradually enters the frame from the edges. " +
    STABILITY_SUFFIX,
  "static":
    "Locked-off tripod shot. Camera is perfectly stationary on a heavy tripod with zero movement. " +
    "Only the natural ambient environment has subtle life — gentle light shifts, soft atmosphere. The frame is completely stable. " +
    STABILITY_SUFFIX,
};

const ORBIT_PORTRAIT_PROMPT =
  "Slow cinematic orbit arc of approximately 35 degrees around the center of the scene. " +
  "Camera moves along a wide curved dolly track, sweeping from the left side of the room toward the right, " +
  "maintaining a fixed distance from the subject. " +
  "Ease in from stillness, constant arc speed, ease out to stillness. Noticeable parallax shift between foreground and background. " +
  STABILITY_SUFFIX;

function composePrompt(cameraAction: string, outputFormat?: string): string {
  if (cameraAction === "orbit" && outputFormat !== "landscape") {
    return ORBIT_PORTRAIT_PROMPT;
  }
  return MOTION_MAP[cameraAction] || MOTION_MAP["push-in"];
}

// ── Poll Runway until terminal state ─────────────────────────────────────
async function pollRunwayTask(taskId: string): Promise<{ status: string; videoUrl: string | null }> {
  const maxAttempts = 60; // ~5 minutes at 5s intervals
  const pollInterval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${RUNWAY_TASK_URL}/${taskId}`, {
      headers: {
        Authorization: `Bearer ${RUNWAY_API_KEY}`,
        "X-Runway-Version": RUNWAY_VERSION,
      },
    });

    if (!response.ok) {
      console.error(`Runway poll error: ${response.status}`);
      await new Promise((r) => setTimeout(r, pollInterval));
      continue;
    }

    const data = await response.json();
    console.log(`Poll ${i + 1}: status=${data.status}`);

    if (data.status === "SUCCEEDED") {
      return { status: "completed", videoUrl: data.output?.[0] || null };
    }
    if (data.status === "FAILED") {
      return { status: "failed", videoUrl: null };
    }

    // PENDING, THROTTLED, RUNNING → keep polling
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  return { status: "failed", videoUrl: null };
}

// ── Main handler ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // 1. Auth check
    const { user, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const { videoId, clipIndex, imageUrl, cameraAngle } = await req.json();

    // 2. Validate input
    if (!videoId || typeof clipIndex !== "number" || !imageUrl) {
      return new Response(
        JSON.stringify({ error: "videoId, clipIndex, and imageUrl are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!RUNWAY_API_KEY) {
      throw new Error("RUNWAY_API_KEY not configured");
    }

    // 3. Verify user owns the video
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: video, error: fetchErr } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .single();

    if (fetchErr || !video) {
      return new Response(
        JSON.stringify({ error: "Video not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check ownership (skip for service-role calls)
    if (user!.id !== "service-role" && video.user_id !== user!.id) {
      return new Response(
        JSON.stringify({ error: "You do not own this video" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse photos JSONB to validate clipIndex
    let photosJson: Record<string, unknown> = {};
    if (video.photos) {
      try {
        photosJson =
          typeof video.photos === "string"
            ? JSON.parse(video.photos)
            : video.photos;
      } catch {
        photosJson = {};
      }
    }

    const imageUrls = (photosJson.imageUrls as string[]) || [];
    if (clipIndex < 0 || clipIndex >= imageUrls.length) {
      return new Response(
        JSON.stringify({ error: `Invalid clipIndex: ${clipIndex}. Video has ${imageUrls.length} clips.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Determine output format from existing metadata
    const outputFormat = photosJson.outputFormat as string | undefined;
    const ratio = outputFormat === "landscape" ? "1280:720" : "720:1280";

    const effectiveAction =
      cameraAngle && MOTION_MAP[cameraAngle] ? cameraAngle : "push-in";
    const promptText = composePrompt(effectiveAction, outputFormat);

    console.log(`=== REGENERATE CLIP ${clipIndex} ===`);
    console.log(`  Video: ${videoId}`);
    console.log(`  Image: ${imageUrl}`);
    console.log(`  Camera: ${effectiveAction}`);
    console.log(`  Ratio: ${ratio}`);

    // 5. Submit to Runway Gen4 Turbo
    const requestBody = {
      model: "gen4_turbo",
      promptImage: imageUrl,
      promptText: promptText,
      ratio: ratio,
      duration: 5, // Always 5s
    };

    const response = await fetchWithRetry(RUNWAY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RUNWAY_API_KEY}`,
        "Content-Type": "application/json",
        "X-Runway-Version": RUNWAY_VERSION,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Runway API error: ${response.status} — ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Runway API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const runwayData = await response.json();
    if (!runwayData.id) {
      throw new Error("Runway returned no task ID");
    }

    console.log(`Runway task started: ${runwayData.id}`);

    // 6. Poll Runway until completion
    const result = await pollRunwayTask(runwayData.id);

    if (result.status !== "completed" || !result.videoUrl) {
      return new Response(
        JSON.stringify({ error: "Clip generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Clip generated: ${result.videoUrl}`);

    // 7. Update DB — update the generationIds and cameraAngles for the clip
    const generationIds = (photosJson.generationIds as string[]) || [];
    if (generationIds.length > clipIndex) {
      generationIds[clipIndex] = runwayData.id;
    }

    const cameraAngles = (photosJson.cameraAngles as string[]) || [];
    if (cameraAngles.length > clipIndex) {
      cameraAngles[clipIndex] = effectiveAction;
    }

    photosJson.generationIds = generationIds;
    photosJson.cameraAngles = cameraAngles;

    const { error: updateErr } = await supabase
      .from("videos")
      .update({ photos: JSON.stringify(photosJson) })
      .eq("id", videoId);

    if (updateErr) {
      console.error("DB update failed:", updateErr);
      // Still return success since the clip was generated — frontend can retry save
    }

    return new Response(
      JSON.stringify({
        success: true,
        clipUrl: result.videoUrl,
        clipIndex,
        cameraAngle: effectiveAction,
        estimatedSeconds: 15,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in regenerate-clip:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
