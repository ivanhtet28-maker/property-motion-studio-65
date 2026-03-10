/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";


const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

interface CheckLumaStatusRequest {
  generationId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const { generationId }: CheckLumaStatusRequest = await req.json();

    console.log("=== CHECK LUMA AI STATUS ===");
    console.log("Generation ID:", generationId);

    // Validate input
    if (!generationId) {
      return new Response(
        JSON.stringify({ error: "generationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!LUMA_API_KEY) {
      console.error("LUMA_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Luma AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Luma AI status endpoint
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
      console.error("Luma API error:", response.status, errorText);
      throw new Error(`Luma API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    console.log("Luma status:", data.state);

    // Extract status and video URL
    const status = data.state; // "pending", "processing", "completed", "failed"
    const videoUrl = data.assets?.video || null;

    if (status === "completed" && videoUrl) {
      console.log("Luma intro completed:", videoUrl);
    } else if (status === "failed") {
      console.error("Luma generation failed:", data.failure_reason);
    } else {
      console.log("Luma generation in progress...");
    }

    return new Response(
      JSON.stringify({
        status: status,
        videoUrl: videoUrl,
        failureReason: data.failure_reason || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error checking Luma status:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to check Luma status",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
