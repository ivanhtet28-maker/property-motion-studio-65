/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
const RUNWAY_VERSION = "2024-11-06";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { generationIds } = await req.json();

    if (!generationIds || !Array.isArray(generationIds) || generationIds.length === 0) {
      throw new Error("generationIds array is required");
    }

    if (!RUNWAY_API_KEY) {
      throw new Error("RUNWAY_API_KEY not configured");
    }

    console.log(`Checking status for ${generationIds.length} Runway generations...`);

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

    const allCompleted = completed.length === generationIds.length;
    const anyFailed = failed.length > 0;

    const videoUrls = completed
      .map((s) => s.videoUrl)
      .filter((url): url is string => url !== null);

    console.log(
      `Status: ${completed.length} completed, ${processing.length} processing, ${pending.length} pending, ${failed.length} failed`
    );

    return new Response(
      JSON.stringify({
        success: true,
        allCompleted,
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
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking batch status:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to check batch status",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
