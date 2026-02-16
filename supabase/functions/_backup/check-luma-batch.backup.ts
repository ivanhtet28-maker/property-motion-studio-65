/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { generationIds } = await req.json();

      if (!generationIds || !Array.isArray(generationIds) || generationIds.length === 0) {
        throw new Error("generationIds array is required");
      }

      if (!LUMA_API_KEY) {
        throw new Error("LUMA_API_KEY not configured");
      }

      console.log(`Checking status for ${generationIds.length} generations...`);

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
            console.error(`Failed to check status for ${generationId}`);
            return {
              generationId,
              status: "failed" as const,
              videoUrl: null,
              error: "Failed to fetch status",
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
            failureReason: data.failure_reason || null,
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