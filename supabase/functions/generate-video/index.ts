// Edge function for video generation using Runway Gen-3 Alpha Turbo
  /// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  const ALLOWED_ORIGIN = Deno.env.get("CORS_ALLOWED_ORIGIN") || "*";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
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
    cameraAction?: string;   // Camera Action dropdown (e.g., "parallax-glide")
    room_type?: string;      // AI-detected room (e.g., "kitchen-orbit")
    duration: number;
    windowPosition?: string; // "left" | "right" | "center" | "none"
    bedPosition?: string;    // "left" | "right" | "center" | "none"
    kitchenVisible?: string; // "left" | "right" | "none" — open-plan kitchen detection
    visualAnchor?: string;   // "fireplace" | "feature-wall" | ... | "none"
    anchorPosition?: string; // "left" | "right" | "center"
    facadeSymmetry?: string;    // "symmetric" | "asymmetric-left" | "asymmetric-right" | "none"
    doorPosition?: string;      // "left" | "center" | "right" | "none"
    stories?: string;           // "1" | "2" | "3" | "none"
    fenceObstruction?: string;  // "yes" | "no" | "none"
    drivewayDominance?: string; // "yes" | "no" | "none"
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
    // When true, skip ALL AI generation and use Shotstack Ken Burns effects on raw photos
    useKenBurns?: boolean;
  }

  // Map user camera angle selections to Shotstack Ken Burns effect names.
  // Ken Burns mode applies these as mathematical transforms directly to still images —
  // no AI generation, no hallucination, identical output every run.
  function toShotstackEffect(cameraAngle: string): string {
    switch (cameraAngle) {
      case "push-out":    return "zoomOutSlow";
      case "orbit-right": return "slideLeftSlow";  // image moves left = camera pans right
      case "orbit-left":  return "slideRightSlow"; // image moves right = camera pans left
      case "push-in":
      case "zoom-in":
      case "wide-shot":
      case "auto":
      default:            return "zoomInSlow";
    }
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

  // ── Dual-Crop Engine ─────────────────────────────────────────────────────
  // When a user uploads a 16:9 landscape photo, Runway blindly center-crops
  // it to 9:16, losing 30-40% of edge detail. Instead, we pre-crop into two
  // 9:16 portrait slices (left-weighted + right-weighted) and send both to
  // Runway with the same seed for visual consistency and connected motion.

  interface DualCropResult {
    leftUrl: string;
    rightUrl: string;
    seed: number;
  }

  // Dual-crop disabled: imagescript uses WASM which causes Supabase Edge Function
  // boot errors (546). Images pass through unchanged — Runway handles cropping itself.
  async function dualCropLandscape(
    _imageUrl: string,
    _supabase: ReturnType<typeof createClient>
  ): Promise<DualCropResult | null> {
    return null;
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    try {
      const { imageUrls, imageMetadata, propertyData, style, layout, customTitle, voice, music, userId, propertyId, script, source, agentInfo, preGeneratedVideoUrls, useKenBurns }: GenerateVideoRequest = await req.json();

      console.log("=== VIDEO GENERATION ===");
      console.log("Mode:", useKenBurns ? "Ken Burns (Shotstack direct)" : "Runway Gen-3a");
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
            .from("user_preferences")
            .select("subscription_status, free_video_used")
            .eq("user_id", userId)
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
                .from("user_preferences")
                .update({ free_video_used: true })
                .eq("user_id", userId);

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

      // --- Ken Burns flow: skip AI entirely, use Shotstack effects on raw photos ---
      // This is how all professional real estate video tools (AutoReel, Box Brownie, etc.)
      // work: mathematical zoom/pan transforms on the original photos — zero hallucination.
      if (useKenBurns) {
        console.log("Ken Burns flow: bypassing AI generation, applying Shotstack effects to photos");

        const imageEffects = metadataSource.map((m: ImageMetadata) => toShotstackEffect(m.cameraAngle || "auto"));
        const cameraAngles = metadataSource.map((m: ImageMetadata) => m.cameraAngle || "auto");
        const clipDurations = metadataSource.map((m: ImageMetadata) => m.duration ?? 3.5);

        console.log("Effects:", imageEffects);

        const stitchResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/stitch-video`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            },
            body: JSON.stringify({
              imageUrls,
              imageEffects,
              cameraAngles,
              clipDurations,
              audioUrl,
              musicUrl,
              agentInfo,
              propertyData,
              style,
              layout: layout || style,
              customTitle: customTitle || "",
              videoId: videoRecordId,
            }),
          }
        );

        const stitchData = await stitchResponse.json();

        if (!stitchData.success || !stitchData.jobId) {
          throw new Error(stitchData.error || "Failed to start Shotstack Ken Burns render");
        }

        console.log("Ken Burns Shotstack job started:", stitchData.jobId);

        return new Response(
          JSON.stringify({
            success: true,
            provider: "ken-burns",
            videoId: videoRecordId,
            stitchJobId: stitchData.jobId,
            generationIds: [],
            totalClips: imageUrls.length,
            estimatedDuration: expectedDuration,
            estimatedTime: 45,
            message: `Ken Burns render started for ${imageUrls.length} photos. No AI generation needed.`,
            audioUrl,
            musicUrl,
            agentInfo,
            propertyData,
            style,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
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

      // --- Runway Gen-3a Turbo flow ---
      // Uses numeric camera_motion sliders for consistent, predictable camera moves.
      // gen3a_turbo is chosen over gen4_turbo because it exposes camera_motion via the REST API.
      console.log("Starting Runway Gen-3a batch generation for", imageUrls.length, "images...");

      const baseMetadata = imageMetadata || imageUrls.map(url => ({
        url,
        cameraAngle: "auto",
        duration: 5
      }));

      // ── Dual-Crop Engine: Expand landscape images into two portrait crops ──
      // For each landscape image (width > height × 1.3), we pre-crop into two
      // 9:16 slices and send both to Runway with the same seed. This prevents
      // Runway's blind center-crop from losing 30-40% of edge detail.
      const supabaseCropUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseCropKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabaseCrop = createClient(supabaseCropUrl, supabaseCropKey);

      // Living room types that should use directional dual-crop based on window position
      const LIVING_ROOM_TYPES = new Set(["living-room-wide", "living-room-orbit"]);

      const expandedMetadata: Array<{
        url: string;
        cameraAngle?: string;
        cameraAction?: string;
        room_type?: string;
        duration?: number;
        seed?: number;
        motionBias?: "slide-right" | "slide-left" | "push-forward";
        windowPosition?: string;
        bedPosition?: string;
        kitchenVisible?: string;
        visualAnchor?: string;
        anchorPosition?: string;
        facadeSymmetry?: string;
        doorPosition?: string;
        stories?: string;
        fenceObstruction?: string;
        drivewayDominance?: string;
      }> = [];
      const expandedImageUrls: string[] = []; // Original URLs for hybrid fallback

      for (let i = 0; i < baseMetadata.length; i++) {
        const meta = baseMetadata[i];
        const originalUrl = meta.url || imageUrls[i];

        // Respect max 10 clips for Runway cost control
        if (expandedMetadata.length >= 10) {
          console.log(`Clip limit reached (10), skipping remaining images`);
          break;
        }

        const cropResult = await dualCropLandscape(originalUrl, supabaseCrop);

        if (cropResult) {
          console.log(`Image ${i + 1}: LANDSCAPE → dual-cropped (seed: ${cropResult.seed}, room_type: ${meta.room_type || "unknown"})`);

          // Determine crop direction for living rooms with detected windows
          const isLivingRoom = meta.room_type && LIVING_ROOM_TYPES.has(meta.room_type);
          const windowPos = meta.windowPosition || "none";
          const windowsOnRight = isLivingRoom && windowPos === "right";
          console.log(`Image ${i + 1} dual-crop decision: room_type=${meta.room_type}, isLivingRoom=${isLivingRoom}, windowPos=${windowPos}, windowsOnRight=${windowsOnRight}`);

          // Check if adding both crops would exceed the limit
          if (expandedMetadata.length + 2 > 10) {
            // Only add one crop to stay within limit — pick the interior-facing crop
            const cropUrl = windowsOnRight ? cropResult.rightUrl : cropResult.leftUrl;
            const bias = windowsOnRight ? "slide-left" : "slide-right";
            expandedMetadata.push({
              ...meta,
              url: cropUrl,
              seed: cropResult.seed,
              motionBias: bias,
            });
            expandedImageUrls.push(originalUrl);
            console.log(`Only added single crop (clip limit), bias: ${bias}`);
          } else if (windowsOnRight) {
            // Windows on RIGHT: orbit AWAY from windows (left)
            // Crop A (Anchor): Right-weighted (shows window), slides left away from it
            expandedMetadata.push({
              ...meta,
              url: cropResult.rightUrl,
              seed: cropResult.seed,
              motionBias: "slide-left",
            });
            expandedImageUrls.push(originalUrl);

            // Crop B (Detail): Left-weighted (interior), pushes forward into detail
            expandedMetadata.push({
              ...meta,
              url: cropResult.leftUrl,
              seed: cropResult.seed,
              motionBias: "push-forward",
            });
            expandedImageUrls.push(originalUrl);
            console.log(`Living room: windows on right → slide-left (orbit away from windows)`);
          } else {
            // Default: windows on left or no window detected
            // Crop A (Anchor): Left-weighted, slides right (away from window if present)
            expandedMetadata.push({
              ...meta,
              url: cropResult.leftUrl,
              seed: cropResult.seed,
              motionBias: "slide-right",
            });
            expandedImageUrls.push(originalUrl);

            // Crop B (Detail): Right-weighted, pushes forward
            expandedMetadata.push({
              ...meta,
              url: cropResult.rightUrl,
              seed: cropResult.seed,
              motionBias: "push-forward",
            });
            expandedImageUrls.push(originalUrl);
            if (isLivingRoom && windowPos === "left") {
              console.log(`Living room: windows on left → slide-right (orbit away from windows)`);
            }
          }
        } else {
          // Portrait/square or crop failed — pass through unchanged
          // Spatial data (windowPosition, bedPosition) is preserved for directional override in generate-runway-batch
          expandedMetadata.push(meta);
          expandedImageUrls.push(originalUrl);
        }
      }

      const metadataForRunway = expandedMetadata;
      const finalImageUrls = expandedImageUrls;
      console.log(`Dual-crop expansion: ${baseMetadata.length} images → ${metadataForRunway.length} clips`);

      const runwayResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-runway-batch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          },
          body: JSON.stringify({
            imageMetadata: metadataForRunway,
            propertyAddress: propertyData.address,
          }),
        }
      );

      const runwayData = await runwayResponse.json();

      if (!runwayData.success) {
        throw new Error(runwayData.error || "Failed to start Runway batch generation");
      }

      if (!Array.isArray(runwayData.generations)) {
        throw new Error(`Unexpected response from generate-runway-batch: ${JSON.stringify(runwayData)}`);
      }

      const generations = (runwayData.generations as LumaGeneration[]).filter(
        (g) => g.status === "queued" && g.generationId
      );
      const generationIds = generations.map((g) => g.generationId).filter(Boolean) as string[];

      console.log(`Started ${generations.length} Runway generations`);
      console.log("Generation IDs:", generationIds);

      if (generationIds.length === 0) {
        const failedGenerations = (runwayData.generations as LumaGeneration[]).filter((g) => g.status === "error");
        const errors = failedGenerations.map((g) => g.error).join("; ");
        throw new Error(`No valid Runway generation IDs returned. All ${runwayData.generations?.length ?? 0} submissions failed. Errors: ${errors || "unknown"}`);
      }

      // Save generation context to DB so Dashboard can resume polling if user navigates away
      if (videoRecordId) {
        try {
          const supabaseAdminUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseAdminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabaseAdmin = createClient(supabaseAdminUrl, supabaseAdminKey);

          const clipDurations = metadataForRunway.map(m => m.duration ?? 5);

          await supabaseAdmin
            .from("videos")
            .update({
              photos: JSON.stringify({
                generationIds,
                provider: "runway",
                audioUrl,
                musicUrl,
                clipDurations,
                agentInfo: agentInfo || null,
                propertyData: propertyData,
                style: style,
                imageUrls: finalImageUrls,  // Expanded for hybrid fallback recovery
              }),
            })
            .eq("id", videoRecordId);

          console.log("Saved Runway generation context to DB for recovery");
        } catch (err) {
          console.error("Failed to save generation context:", err);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          provider: "runway",
          videoId: videoRecordId,
          generationIds: generationIds,
          totalClips: generationIds.length,
          estimatedDuration: expectedDuration,
          estimatedTime: generationIds.length * 60,
          message: `Started ${generationIds.length} Runway Gen-3a generations. Poll video-status to track progress.`,
          audioUrl: audioUrl,
          musicUrl: musicUrl,
          agentInfo: agentInfo,
          propertyData: propertyData,
          style: style,
          imageUrls: finalImageUrls,  // Expanded array for hybrid fallback
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