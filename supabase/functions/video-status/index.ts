/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
const RUNWAY_VERSION = "2024-11-06";
const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");
const SHOTSTACK_CREATE_URL = "https://api.shotstack.io/create/v1/assets";

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
      video_url?: string;
      completed_at?: string;
      error_message?: string;
    } = {
      status,
    };

    if (videoUrl) {
      updateData.video_url = videoUrl;
    }

    if (status === "completed") {
      updateData.completed_at = new Date().toISOString();
    }

    if (errorMessage) {
      updateData.error_message = errorMessage;
      console.warn("Video error detail:", errorMessage);
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

// ── Inline Runway status checking ─────────────────────────────────────────
// Directly calls the Runway API instead of routing through check-runway-batch
// edge function. This eliminates the internal function-to-function dependency
// that fails when Supabase infrastructure has issues.
async function checkRunwayBatch(generationIds: string[]) {
  if (!RUNWAY_API_KEY) {
    throw new Error("RUNWAY_API_KEY not configured");
  }

  console.log(`Checking status for ${generationIds.length} Runway generations (inline)...`);

  const statusPromises = generationIds.map(async (generationId: string) => {
    try {
      const response = await fetch(
        `https://api.dev.runwayml.com/v1/tasks/${generationId}`,
        {
          headers: {
            "Authorization": `Bearer ${RUNWAY_API_KEY}`,
            "X-Runway-Version": RUNWAY_VERSION,
          },
        }
      );

      if (!response.ok) {
        console.error(`Failed to check status for ${generationId}: ${response.status}`);
        return {
          generationId,
          status: "failed" as const,
          videoUrl: null,
          error: `Failed to fetch status: ${response.status}`,
        };
      }

      const data = await response.json();

      // Runway status mapping:
      // SUCCEEDED → completed, FAILED → failed, RUNNING → processing, PENDING/THROTTLED → pending
      let status: "pending" | "processing" | "completed" | "failed";
      switch (data.status) {
        case "SUCCEEDED":
          status = "completed";
          break;
        case "FAILED":
          status = "failed";
          break;
        case "RUNNING":
          status = "processing";
          break;
        case "PENDING":
        case "THROTTLED":
        default:
          status = "pending";
          break;
      }

      return {
        generationId,
        status,
        videoUrl: status === "completed" ? (data.output?.[0] || null) : null,
        failureReason: data.failure || null,
      };
    } catch (error) {
      console.error(`Error checking generation ${generationId}:`, error);
      return {
        generationId,
        status: "failed" as const,
        videoUrl: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  const statuses = await Promise.all(statusPromises);

  const completed = statuses.filter((s) => s.status === "completed");
  const failed = statuses.filter((s) => s.status === "failed");
  const processing = statuses.filter((s) => s.status === "processing");
  const pending = statuses.filter((s) => s.status === "pending");

  const anyFailed = failed.length > 0;

  const videoUrls = completed
    .map((s) => s.videoUrl)
    .filter((url): url is string => url !== null);

  console.log(
    `Status: ${completed.length} completed, ${processing.length} processing, ${pending.length} pending, ${failed.length} failed`
  );

  return {
    anyFailed,
    statuses,
    videoUrls,
    summary: {
      total: generationIds.length,
      completed: completed.length,
      processing: processing.length,
      pending: pending.length,
      failed: failed.length,
    },
  };
}

// ── Inline Shotstack Create API status checking ─────────────────────────
async function checkShotstackCreateBatch(generationIds: string[]) {
  if (!SHOTSTACK_API_KEY) {
    throw new Error("SHOTSTACK_API_KEY not configured");
  }

  console.log(`Checking status for ${generationIds.length} Shotstack Create assets...`);

  const statusPromises = generationIds.map(async (assetId: string) => {
    try {
      const response = await fetch(
        `${SHOTSTACK_CREATE_URL}/${assetId}`,
        {
          headers: {
            "x-api-key": SHOTSTACK_API_KEY!,
          },
        }
      );

      if (!response.ok) {
        console.error(`Failed to check status for ${assetId}: ${response.status}`);
        return {
          generationId: assetId,
          status: "failed" as const,
          videoUrl: null,
          error: `Failed to fetch status: ${response.status}`,
        };
      }

      const data = await response.json();
      const assetStatus = data.data?.attributes?.status || data.data?.status || "queued";
      const assetUrl = data.data?.attributes?.url || data.data?.url || null;

      // Shotstack Create API status mapping:
      // done → completed, failed → failed, queued/processing → pending/processing
      let status: "pending" | "processing" | "completed" | "failed";
      switch (assetStatus) {
        case "done":
          status = "completed";
          break;
        case "failed":
          status = "failed";
          break;
        case "processing":
          status = "processing";
          break;
        case "queued":
        default:
          status = "pending";
          break;
      }

      return {
        generationId: assetId,
        status,
        videoUrl: status === "completed" ? assetUrl : null,
        failureReason: assetStatus === "failed" ? "Shotstack generation failed" : null,
      };
    } catch (error) {
      console.error(`Error checking asset ${assetId}:`, error);
      return {
        generationId: assetId,
        status: "failed" as const,
        videoUrl: null,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  const statuses = await Promise.all(statusPromises);

  const completed = statuses.filter((s) => s.status === "completed");
  const failed = statuses.filter((s) => s.status === "failed");
  const processing = statuses.filter((s) => s.status === "processing");
  const pending = statuses.filter((s) => s.status === "pending");

  const anyFailed = failed.length > 0;

  const videoUrls = completed
    .map((s) => s.videoUrl)
    .filter((url): url is string => url !== null);

  console.log(
    `Shotstack Status: ${completed.length} completed, ${processing.length} processing, ${pending.length} pending, ${failed.length} failed`
  );

  return {
    anyFailed,
    statuses,
    videoUrls,
    summary: {
      total: generationIds.length,
      completed: completed.length,
      processing: processing.length,
      pending: pending.length,
      failed: failed.length,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    // Parse body — supports both JSON and text/plain (CORS-preflight bypass mode).
    // When the frontend sends Content-Type: text/plain, the browser skips the
    // CORS preflight request entirely, avoiding Supabase gateway CORS issues.
    let body: Record<string, unknown>;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("text/plain")) {
      body = JSON.parse(await req.text());
    } else {
      body = await req.json();
    }

    // Lightweight auth guard — accept JWT from Authorization header OR body._jwt
    // (body._jwt is used in CORS-preflight bypass mode where no headers are sent).
    const authHeader = req.headers.get("authorization");
    const jwt = authHeader?.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : (body._jwt as string | undefined);

    if (!jwt) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseServiceKey);
    const { error: authError } = await authClient.auth.getUser(jwt);
    if (authError) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { generationIds, videoId, audioUrl, musicUrl, musicTrimStart, musicTrimEnd, agentInfo, propertyData, style, layout, customTitle, stitchJobId, clipDurations, provider, imageUrls, outputFormat, cameraAngles } = body;

    // If stitchJobId is provided, we're polling Shotstack stitching job instead of Runway
    if (stitchJobId) {
      console.log("Checking Shotstack stitch job status:", stitchJobId);

      try {
        const shotstackResponse = await fetch(
          `https://api.shotstack.io/v1/render/${stitchJobId}`,
          {
            headers: {
              "x-api-key": Deno.env.get("SHOTSTACK_API_KEY")!,
            },
          }
        );

        if (!shotstackResponse.ok) {
          console.error(`Shotstack API error: ${shotstackResponse.status}`);
          return new Response(
            JSON.stringify({ status: "stitching", progress: 95, message: "Checking stitch status...", stitchJobId }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const shotstackData = await shotstackResponse.json();
        const shotstackStatus = shotstackData.response?.status;
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
      } catch (shotstackError) {
        console.error("Shotstack poll error:", shotstackError);
        return new Response(
          JSON.stringify({ status: "stitching", progress: 95, message: "Checking stitch status...", stitchJobId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Otherwise, check AI generation status
    if (!generationIds || !Array.isArray(generationIds) || generationIds.length === 0) {
      throw new Error("generationIds array is required");
    }

    const isRunway = provider === "runway";
    const isShotstackCreate = provider === "shotstack-create";
    console.log(`Provider: "${provider}", checking ${generationIds.length} generations`);

    // Check batch status based on provider
    let batchResult: {
      anyFailed: boolean;
      summary: { total: number; completed: number; processing: number; pending: number; failed: number };
      videoUrls: string[];
      statuses: Array<{ status: string; videoUrl: string | null; generationId: string }>;
    };

    if (isShotstackCreate) {
      try {
        batchResult = await checkShotstackCreateBatch(generationIds);
      } catch (batchError) {
        console.error("Shotstack Create batch check error:", batchError);
        return new Response(
          JSON.stringify({
            status: "processing",
            progress: 10,
            message: `Checking clips (${batchError instanceof Error ? batchError.message : "retrying"})...`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (isRunway) {
      try {
        batchResult = await checkRunwayBatch(generationIds);
      } catch (batchError) {
        console.error("Runway batch check error:", batchError);
        return new Response(
          JSON.stringify({
            status: "processing",
            progress: 10,
            message: `Checking clips (${batchError instanceof Error ? batchError.message : "retrying"})...`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Luma fallback: still uses internal function call
      const internalAuthKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");

      try {
        const statusResponse = await fetch(
          `${supabaseUrl}/functions/v1/check-luma-batch`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${internalAuthKey}`,
            },
            body: JSON.stringify({ generationIds }),
          }
        );

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text().catch(() => "no body");
          console.error(`Luma batch check HTTP error: ${statusResponse.status} — ${errorText}`);
          return new Response(
            JSON.stringify({ status: "processing", progress: 10, message: "Checking clip status..." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const statusData = await statusResponse.json();
        if (!statusData.success) {
          console.error("Luma batch check failed:", statusData.error || "unknown");
          return new Response(
            JSON.stringify({ status: "processing", progress: 10, message: "Checking clip status..." }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        batchResult = statusData;
      } catch (fetchError) {
        console.error("Luma batch check fetch error:", fetchError);
        return new Response(
          JSON.stringify({ status: "processing", progress: 10, message: "Checking clip status..." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { anyFailed, summary, videoUrls, statuses } = batchResult;
    console.log(`Batch summary: ${summary.completed} completed, ${summary.processing} processing, ${summary.pending} pending, ${summary.failed} failed`);

    // Calculate progress based on completed clips
    const progressPercent = Math.round((summary.completed / summary.total) * 80);

    await updateVideoRecord(videoId, "processing", null, progressPercent);

    // All terminal = every clip is either completed or failed (none still processing/pending)
    const allTerminal = (summary.completed + summary.failed) === summary.total;

    // If ALL clips failed and no fallback images available, the tour cannot finish
    if (anyFailed && summary.completed === 0 && (!imageUrls || imageUrls.length === 0)) {
      await updateVideoRecord(videoId, "failed", null, 0, "All Runway generations failed");
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

    // --- Quality Gate + Hybrid Fallback ---
    // Before stitching, verify each completed clip is actually usable:
    // 1. URL must be accessible (HEAD check)
    // 2. Content-Type must be video/* (not error page HTML)
    // 3. File size must be > 50KB (tiny files = corrupted/empty)
    // Failed clips get replaced with original images (Ken Burns fallback in Shotstack)
    const fallbackSlots: number[] = [];
    const finalVideoUrls: string[] = [];
    const MIN_VIDEO_SIZE_BYTES = 50_000; // 50KB minimum for a valid 5s video clip

    if (statuses && Array.isArray(statuses)) {
      // Run quality checks in parallel for all completed clips
      const qualityChecks = await Promise.all(
        statuses.map(async (s, i) => {
          if (s.status !== "completed" || !s.videoUrl) {
            return { index: i, pass: false, reason: "generation_failed" };
          }

          try {
            const headResp = await fetch(s.videoUrl, {
              method: "HEAD",
              signal: AbortSignal.timeout(10_000),
            });

            if (!headResp.ok) {
              return { index: i, pass: false, reason: `http_${headResp.status}` };
            }

            const contentType = headResp.headers.get("content-type") || "";
            if (!contentType.startsWith("video/")) {
              return { index: i, pass: false, reason: `bad_content_type: ${contentType}` };
            }

            const contentLength = parseInt(headResp.headers.get("content-length") || "0", 10);
            if (contentLength > 0 && contentLength < MIN_VIDEO_SIZE_BYTES) {
              return { index: i, pass: false, reason: `too_small: ${contentLength} bytes` };
            }

            return { index: i, pass: true, reason: "ok" };
          } catch (err) {
            return { index: i, pass: false, reason: `check_error: ${err instanceof Error ? err.message : err}` };
          }
        })
      );

      const qualityFailed = qualityChecks.filter(q => !q.pass && q.reason !== "generation_failed");
      if (qualityFailed.length > 0) {
        console.warn(`Quality gate: ${qualityFailed.length} clips failed validation:`);
        qualityFailed.forEach(q => console.warn(`  Clip ${q.index}: ${q.reason}`));
      }

      for (let i = 0; i < statuses.length; i++) {
        const s = statuses[i];
        const quality = qualityChecks[i];

        if (s.status === "completed" && s.videoUrl && quality.pass) {
          finalVideoUrls.push(s.videoUrl);
        } else if (imageUrls && imageUrls[i]) {
          finalVideoUrls.push(imageUrls[i]);
          fallbackSlots.push(i);
          const reason = quality.reason === "generation_failed" ? "generation failed" : `quality gate: ${quality.reason}`;
          console.log(`Clip ${i}: ${reason} — hybrid fallback to original image`);
        } else {
          console.warn(`Clip ${i}: FAILED with no fallback image available`);
        }
      }
    } else {
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

    // All terminal — return clips to frontend for stitching.
    // Internal edge-function-to-function calls fail with 401 ("Invalid JWT") because
    // the Supabase gateway's verify_jwt setting doesn't reliably apply.
    // Instead, we return the resolved clip URLs and let the frontend call stitch-video
    // directly (browser→function calls work because the SDK handles auth properly).
    console.log(`Clips resolved (${summary.completed} AI + ${fallbackSlots.length} fallback)! Returning to frontend for stitch.`);

    await updateVideoRecord(videoId, "processing", null, 85, "Clips ready — starting stitch...");

    return new Response(
      JSON.stringify({
        status: "ready_to_stitch",
        progress: 85,
        message: `All ${summary.total} clips ready. Starting stitch...`,
        finalVideoUrls,
        fallbackSlots: fallbackSlots.length > 0 ? fallbackSlots : undefined,
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
