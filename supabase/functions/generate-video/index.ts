// Edge function for video generation using Runway Gen-3 Alpha Turbo
  /// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
  };

  interface PropertyData {
      address: string;
      price: string;
      beds: number;
      baths: number;
      carSpaces?: number;        // ← NEW (optional)
      landSize?: string;          // ← NEW (optional)
      features?: string[];        // ← NEW (optional)
      description: string;
    }

  interface ImageMetadata {
    url: string;
    cameraAngle: string;
    duration: number;
  }

  interface GenerateVideoRequest {
    imageUrls: string[];
    imageMetadata?: ImageMetadata[];
    propertyData: PropertyData;
    style: string;
    layout?: string;
    customTitle?: string;
    voice: string;
    music: string;
    userId?: string;
    propertyId?: string;
    script?: string;
    source?: string; // "upload" | "scrape"
    agentInfo?: {
      name: string;
      phone: string;
      email: string;
      photo: string | null;
    };
    // When provided, skip Runway and go straight to Shotstack stitching
    preGeneratedVideoUrls?: string[];
  }

  // Music library mapping - updated IDs to match frontend
    const MUSIC_LIBRARY: Record<string, string> = {
      // Cinematic & Epic
      "cinematic-epic-1": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/cinematic-epic-1.mp3",
      "cinematic-epic-2": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/cinematic-epic-2.mp3",
      "cinematic-epic-3": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/cinematic-epic-3.mp3",

      // Modern & Chill
      "modern-chill-1": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/modern-chill-1.mp3",
      "modern-chill-2": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/modern-chill-2.mp3",
      "modern-chill-3": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/modern-chill-3.mp3",

      // Upbeat & Energetic
      "upbeat-energetic-1": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/upbeat-energetic-1.mp3",
      "upbeat-energetic-2": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/upbeat-energetic-2.mp3",
      "upbeat-energetic-3": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/upbeat-energetic-3.mp3",

      // Classical Elegance
      "classical-elegant-1": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/classical-elegant-1.mp3",
      "classical-elegant-2": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/classical-elegant-2.mp3",
      "classical-elegant-3": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/classical-elegant-3.mp3",

      // Ambient Relaxing
      "ambient-relaxing-1": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/ambient-relaxing-1.mp3",
      "ambient-relaxing-2": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/ambient-relaxing-2.mp3",
      "ambient-relaxing-3": "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music/ambient-relaxing-3.mp3",
    };

  const getMusicUrl = (musicId: string): string | null => {
    return MUSIC_LIBRARY[musicId] || null;
  };

  interface LumaGeneration {
    imageUrl: string;
    generationId: string;
    status: "queued" | "error";
    error?: string;
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    try {
      const { imageUrls, imageMetadata, propertyData, style, layout, customTitle, voice, music, userId, propertyId, script, source, agentInfo, preGeneratedVideoUrls }: GenerateVideoRequest = await req.json();

      console.log("=== LUMA VIDEO GENERATION ===");
      console.log("Total images:", imageUrls?.length || 0);
      console.log("Property:", propertyData?.address);

      if (!imageUrls || imageUrls.length < 3) {
        return new Response(
          JSON.stringify({ error: "Need at least 3 images for video generation (15 seconds minimum)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (imageUrls.length > 10) {
        return new Response(
          JSON.stringify({ error: "Maximum 10 images allowed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (const url of imageUrls) {
        if (!url.startsWith("http")) {
          return new Response(
            JSON.stringify({ error: "Images must be URLs, not base64 data" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Calculate expected duration from clamped per-clip durations (Runway: 5-10s)
      const metadataSource = imageMetadata || imageUrls.map(url => ({ url, cameraAngle: "auto", duration: 5 }));
      const expectedDuration = metadataSource.reduce((sum: number, m: { duration?: number }) => sum + Math.min(Math.max(m.duration ?? 5, 2), 10), 0);
      console.log("Expected video duration:", expectedDuration, "seconds");

      let audioUrl: string | null = null;
      if (voice && script) {
        console.log("Generating voiceover with ElevenLabs...");
        try {
          const audioResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-audio`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              },
              body: JSON.stringify({
                script: script,
                voiceId: voice,
                videoId: propertyId,
              }),
            }
          );

          const audioData = await audioResponse.json();
          if (audioData.success) {
            audioUrl = audioData.audioUrl;
            console.log("Voiceover generated:", audioUrl);
          } else {
            console.warn("Voiceover generation failed:", audioData.error);
          }
        } catch (err) {
          console.error("Error generating voiceover:", err);
        }
      }

      let musicUrl: string | null = null;
      if (music) {
        musicUrl = getMusicUrl(music);
        if (musicUrl) {
          console.log("Using background music:", music);
        } else {
          console.warn(`Music track not found: ${music}`);
        }
      }

      let videoRecordId: string | null = null;
      let isFreeTrial = false;

      if (userId) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, supabaseServiceKey);

          // Check user subscription status and free trial availability
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("subscription_status, free_video_used")
            .eq("id", userId)
            .single();

          if (!userError && userData) {
            const hasActiveSubscription = userData.subscription_status === "active";
            const hasFreeTrial = !userData.free_video_used;

            // Determine if this is a free trial video
            if (!hasActiveSubscription && hasFreeTrial) {
              isFreeTrial = true;
              console.log("This is a free trial video generation");

              // Mark free trial as used
              const { error: updateError } = await supabase
                .from("users")
                .update({ free_video_used: true })
                .eq("id", userId);

              if (updateError) {
                console.error("Failed to mark free trial as used:", updateError);
              } else {
                console.log("Free trial marked as used for user:", userId);
              }
            }
          }

          const { data: videoRecord, error: dbError } = await supabase
            .from("videos")
            .insert({
              user_id: userId,
              source: source || "upload",
              property_address: propertyData.address || "Unknown Property",
              price: propertyData.price || null,
              bedrooms: propertyData.beds || null,
              bathrooms: propertyData.baths || null,
              car_spaces: propertyData.carSpaces || null,
              template_used: style,
              music_used: music,
              aspect_ratio: "9:16",
              status: "processing",
              agent_name: agentInfo?.name || null,
              agent_phone: agentInfo?.phone || null,
              agent_email: agentInfo?.email || null,
              is_free_trial: isFreeTrial,
              thumbnail_url: imageUrls[0] || null,
            })
            .select()
            .single();

          if (dbError) {
            console.error("Failed to create video record:", dbError);
          } else {
            videoRecordId = videoRecord.id;
            console.log("Video record created:", videoRecordId, isFreeTrial ? "(FREE TRIAL)" : "");
          }
        } catch (dbErr) {
          console.error("Database error:", dbErr);
        }
      }

      // --- Canvas flow: pre-generated video clips supplied by client ---
      if (preGeneratedVideoUrls && preGeneratedVideoUrls.length > 0) {
        console.log("Canvas flow: skipping Runway, stitching", preGeneratedVideoUrls.length, "pre-generated clips directly");

        const clipDurations = (imageMetadata || imageUrls.map(() => ({ duration: 5 }))).map(
          (m: { duration?: number }) => m.duration ?? 5
        );

        const stitchResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/stitch-video`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              videoUrls: preGeneratedVideoUrls,
              clipDurations,
              audioUrl,
              musicUrl,
              agentInfo,
              propertyData,
              style,
              layout: layout || style,
              customTitle: customTitle || "",
            }),
          }
        );

        const stitchData = await stitchResponse.json();

        if (!stitchData.success || !stitchData.jobId) {
          throw new Error(stitchData.error || "Failed to start Shotstack stitching");
        }

        console.log("Shotstack stitch job started:", stitchData.jobId);

        return new Response(
          JSON.stringify({
            success: true,
            provider: "canvas",
            videoId: videoRecordId,
            stitchJobId: stitchData.jobId,
            generationIds: [],
            totalClips: preGeneratedVideoUrls.length,
            estimatedDuration: expectedDuration,
            estimatedTime: 60,
            message: `Canvas clips generated. Stitching ${preGeneratedVideoUrls.length} clips with Shotstack.`,
            audioUrl,
            musicUrl,
            agentInfo,
            propertyData,
            style,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // --- Luma flow ---
      console.log("Starting Luma batch generation for", imageUrls.length, "images...");

      // Prepare image metadata (use provided metadata or create default)
      const metadataForLuma = imageMetadata || imageUrls.map(url => ({
        url,
        cameraAngle: "auto",
        duration: 5
      }));

      const lumaResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-luma-batch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            imageMetadata: metadataForLuma,
            propertyAddress: propertyData.address,
          }),
        }
      );

      const lumaData = await lumaResponse.json();

      if (!lumaData.success) {
        throw new Error(lumaData.error || "Failed to start Luma batch generation");
      }

      if (!Array.isArray(lumaData.generations)) {
        throw new Error(`Unexpected response from generate-luma-batch: ${JSON.stringify(lumaData)}`);
      }

      const generations = (lumaData.generations as LumaGeneration[]).filter(
        (g) => g.status === "queued" && g.generationId
      );
      const generationIds = generations.map((g) => g.generationId).filter(Boolean) as string[];

      console.log(`Started ${generations.length} Luma generations`);
      console.log("Generation IDs:", generationIds);

      if (generationIds.length === 0) {
        const failedGenerations = (lumaData.generations as LumaGeneration[]).filter((g) => g.status === "error");
        const errors = failedGenerations.map((g) => g.error).join("; ");
        throw new Error(`No valid Luma generation IDs returned. All ${lumaData.generations?.length ?? 0} submissions failed. Errors: ${errors || "unknown"}`);
      }

      // Save generation context to DB so Dashboard can resume polling if user navigates away
      if (videoRecordId) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

          const clipDurations = (imageMetadata || metadataForLuma).map(m => m.duration ?? 5);

          await supabaseAdmin
            .from("videos")
            .update({
              photos: JSON.stringify({
                generationIds,
                audioUrl,
                musicUrl,
                clipDurations,
                agentInfo: agentInfo || null,
                propertyData: propertyData,
                style: style,
              }),
            })
            .eq("id", videoRecordId);

          console.log("Saved generation context to DB for recovery");
        } catch (err) {
          console.error("Failed to save generation context:", err);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          provider: "luma",
          videoId: videoRecordId,
          generationIds: generationIds,
          totalClips: generationIds.length,
          estimatedDuration: expectedDuration,
          estimatedTime: generationIds.length * 45,
          message: `Started ${generationIds.length} Luma generations. Use check-luma-batch to poll status.`,
          audioUrl: audioUrl,
          musicUrl: musicUrl,
          agentInfo: agentInfo,
          propertyData: propertyData,
          style: style,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error in video generation:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Failed to generate video",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  });