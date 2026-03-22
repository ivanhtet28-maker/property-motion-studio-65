/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
const RUNWAY_API_URL = "https://api.dev.runwayml.com/v1/image_to_video";
const RUNWAY_VERSION = "2024-11-06";

// ── Prompt-driven camera control (same as generate-runway-batch) ──────────

const STABILITY_SUFFIX =
  "Maintain all visible surfaces, furniture, and architectural geometry exactly as shown. " +
  "Preserve the existing lighting and color temperature throughout. " +
  "Photo-realistic cinematography, 24fps filmic motion blur.";

const GEOMETRY_PRESERVATION =
  "Maintain perfect perspective geometry — all architectural lines stay straight and unchanged.";

const MOTION_MAP: Record<string, string> = {
  "push-in":
    "Steady dolly forward — camera advances straight ahead toward the center of the frame on a smooth rail with minimal vibration. " +
    "Smooth, steady speed throughout. " +
    STABILITY_SUFFIX,
  "pull-out":
    "Steady dolly backward — camera retreats straight back along the room's center axis on a smooth rail with minimal vibration. " +
    "Frame stays perfectly centered throughout, gradually revealing the full width and depth of the space. " +
    "Smooth, steady speed throughout. " +
    STABILITY_SUFFIX,
  "glide-left":
    "Lateral tracking shot — camera glides smoothly to the left on a dolly track while facing forward. " +
    "Steady speed throughout, revealing adjacent areas and connected spaces. " +
    STABILITY_SUFFIX,
  "glide-right":
    "Lateral tracking shot — camera glides smoothly to the right on a dolly track while facing forward. " +
    "Steady speed throughout, revealing adjacent areas and connected spaces. " +
    STABILITY_SUFFIX,
  "orbit-right":
    "Smooth sweeping arc shot — camera swoops clockwise around the room in a wide, bold arc of approximately 50 degrees to the right. " +
    "The room's center stays fixed as the camera sweeps around it, creating strong parallax between foreground furniture and background walls. " +
    "Steady orbital speed throughout. " +
    GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
  "orbit-right-landscape":
    "Wide sweeping arc shot — camera orbits clockwise around the room in a dramatic 60-degree arc to the right. " +
    "Strong lateral camera displacement — the viewpoint physically moves sideways, not zooming. " +
    "Foreground objects shift significantly against the background, creating bold parallax. " +
    "The camera traces a curved dolly path, never pushing straight forward. " +
    "Steady orbital speed throughout. " +
    GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
  "orbit-left":
    "Smooth arc shot — camera orbits counter-clockwise around the center of the room, sweeping approximately 45 degrees to the left. " +
    "Constant radial distance from the subject, creating parallax between foreground furniture and background walls. " +
    "Steady orbital speed throughout. " +
    GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
  "orbit-left-landscape":
    "Wide sweeping arc shot — camera orbits counter-clockwise around the room in a dramatic 60-degree arc to the left. " +
    "Strong lateral camera displacement — the viewpoint physically moves sideways, not zooming. " +
    "Foreground objects shift significantly against the background, creating bold parallax. " +
    "The camera traces a curved dolly path, never pushing straight forward. " +
    "Steady orbital speed throughout. " +
    GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
  "drone-up":
    "Crane up — camera rises smoothly upward at a moderate, steady speed while gently tilting down to keep the scene centered. " +
    "The landscape and surroundings gradually enter the frame from the edges, revealing the full scale of the property. " +
    GEOMETRY_PRESERVATION + " " + STABILITY_SUFFIX,
  "static":
    "Locked-off tripod shot. Camera is perfectly stationary on a heavy tripod with zero movement. " +
    "Natural ambient environment with subtle life — gentle light shifts, soft atmosphere. The frame is completely stable. " +
    STABILITY_SUFFIX,
};

function getPrompt(cameraAngle: string, aspectRatio?: string): string {
  // Backwards compat: crane-up → drone-up, orbit → orbit-right
  const angle = cameraAngle === "crane-up" ? "drone-up" : cameraAngle === "orbit" ? "orbit-right" : cameraAngle;
  // Use landscape-specific orbit prompts when aspect ratio is 16:9
  const isLandscape = aspectRatio === "16:9";
  if (isLandscape && (angle === "orbit-right" || angle === "orbit-left")) {
    return MOTION_MAP[`${angle}-landscape`] || MOTION_MAP[angle] || MOTION_MAP["push-in"];
  }
  return MOTION_MAP[angle] || MOTION_MAP["push-in"];
}

// ── Clip interface ────────────────────────────────────────────────────────

interface ClipRecord {
  index: number;
  url: string;
  duration: number;
  camera_angle: string;
  image_url: string;
  generation_id?: string;
}

// ── Edge function ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { user, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const { videoId, clipIndex, imageUrl, cameraAngle, duration } = await req.json();

    // ── Validate inputs ───────────────────────────────────────────────
    if (!videoId) throw new Error("videoId is required");
    if (clipIndex === undefined || clipIndex === null) throw new Error("clipIndex is required");
    if (!imageUrl) throw new Error("imageUrl is required");
    if (!RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY not configured");

    const effectiveAngle = (cameraAngle && MOTION_MAP[cameraAngle]) ? cameraAngle : "push-in";
    const effectiveDuration = Math.min(Math.max(duration || 5, 2), 5); // 2-5s, Runway clips always 5s generation

    console.log(`=== regenerate-clip: video=${videoId}, clip=${clipIndex}, angle=${effectiveAngle} ===`);

    // ── Fetch video record ────────────────────────────────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: video, error: fetchErr } = await supabase
      .from("videos")
      .select("id, user_id, clips, aspect_ratio, status")
      .eq("id", videoId)
      .single();

    if (fetchErr || !video) {
      return new Response(
        JSON.stringify({ error: "Video not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (video.user_id !== user!.id) {
      return new Response(
        JSON.stringify({ error: "Not authorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Submit to Runway Gen4 Turbo ───────────────────────────────────
    const ratio = video.aspect_ratio === "16:9" ? "1280:720" : "720:1280";
    const promptText = getPrompt(effectiveAngle, video.aspect_ratio);

    console.log(`Submitting to Runway: angle=${effectiveAngle}, ratio=${ratio}`);

    const runwayRes = await fetch(RUNWAY_API_URL, {
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
        ratio: ratio,
        duration: 5, // Always 5s for best quality
      }),
    });

    if (!runwayRes.ok) {
      const errText = await runwayRes.text();
      console.error(`Runway API error: ${runwayRes.status}`, errText);
      throw new Error(`Runway API ${runwayRes.status}: ${errText}`);
    }

    const runwayData = await runwayRes.json();
    const generationId = runwayData.id;

    if (!generationId) {
      throw new Error("Runway returned no generation ID");
    }

    console.log(`Runway generation started: ${generationId}`);

    // ── Poll for completion (max 60 polls × 2s = ~2 min) ─────────────
    let clipUrl: string | null = null;
    let pollCount = 0;
    const MAX_POLLS = 60;

    while (pollCount < MAX_POLLS) {
      await new Promise((r) => setTimeout(r, 2000));
      pollCount++;

      const statusRes = await fetch(
        `https://api.dev.runwayml.com/v1/tasks/${generationId}`,
        {
          headers: {
            "Authorization": `Bearer ${RUNWAY_API_KEY}`,
            "X-Runway-Version": RUNWAY_VERSION,
          },
        },
      );

      if (!statusRes.ok) {
        console.warn(`Poll ${pollCount}: status check failed (${statusRes.status})`);
        continue;
      }

      const statusData = await statusRes.json();

      if (statusData.status === "SUCCEEDED") {
        clipUrl = statusData.output?.[0] || null;
        console.log(`Clip generation completed: ${clipUrl}`);
        break;
      }

      if (statusData.status === "FAILED") {
        throw new Error(`Runway generation failed: ${statusData.failure || "Unknown reason"}`);
      }

      console.log(`Poll ${pollCount}: status=${statusData.status}`);
    }

    if (!clipUrl) {
      throw new Error("Clip generation timed out after ~2 minutes");
    }

    // ── Update clips in DB ────────────────────────────────────────────
    const existingClips: ClipRecord[] = Array.isArray(video.clips) ? video.clips : [];

    const newClip: ClipRecord = {
      index: clipIndex,
      url: clipUrl,
      duration: effectiveDuration,
      camera_angle: effectiveAngle,
      image_url: imageUrl,
      generation_id: generationId,
    };

    // Replace existing clip at this index, or append
    const clipIdx = existingClips.findIndex((c) => c.index === clipIndex);
    if (clipIdx >= 0) {
      existingClips[clipIdx] = newClip;
    } else {
      existingClips.push(newClip);
      existingClips.sort((a, b) => a.index - b.index);
    }

    const { error: updateErr } = await supabase
      .from("videos")
      .update({ clips: existingClips, updated_at: new Date().toISOString() })
      .eq("id", videoId);

    if (updateErr) {
      console.error("Failed to update clips in DB:", updateErr);
      // Don't fail — we still have the URL to return to the client
    }

    console.log(`Clip ${clipIndex} updated successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        clipIndex,
        clipUrl,
        cameraAngle: effectiveAngle,
        duration: effectiveDuration,
        generationId,
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
