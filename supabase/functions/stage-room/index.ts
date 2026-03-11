/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const DECOR8_API_KEY = Deno.env.get("DECOR8_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { user, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const { job_id } = await req.json();
    if (!job_id) throw new Error("job_id is required");

    console.log("stage-room: starting job", job_id);

    if (!DECOR8_API_KEY) {
      throw new Error("DECOR8_API_KEY not configured");
    }

    // 1. Fetch job
    const { data: job, error: fetchError } = await supabase
      .from("photo_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (fetchError || !job) {
      throw new Error(`Job not found: ${fetchError?.message}`);
    }

    // Verify the authenticated user owns this job
    if (job.user_id !== user!.id) {
      return new Response(
        JSON.stringify({ error: "Not authorized to access this job" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Set status to processing
    await supabase.from("photo_jobs").update({ status: "processing" }).eq("id", job_id);
    console.log("stage-room: status set to processing");

    const stageOptions = job.stage_options || {};
    const roomType = stageOptions.room_type || "LIVINGROOM";
    const designStyle = stageOptions.style || "MODERN";

    // 3. Call Decor8 staging API
    console.log(`stage-room: submitting to Decor8 — room: ${roomType}, style: ${designStyle}`);

    const requestBody: Record<string, unknown> = {
      input_image_url: job.original_url,
      room_type: roomType,
      design_style: designStyle,
      num_images: 4,
    };

    const stageRes = await fetch("https://api.decor8.ai/generate_designs_for_room", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DECOR8_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!stageRes.ok) {
      const errText = await stageRes.text();
      throw new Error(`Decor8 staging failed (${stageRes.status}): ${errText}`);
    }

    const stageData = await stageRes.json();
    console.log("stage-room: Decor8 response received");

    // Extract image URLs — handle variable response shapes
    let stagedUrls: string[] = [];

    if (Array.isArray(stageData.images)) {
      stagedUrls = stageData.images.map((img: { url?: string } | string) =>
        typeof img === "string" ? img : img.url || ""
      ).filter(Boolean);
    } else if (Array.isArray(stageData.info?.images)) {
      stagedUrls = stageData.info.images.map((img: { url?: string } | string) =>
        typeof img === "string" ? img : img.url || ""
      ).filter(Boolean);
    } else if (stageData.info?.url) {
      stagedUrls = [stageData.info.url];
    } else if (stageData.url) {
      stagedUrls = [stageData.url];
    } else if (Array.isArray(stageData)) {
      stagedUrls = stageData.map((item: { url?: string } | string) =>
        typeof item === "string" ? item : item.url || ""
      ).filter(Boolean);
    }

    console.log(`stage-room: ${stagedUrls.length} staged image(s) received`);

    if (stagedUrls.length === 0) {
      console.warn("stage-room: no images in response, full response:", JSON.stringify(stageData));
      throw new Error("No staged images returned from Decor8");
    }

    // 4. Save results
    await supabase
      .from("photo_jobs")
      .update({
        staged_urls: stagedUrls,
        status: "complete",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id);

    console.log("stage-room: job complete", job_id);

    return new Response(
      JSON.stringify({ success: true, job_id, count: stagedUrls.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("stage-room error:", err);

    // Try to update the job as failed
    try {
      const { job_id } = await req.clone().json().catch(() => ({ job_id: null }));
      if (job_id) {
        await supabase
          .from("photo_jobs")
          .update({
            status: "failed",
            error_message: err instanceof Error ? err.message : "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
