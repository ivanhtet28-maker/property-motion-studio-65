/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1/image_to_video";
const RUNWAY_TASK_URL = "https://api.dev.runwayml.com/v1/tasks";
const RUNWAY_VERSION = "2024-11-06";

// ---------------------------------------------------------------------------
// Motion prompts — copied from generate-runway-batch/index.ts
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMotionPrompt(cameraAngle: string): string {
  return MOTION_MAP[cameraAngle] || MOTION_MAP["push-in"];
}

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
      console.warn(`Rate limited (429), waiting ${waitSec}s before retry (${retries} left)...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      return fetchWithRetry(url, options, retries - 1, attempt + 1);
    }
    if (response.status >= 500 && retries > 0) {
      console.warn(`Server error ${response.status}, retrying in 2s (${retries} left)...`);
      await new Promise((r) => setTimeout(r, 2000));
      return fetchWithRetry(url, options, retries - 1, attempt + 1);
    }
    return response;
  } catch (err) {
    if (retries === 0) throw err;
    console.warn(`Fetch failed, retrying in 2s (${retries} left)...`);
    await new Promise((r) => setTimeout(r, 2000));
    return fetchWithRetry(url, options, retries - 1, attempt + 1);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // 1. Auth
    const { user, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    console.log("=== regenerate-clip INVOKED ===");

    const { videoId, clipIndex, imageUrl, cameraAngle } = await req.json();

    // Validate required fields
    if (!videoId || clipIndex === undefined || clipIndex === null || !imageUrl || !cameraAngle) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: videoId, clipIndex, imageUrl, cameraAngle" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (typeof clipIndex !== "number" || clipIndex < 0) {
      return new Response(
        JSON.stringify({ success: false, error: "clipIndex must be a non-negative number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. DB — verify ownership
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const userId = user!.id;

    const { data: video, error: dbErr } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", userId)
      .single();

    if (dbErr || !video) {
      return new Response(
        JSON.stringify({ success: false, error: "Video not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate clipIndex bounds
    const imageUrls: string[] = video.image_urls || [];
    if (clipIndex >= imageUrls.length) {
      return new Response(
        JSON.stringify({ success: false, error: `clipIndex ${clipIndex} is out of bounds (max ${imageUrls.length - 1})` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Runway — submit generation
    if (!RUNWAY_API_KEY) {
      throw new Error("RUNWAY_API_KEY not configured");
    }

    const promptText = getMotionPrompt(cameraAngle);
    console.log(`Regenerating clip ${clipIndex} with camera angle: ${cameraAngle}`);
    console.log(`Image: ${imageUrl}`);
    console.log(`Prompt: ${promptText.substring(0, 120)}...`);

    const runwayResponse = await fetchWithRetry(RUNWAY_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RUNWAY_API_KEY}`,
        "Content-Type": "application/json",
        "X-Runway-Version": RUNWAY_VERSION,
      },
      body: JSON.stringify({
        model: "gen4_turbo",
        promptImage: imageUrl,
        promptText: promptText,
        ratio: "1280:720",
        duration: 5,
      }),
    });

    if (!runwayResponse.ok) {
      const errorText = await runwayResponse.text();
      console.error("Runway API error:", runwayResponse.status, errorText);
      throw new Error(`Runway API ${runwayResponse.status}: ${errorText}`);
    }

    const runwayData = await runwayResponse.json();
    const taskUuid = runwayData.id;

    if (!taskUuid) {
      throw new Error(`Runway API returned no task ID: ${JSON.stringify(runwayData)}`);
    }

    console.log(`Runway task started: ${taskUuid}`);

    // 4. Poll for completion — 5s intervals, up to 60 attempts (5 min)
    let clipUrl: string | null = null;
    const maxAttempts = 60;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));

      const statusResponse = await fetch(`${RUNWAY_TASK_URL}/${taskUuid}`, {
        headers: {
          "Authorization": `Bearer ${RUNWAY_API_KEY}`,
          "X-Runway-Version": RUNWAY_VERSION,
        },
      });

      if (!statusResponse.ok) {
        console.warn(`Poll attempt ${attempt + 1} failed with status ${statusResponse.status}`);
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`Poll ${attempt + 1}/${maxAttempts}: status=${statusData.status}`);

      if (statusData.status === "SUCCEEDED") {
        clipUrl = statusData.output?.[0] || null;
        if (!clipUrl) {
          throw new Error("Runway task succeeded but no output URL returned");
        }
        console.log(`Clip generated: ${clipUrl}`);
        break;
      }

      if (statusData.status === "FAILED") {
        const reason = statusData.failure || statusData.error || "Unknown failure";
        throw new Error(`Runway generation failed: ${reason}`);
      }
    }

    if (!clipUrl) {
      throw new Error("Runway generation timed out after 5 minutes");
    }

    // 5. Update database — photos JSONB
    const photos = video.photos || {};
    if (!photos.clips) photos.clips = [];
    if (!photos.generationIds) photos.generationIds = [];
    if (!photos.cameraAngles) photos.cameraAngles = [];

    // Extend arrays if needed
    while (photos.clips.length <= clipIndex) photos.clips.push({});
    while (photos.generationIds.length <= clipIndex) photos.generationIds.push(null);
    while (photos.cameraAngles.length <= clipIndex) photos.cameraAngles.push(null);

    photos.clips[clipIndex] = { ...photos.clips[clipIndex], url: clipUrl };
    photos.generationIds[clipIndex] = taskUuid;
    photos.cameraAngles[clipIndex] = cameraAngle;

    const { error: updateErr } = await supabase
      .from("videos")
      .update({ photos })
      .eq("id", videoId);

    if (updateErr) {
      console.error("DB update failed:", updateErr);
      throw new Error(`Database update failed: ${updateErr.message}`);
    }

    console.log("=== regenerate-clip COMPLETE ===");

    // 6. Return response
    return new Response(
      JSON.stringify({
        success: true,
        clipUrl,
        clipIndex,
        cameraAngle,
        estimatedSeconds: 15,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("regenerate-clip error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
