/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * check-enhance-status
 *
 * Called by the frontend every few seconds after enhance-photo submits
 * an image to Autoenhance.ai. This function:
 *   1. Checks if Autoenhance has finished processing
 *   2. If done, downloads the enhanced image and stores it
 *   3. Optionally runs sky replacement via Decor8
 *   4. Updates the photo_jobs record with results
 *
 * This avoids the timeout issue of polling within a single edge function call.
 */

const AUTOENHANCE_API_KEY = Deno.env.get("AUTOENHANCE_API_KEY");

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

    const body = await req.json();
    const job_id = body.job_id;
    if (!job_id) throw new Error("job_id is required");

    // 1. Fetch job
    const { data: job, error: fetchError } = await supabase
      .from("photo_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (fetchError || !job) {
      throw new Error(`Job not found: ${fetchError?.message}`);
    }

    if (job.user_id !== user!.id) {
      return new Response(
        JSON.stringify({ error: "Not authorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // If already complete or failed, return current state
    if (job.status === "complete" || job.status === "failed") {
      return new Response(
        JSON.stringify({
          job_id,
          status: job.status,
          enhanced_url: job.enhanced_url,
          sky_url: job.sky_url,
          error_message: job.error_message,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const externalId = job.external_id;
    if (!externalId) {
      // No external ID yet — enhance-photo hasn't submitted to Autoenhance yet
      return new Response(
        JSON.stringify({ job_id, status: "processing", message: "Waiting for submission" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!AUTOENHANCE_API_KEY) {
      throw new Error("AUTOENHANCE_API_KEY not configured");
    }

    // 2. Check Autoenhance status
    console.log(`check-enhance-status: checking ${externalId} for job ${job_id}`);

    const statusRes = await fetch(`https://api.autoenhance.ai/v3/images/${externalId}`, {
      headers: { "x-api-key": AUTOENHANCE_API_KEY },
    });

    if (!statusRes.ok) {
      console.warn(`check-enhance-status: Autoenhance status check failed (${statusRes.status})`);
      return new Response(
        JSON.stringify({ job_id, status: "processing", message: "Checking enhancement status..." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const statusData = await statusRes.json();
    console.log(`check-enhance-status: enhanced=${statusData.enhanced}, status=${statusData.status}`);

    // Check for failure
    if (statusData.error || statusData.status === "failed" || statusData.status === "error") {
      const errorMsg = statusData.error || statusData.message || "Enhancement failed";
      await supabase.from("photo_jobs").update({
        status: "failed",
        error_message: `Autoenhance failed: ${errorMsg}`,
        updated_at: new Date().toISOString(),
      }).eq("id", job_id);

      return new Response(
        JSON.stringify({ job_id, status: "failed", error_message: errorMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if still processing
    if (statusData.enhanced !== true && statusData.status !== "processed" && statusData.status !== "complete") {
      return new Response(
        JSON.stringify({ job_id, status: "processing", message: "Enhancement in progress..." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Enhancement is done — download the enhanced image
    console.log("check-enhance-status: enhancement done, downloading result");

    const enhancedRes = await fetch(
      `https://api.autoenhance.ai/v3/images/${externalId}/enhanced`,
      { headers: { "x-api-key": AUTOENHANCE_API_KEY } },
    );

    if (!enhancedRes.ok) {
      throw new Error(`Failed to download enhanced image (${enhancedRes.status})`);
    }

    const enhancedBuffer = await enhancedRes.arrayBuffer();
    console.log("check-enhance-status: enhanced image downloaded, size:", enhancedBuffer.byteLength);

    const enhancedPath = `${job.user_id}/enhanced/${Date.now()}-${externalId}.jpg`;
    const { error: storeError } = await supabase.storage
      .from("property-images")
      .upload(enhancedPath, enhancedBuffer, {
        contentType: "image/jpeg",
        cacheControl: "3600",
      });

    if (storeError) {
      throw new Error(`Failed to store enhanced image: ${storeError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("property-images")
      .getPublicUrl(enhancedPath);

    const enhancedUrl = publicUrlData.publicUrl;
    console.log("check-enhance-status: enhanced_url:", enhancedUrl);

    // Update enhanced_url
    await supabase.from("photo_jobs").update({ enhanced_url: enhancedUrl }).eq("id", job_id);

    // 4. Sky replacement (if enabled)
    const enhancements = job.enhancements || {};
    let skyUrl: string | null = null;

    if (enhancements.sky) {
      const DECOR8_API_KEY = Deno.env.get("DECOR8_API_KEY");
      if (!DECOR8_API_KEY) {
        throw new Error("DECOR8_API_KEY not configured");
      }

      console.log("check-enhance-status: running sky replacement");

      const skyRes = await fetch("https://api.decor8.ai/replace_sky_behind_house", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DECOR8_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input_image_url: enhancedUrl,
          sky_type: enhancements.sky_type || "DAY",
        }),
      });

      if (!skyRes.ok) {
        const errText = await skyRes.text();
        console.error("check-enhance-status: sky replacement failed:", errText);
        // Don't fail the whole job — enhancement succeeded, sky is optional
        await supabase.from("photo_jobs").update({
          status: "complete",
          error_message: `Enhancement succeeded but sky replacement failed: ${errText}`,
          updated_at: new Date().toISOString(),
        }).eq("id", job_id);

        return new Response(
          JSON.stringify({ job_id, status: "complete", enhanced_url: enhancedUrl, sky_url: null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const skyData = await skyRes.json();
      console.log("check-enhance-status: sky response keys:", Object.keys(skyData));

      skyUrl =
        skyData.new_image_url ||
        skyData.output_image_url ||
        skyData.info?.url ||
        skyData.url ||
        skyData.output_url ||
        skyData.result_url;

      if (skyUrl) {
        await supabase.from("photo_jobs").update({ sky_url: skyUrl }).eq("id", job_id);
        console.log("check-enhance-status: sky_url saved");
      } else {
        console.warn("check-enhance-status: sky replacement returned no URL:", JSON.stringify(skyData).slice(0, 300));
      }
    }

    // 5. Mark complete
    await supabase.from("photo_jobs").update({
      status: "complete",
      updated_at: new Date().toISOString(),
    }).eq("id", job_id);

    console.log("check-enhance-status: job complete", job_id);

    return new Response(
      JSON.stringify({
        job_id,
        status: "complete",
        enhanced_url: enhancedUrl,
        sky_url: skyUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("check-enhance-status error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
