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
  _progress: number = 0,
  errorMessage: string | null = null
) {
  if (!videoId) return;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const updateData: {
      status: string;
      download_url?: string;
      completed_at?: string;
      error_message?: string;
    } = {
      status,
    };

    if (videoUrl) {
      updateData.download_url = videoUrl;
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
      console.log("Video record updated:", videoId, "status:", status);
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
    const { generationIds, videoId, audioUrl, musicUrl, agentInfo, propertyData, style, layout, customTitle, stitchJobId, clipDurations, provider, imageUrls } = body;

    // If stitchJobId is provided, we're polling Shotstack stitching job instead of Runway
    if (stitchJobId) {
      console.log("Checking Shotstack stitch job status:", stitchJobId);

      const shotstackResponse = await fetch(
        `https://api.shotstack.io/v1/render/${stitchJobId}`,
        {
          headers: {
            "x-api-key": Deno.env.get("SHOTSTACK_API_KEY")!,
          },
        }
      );

      const shotstackData = await shotstackResponse.json();
      const shotstackStatus = shotstackData.response?.status; // "queued", "fetching", "rendering", "saving", "done", "failed"
      const videoUrl = shotstackData.response?.url;

      console.log("Shotstack status:", shotstackStatus);

      if (shotstackStatus === "done" && videoUrl) {
        await updateVideoRecord(videoId, "completed", videoUrl, 100);
        return new Response(
          JSON.stringify({
            status: "done",
            videoUrl: videoUrl,
            message: "Video stitched successfully!",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else if (shotstackStatus === "failed") {
        await updateVideoRecord(videoId, "failed", null, 0, "Shotstack stitching failed");
        return new Response(
          JSON.stringify({
            status: "failed",
            message: "Video stitching failed",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Still stitching
        return new Response(
          JSON.stringify({
            status: "stitching",
            progress: 95,
            message: "Stitching video clips...",
            stitchJobId: stitchJobId,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Otherwise, check AI generation status (Runway or Luma depending on provider)
    if (!generationIds || !Array.isArray(generationIds) || generationIds.length === 0) {
      throw new Error("generationIds array is required");
    }

    const isRunway = provider === "runway";
    const batchCheckFunction = isRunway ? "check-runway-batch" : "check-luma-batch";
    console.log(`Checking status for ${generationIds.length} ${isRunway ? "Runway" : "Luma"} generations`);

    // Check batch status via the appropriate provider function
    const statusResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/${batchCheckFunction}`,
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
      throw new Error(`Failed to check ${isRunway ? "Runway" : "Luma"} batch status`);
    }

    const { allCompleted, anyFailed, summary, videoUrls, statuses } = statusData;

    // Calculate progress based on completed clips
    const progressPercent = Math.round((summary.completed / summary.total) * 80); // 0-80% for AI generation

    await updateVideoRecord(videoId, "processing", null, progressPercent);

    // All terminal = every clip is either completed or failed (none still processing/pending)
    const allTerminal = (summary.completed + summary.failed) === summary.total;

    // If ALL clips failed and no fallback images available, the tour cannot finish
    if (anyFailed && summary.completed === 0 && (!imageUrls || imageUrls.length === 0)) {
      await updateVideoRecord(videoId, "failed", null, 0, `All ${isRunway ? "Runway" : "Luma"} generations failed`);
      return new Response(
        JSON.stringify({
          status: "failed",
          message: "All video clips failed to generate",
          summary,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If not all clips are in a terminal state, keep polling
    if (!allTerminal) {
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

    // --- Hybrid Fallback: Build final URL array, substituting failed clips ---
    // The tour must always finish. Failed AI clips get replaced with original
    // property photos + Shotstack zoomInSlow effect to maintain the sequence.
    const fallbackSlots: number[] = [];
    const finalVideoUrls: string[] = [];

    if (statuses && Array.isArray(statuses)) {
      for (let i = 0; i < statuses.length; i++) {
        const s = statuses[i];
        if (s.status === "completed" && s.videoUrl) {
          finalVideoUrls.push(s.videoUrl);
        } else if (imageUrls && imageUrls[i]) {
          // Failed clip: substitute with original property photo
          finalVideoUrls.push(imageUrls[i]);
          fallbackSlots.push(i);
          console.log(`Clip ${i}: FAILED — hybrid fallback to original image: ${imageUrls[i]}`);
        } else {
          // No fallback image available, use whatever completed URL we have
          // This shouldn't happen if imageUrls is properly passed
          console.warn(`Clip ${i}: FAILED with no fallback image available`);
        }
      }
    } else {
      // Legacy path: no individual statuses, use the aggregated videoUrls
      finalVideoUrls.push(...videoUrls);
    }

    if (finalVideoUrls.length === 0) {
      await updateVideoRecord(videoId, "failed", null, 0, "No video clips or fallback images available");
      return new Response(
        JSON.stringify({
          status: "failed",
          message: "No video clips or fallback images available",
          summary,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (fallbackSlots.length > 0) {
      console.log(`Hybrid fallback: ${fallbackSlots.length} of ${statuses.length} clips using original images`);
    }

    // All terminal — start Shotstack stitching (with fallbacks if needed)
    console.log(`${isRunway ? "Runway" : "Luma"} clips resolved (${summary.completed} AI + ${fallbackSlots.length} fallback)! Starting Shotstack stitching...`);

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
          videoUrls: finalVideoUrls,
          clipDurations: clipDurations,
          audioUrl: audioUrl,
          musicUrl: musicUrl,
          agentInfo: agentInfo,
          propertyData: propertyData,
          style: style || "modern-luxe",
          layout: layout || "modern-luxe",
          customTitle: customTitle || null,
          videoId: videoId,
          fallbackSlots: fallbackSlots.length > 0 ? fallbackSlots : undefined,
        }),
      }
    );

    const stitchData = await stitchResponse.json();

    if (!stitchData.success) {
      console.error("Stitching failed:", stitchData.error);
      await updateVideoRecord(videoId, "failed", null, 0, stitchData.error || "Video stitching failed");
      return new Response(
        JSON.stringify({
          status: "failed",
          message: stitchData.error || "Failed to stitch video clips",
          summary,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Shotstack job started - now poll for the stitch job
    console.log("Stitching job started with Shotstack:", stitchData.jobId);

    return new Response(
      JSON.stringify({
        status: "stitching",
        progress: 90,
        message: "Stitching video clips with Shotstack...",
        stitchJobId: stitchData.jobId,
        summary,
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
