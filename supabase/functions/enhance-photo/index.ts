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

  try {
    const { error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const { job_id } = await req.json();
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

    // 2. Set status to processing
    await supabase.from("photo_jobs").update({ status: "processing" }).eq("id", job_id);
    console.log("enhance-photo: status set to processing");

    const enhancements = job.enhancements || {};
    let resultUrl = job.original_url;

    // 3. Auto-enhance via Autoenhance.ai
    if (enhancements.enhance) {
      if (!AUTOENHANCE_API_KEY) {
        throw new Error("AUTOENHANCE_API_KEY not configured");
      }

      console.log("enhance-photo: submitting to Autoenhance.ai");

      const createRes = await fetch("https://api.autoenhance.ai/v3/images", {
        method: "POST",
        headers: {
          "x-api-key": AUTOENHANCE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image_url: job.original_url,
          image_type: "property",
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error(`Autoenhance create failed (${createRes.status}): ${errText}`);
      }

      const createData = await createRes.json();
      const imageId = createData.image_id || createData.id;
      console.log("enhance-photo: Autoenhance image ID:", imageId);

      // Poll for completion
      let enhanced = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise((r) => setTimeout(r, 3000));

        const statusRes = await fetch(`https://api.autoenhance.ai/v3/images/${imageId}`, {
          headers: { "x-api-key": AUTOENHANCE_API_KEY },
        });

        if (!statusRes.ok) {
          console.warn(`enhance-photo: status check ${attempt} failed (${statusRes.status})`);
          continue;
        }

        const statusData = await statusRes.json();
        console.log(`enhance-photo: poll ${attempt} — status: ${statusData.status}`);

        if (statusData.status === "processed" || statusData.status === "complete") {
          resultUrl = statusData.enhanced_url || statusData.url || statusData.output_url;
          enhanced = true;

          // Update enhanced_url
          await supabase.from("photo_jobs").update({ enhanced_url: resultUrl }).eq("id", job_id);
          console.log("enhance-photo: enhanced_url saved:", resultUrl);
          break;
        }

        if (statusData.status === "failed" || statusData.status === "error") {
          throw new Error(`Autoenhance failed: ${statusData.error || "unknown"}`);
        }
      }

      if (!enhanced) {
        throw new Error("Autoenhance timed out after 2 minutes");
      }
    }

    // 4. Sky replacement (if enabled)
    if (enhancements.sky) {
      const DECOR8_API_KEY = Deno.env.get("DECOR8_API_KEY");
      if (!DECOR8_API_KEY) {
        throw new Error("DECOR8_API_KEY not configured");
      }

      console.log("enhance-photo: submitting sky replacement");

      const skyRes = await fetch("https://api.decor8.ai/replace_sky_behind_house", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${DECOR8_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input_image_url: resultUrl,
          sky_type: enhancements.sky_type || "blue_sky",
        }),
      });

      if (!skyRes.ok) {
        const errText = await skyRes.text();
        throw new Error(`Sky replacement failed (${skyRes.status}): ${errText}`);
      }

      const skyData = await skyRes.json();
      const skyUrl = skyData.info?.url || skyData.url || skyData.output_url;
      console.log("enhance-photo: sky_url saved:", skyUrl);

      await supabase.from("photo_jobs").update({ sky_url: skyUrl }).eq("id", job_id);
    }

    // 5. Mark complete
    await supabase
      .from("photo_jobs")
      .update({ status: "complete", updated_at: new Date().toISOString() })
      .eq("id", job_id);

    console.log("enhance-photo: job complete", job_id);

    return new Response(
      JSON.stringify({ success: true, job_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("enhance-photo error:", err);

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
