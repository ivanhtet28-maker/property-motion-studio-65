/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function updateVideoRecord(
  videoId: string | undefined,
  status: "processing" | "completed" | "failed",
  videoUrl: string | null = null,
  progress: number = 0,
  errorMessage: string | null = null
) {
  if (!videoId) return;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const updateData: {
      status: string;
      progress: number;
      video_url?: string;
      completed_at?: string;
      error_message?: string;
    } = {
      status,
      progress,
    };

    if (videoUrl) {
      updateData.video_url = videoUrl;
    }

    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
    }

    const { error } = await supabase
      .from("videos")
      .update(updateData)
      .eq("id", videoId);

    if (error) {
      console.error("Failed to update video record:", error);
    } else {
      console.log("Video record updated:", videoId, "status:", status, "progress:", progress);
    }
  } catch (err) {
    console.error("Error updating video record:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { generationIds, videoId, audioUrl, musicUrl, agentInfo, propertyData } = body;

    if (!generationIds || !Array.isArray(generationIds) || generationIds.length === 0) {
      throw new Error("generationIds array is required");
    }

    console.log("Checking status for", generationIds.length, "Luma generations");

    // Check batch status
    const statusResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/check-luma-batch`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({ generationIds }),
      }
    );

    const statusData = await statusResponse.json();

    if (!statusData.success) {
      throw new Error("Failed to check Luma batch status");
    }

    const { allCompleted, anyFailed, summary, videoUrls } = statusData;

    // Calculate progress based on completed clips
    const progressPercent = Math.round((summary.completed / summary.total) * 80); // 0-80% for Luma generation

    await updateVideoRecord(videoId, "processing", null, progressPercent);

    // If any failed, return error
    if (anyFailed && summary.completed === 0) {
      await updateVideoRecord(videoId, "failed", null, 0, "All Luma generations failed");
      return new Response(
        JSON.stringify({
          status: "failed",
          message: "All video clips failed to generate",
          summary,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If not all complete yet, return processing status
    if (!allCompleted) {
      return new Response(
        JSON.stringify({
          status: "processing",
          progress: progressPercent,
          message: `${summary.completed}/${summary.total} clips ready`,
          summary,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All complete - start video stitching
    console.log("All Luma clips ready, starting video stitching...");

    await updateVideoRecord(videoId, "processing", null, 85, "Stitching video clips...");

    const stitchResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/stitch-video`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
        },
        body: JSON.stringify({
          videoUrls,
          propertyData,
          audioUrl,
          musicUrl,
          agentInfo,
          videoId,
        }),
      }
    );

    const stitchData = await stitchResponse.json();

    if (!stitchData.success) {
      await updateVideoRecord(videoId, "failed", null, 0, stitchData.error || "Video stitching failed");
      throw new Error(stitchData.error || "Video stitching failed");
    }

    // Video complete!
    await updateVideoRecord(videoId, "completed", stitchData.videoUrl, 100);

    console.log("Video generation complete:", stitchData.videoUrl);

    return new Response(
      JSON.stringify({
        status: "done",
        videoUrl: stitchData.videoUrl,
        duration: stitchData.duration,
        clipsStitched: stitchData.clipsStitched,
        message: "Video generated successfully",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking video status:", error);
    return new Response(
      JSON.stringify({
        status: "failed",
        error: error instanceof Error ? error.message : "Failed to check video status",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
