/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");

// Camera motion presets (from generate-runway-batch)
const MOTION_MAP: Record<string, string> = {
  "push-in": "camera push in slowly",
  "pull-out": "camera pull back slowly",
  "tracking": "camera tracking shot left to right",
  "orbit": "camera orbiting slowly around subject",
  "crane-up": "camera crane up vertically",
  "drone-up": "camera drone up vertically",
  "static": "static camera no movement",
};

const STABILITY_SUFFIX = "static cinematic shot, high quality, professional";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { user, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();
    const { videoId, clipIndex, imageUrl, cameraAngle } = body;

    if (!videoId || clipIndex === undefined || !imageUrl || !cameraAngle) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields: videoId, clipIndex, imageUrl, cameraAngle" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RUNWAY_API_KEY) {
      throw new Error("RUNWAY_API_KEY not configured");
    }

    console.log("regenerate-clip: Processing clip", clipIndex, "for video", videoId);

    // 1. Fetch video and verify ownership
    const { data: video, error: fetchError } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user!.id)
      .single();

    if (fetchError || !video) {
      return new Response(
        JSON.stringify({ success: false, error: "Video not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validate clipIndex
    const imageUrls = video.image_urls || [];
    if (clipIndex < 0 || clipIndex >= imageUrls.length) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid clipIndex: ${clipIndex}. Valid range: 0-${imageUrls.length - 1}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Build camera motion prompt
    const motionText = MOTION_MAP[cameraAngle] || "static camera";
    const prompt = `${motionText}. ${STABILITY_SUFFIX}`;

    console.log("regenerate-clip: Submitting to Runway with prompt:", prompt);

    // 4. Call Runway Gen4 Turbo API
    const runwayResponse = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RUNWAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image: imageUrl,
        prompt: prompt,
        duration: 5,
        ratio: "1280:720",
      }),
    });

    if (!runwayResponse.ok) {
      const errText = await runwayResponse.text();
      throw new Error(`Runway API error (${runwayResponse.status}): ${errText}`);
    }

    const runwayData = await runwayResponse.json();
    const taskId = runwayData.id;

    if (!taskId) {
      throw new Error("Runway did not return a task ID");
    }

    console.log("regenerate-clip: Runway task ID:", taskId);

    // 5. Poll for completion (5 min timeout)
    let clipUrl: string | null = null;
    let pollAttempts = 0;
    const maxAttempts = 60;

    while (pollAttempts < maxAttempts) {
      const statusResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
        headers: {
          "Authorization": `Bearer ${RUNWAY_API_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Runway status check failed: ${statusResponse.status}`);
      }

      const statusData = await statusResponse.json();
      const status = statusData.status;

      console.log(`regenerate-clip: Poll attempt ${pollAttempts + 1}/${maxAttempts}, status: ${status}`);

      if (status === "SUCCEEDED") {
        const output = statusData.output?.[0];
        if (output) {
          clipUrl = output;
          console.log("regenerate-clip: Clip generated successfully:", clipUrl);
          break;
        } else {
          throw new Error("Runway returned SUCCEEDED but no output URL");
        }
      } else if (status === "FAILED") {
        throw new Error(`Runway task failed: ${statusData.error || "Unknown error"}`);
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
      pollAttempts++;
    }

    if (!clipUrl) {
      throw new Error("Runway task timed out after 5 minutes");
    }

    // 6. Update database
    const photos = video.photos || {};
    if (!photos.clips) photos.clips = [];
    if (!photos.generationIds) photos.generationIds = [];
    if (!photos.cameraAngles) photos.cameraAngles = [];

    // Ensure arrays are long enough
    while (photos.clips.length <= clipIndex) {
      photos.clips.push({});
    }
    while (photos.generationIds.length <= clipIndex) {
      photos.generationIds.push(null);
    }
    while (photos.cameraAngles.length <= clipIndex) {
      photos.cameraAngles.push(null);
    }

    // Update the specific clip
    photos.clips[clipIndex] = {
      ...photos.clips[clipIndex],
      url: clipUrl,
      duration: 5,
      cameraAction: cameraAngle,
    };
    photos.generationIds[clipIndex] = taskId;
    photos.cameraAngles[clipIndex] = cameraAngle;

    const { error: updateError } = await supabase
      .from("videos")
      .update({ photos })
      .eq("id", videoId);

    if (updateError) {
      throw new Error(`Failed to update video: ${updateError.message}`);
    }

    console.log("regenerate-clip: Complete for clip", clipIndex);

    return new Response(
      JSON.stringify({
        success: true,
        clipUrl: clipUrl,
        clipIndex: clipIndex,
        cameraAngle: cameraAngle,
        estimatedSeconds: 15,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("regenerate-clip error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
