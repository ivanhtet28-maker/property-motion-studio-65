/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const AUTOENHANCE_API_KEY = Deno.env.get("AUTOENHANCE_API_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let job_id: string | null = null;

  try {
    const { user, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const body = await req.json();
    job_id = body.job_id;
    if (!job_id) throw new Error("job_id is required");

    console.log("enhance-photo: starting job", job_id);

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
    console.log("enhance-photo: status set to processing");

    const enhancements = job.enhancements || {};

    // 3. If no auto-enhance requested, skip to sky replacement handling
    if (!enhancements.enhance) {
      // If only sky replacement, we still need to process it — but sky is fast
      if (enhancements.sky) {
        const skyUrl = await doSkyReplacement(job.original_url, enhancements.sky_type || "DAY");
        await supabase.from("photo_jobs").update({
          sky_url: skyUrl,
          status: "complete",
          updated_at: new Date().toISOString(),
        }).eq("id", job_id);

        console.log("enhance-photo: sky-only job complete", job_id);
        return new Response(
          JSON.stringify({ success: true, job_id, status: "complete" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Neither enhance nor sky — shouldn't happen but mark complete
      await supabase.from("photo_jobs").update({
        status: "complete",
        updated_at: new Date().toISOString(),
      }).eq("id", job_id);

      return new Response(
        JSON.stringify({ success: true, job_id, status: "complete" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Auto-enhance via Autoenhance.ai (v3 API) — submit only, don't poll
    if (!AUTOENHANCE_API_KEY) {
      throw new Error("AUTOENHANCE_API_KEY not configured. Please set it in Supabase Edge Function secrets.");
    }

    console.log("enhance-photo: submitting to Autoenhance.ai");

    // Step 1: Download the original image binary from our storage
    const imageRes = await fetch(job.original_url);
    if (!imageRes.ok) {
      throw new Error(`Failed to download original image: ${imageRes.status} ${imageRes.statusText}`);
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const imageName = `job-${job_id}.jpg`;

    console.log("enhance-photo: downloaded original image, size:", imageBuffer.byteLength);

    // Step 2: Create image record in Autoenhance (returns upload_url)
    const createRes = await fetch("https://api.autoenhance.ai/v3/images/", {
      method: "POST",
      headers: {
        "x-api-key": AUTOENHANCE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_name: imageName,
        enhance_type: enhancements.enhance_type || "property",
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Autoenhance create failed (${createRes.status}): ${errText}`);
    }

    const createData = await createRes.json();
    console.log("enhance-photo: Autoenhance create response:", JSON.stringify(createData));
    const imageId = createData.image_id || createData.id;
    const uploadUrl = createData.s3PutObjectUrl || createData.upload_url;
    console.log("enhance-photo: Autoenhance image ID:", imageId);

    if (!imageId) {
      throw new Error(`Autoenhance did not return an image_id. Response: ${JSON.stringify(createData)}`);
    }
    if (!uploadUrl) {
      throw new Error(`Autoenhance did not return an upload_url. Response: ${JSON.stringify(createData)}`);
    }

    // Step 3: Upload the binary image to the upload_url
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: imageBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Autoenhance upload failed (${uploadRes.status}): ${errText}`);
    }

    console.log("enhance-photo: image uploaded to Autoenhance, imageId:", imageId);

    // Step 4: Store the Autoenhance image ID for async polling
    // The frontend will call check-enhance-status to poll for completion
    await supabase.from("photo_jobs").update({
      external_id: imageId,
    }).eq("id", job_id);

    console.log("enhance-photo: submitted, returning immediately. Frontend will poll check-enhance-status.");

    return new Response(
      JSON.stringify({ success: true, job_id, status: "processing", external_id: imageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("enhance-photo error:", err);

    // Mark the job as failed so the frontend knows
    if (job_id) {
      try {
        await supabase
          .from("photo_jobs")
          .update({
            status: "failed",
            error_message: err instanceof Error ? err.message : "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);
      } catch (updateErr) {
        console.error("enhance-photo: failed to mark job as failed:", updateErr);
      }
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ── Sky Replacement Helper ────────────────────────────────────────────────

async function doSkyReplacement(imageUrl: string, skyType: string): Promise<string> {
  const DECOR8_API_KEY = Deno.env.get("DECOR8_API_KEY");
  if (!DECOR8_API_KEY) {
    throw new Error("DECOR8_API_KEY not configured. Please set it in Supabase Edge Function secrets.");
  }

  // Decor8 API expects lowercase: "day", "dusk", "night"
  const normalizedSkyType = skyType.toLowerCase();
  console.log("enhance-photo: submitting sky replacement, type:", normalizedSkyType);

  const skyRes = await fetch("https://api.decor8.ai/replace_sky_behind_house", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DECOR8_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input_image_url: imageUrl,
      sky_type: normalizedSkyType,
    }),
  });

  if (!skyRes.ok) {
    const errText = await skyRes.text();
    throw new Error(`Sky replacement failed (${skyRes.status}): ${errText}`);
  }

  const skyData = await skyRes.json();
  console.log("enhance-photo: Decor8 sky response keys:", Object.keys(skyData));

  // Try multiple response shapes
  const skyUrl =
    skyData.new_image_url ||
    skyData.output_image_url ||
    skyData.info?.url ||
    skyData.url ||
    skyData.output_url ||
    skyData.result_url;

  if (!skyUrl) {
    throw new Error(`Sky replacement did not return an image URL. Response: ${JSON.stringify(skyData).slice(0, 500)}`);
  }

  console.log("enhance-photo: sky replacement done");
  return skyUrl;
}
