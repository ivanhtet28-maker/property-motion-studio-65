/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

interface CheckBatchStatusRequest {
  generationIds: string[];
}

interface GenerationStatus {
  generationId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl: string | null;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { generationIds }: CheckBatchStatusRequest = await req.json();

    console.log("Checking status for", generationIds.length, "Luma generations");

    if (!LUMA_API_KEY) {
      throw new Error("LUMA_API_KEY not configured");
    }

    if (!generationIds || generationIds.length === 0) {
      throw new Error("No generation IDs provided");
    }

    // Check status for all generations in parallel
    const statusPromises = generationIds.map(async (generationId) => {
      try {
        const response = await fetch(
          `https://api.lumalabs.ai/dream-machine/v1/generations/${generationId}`,
          {
            headers: {
              "Authorization": `Bearer ${LUMA_API_KEY}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to check status for ${generationId}:`, errorText);
          return {
            generationId,
            status: "failed" as const,
            videoUrl: null,
            error: `Status check failed: ${errorText}`,
          };
        }

        const data = await response.json();

        let status: "pending" | "processing" | "completed" | "failed";
        if (data.state === "completed") {
          status = "completed";
        } else if (data.state === "failed") {
          status = "failed";
        } else if (data.state === "processing") {
          status = "processing";
        } else {
          status = "pending";
        }

        return {
          generationId,
          status,
          videoUrl: data.assets?.video || null,
          error: data.failure_reason || undefined,
        };
      } catch (err) {
        console.error(`Error checking status for ${generationId}:`, err);
        return {
          generationId,
          status: "failed" as const,
          videoUrl: null,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    });

    // Wait for all status checks
    const statuses = await Promise.all(statusPromises);

    // Calculate summary
    const completed = statuses.filter(s => s.status === "completed");
    const processing = statuses.filter(s => s.status === "processing");
    const pending = statuses.filter(s => s.status === "pending");
    const failed = statuses.filter(s => s.status === "failed");

    const allCompleted = completed.length === generationIds.length;
    const anyFailed = failed.length > 0;

    console.log(`Status summary: ${completed.length} completed, ${processing.length} processing, ${pending.length} pending, ${failed.length} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        allCompleted,
        anyFailed,
        summary: {
          total: generationIds.length,
          completed: completed.length,
          processing: processing.length,
          pending: pending.length,
          failed: failed.length,
        },
        statuses,
        videoUrls: allCompleted ? completed.map(s => s.videoUrl).filter(Boolean) : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking Luma batch status:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to check batch status",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
