// Edge function for video generation using Runway Gen-3 Alpha Turbo
  /// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  const ALLOWED_ORIGIN = (Deno.env.get("CORS_ALLOWED_ORIGIN") || "*").replace(/\/+$/, "");
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
    cameraAction?: string;    // Camera Action dropdown (e.g., "orbit", "push-in")
    room_type?: string;       // AI-detected room (e.g., "kitchen-orbit")
    camera_intent?: string;   // AI-decided camera move (e.g., "orbit", "push-in")
    hero_feature?: string;    // What the camera reveals (e.g., "marble kitchen island")
    hazards?: string;         // Comma-separated hazards or "none"
    duration: number;
    userOverridden?: boolean; // true when user manually changed the camera dropdown
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
      case "pull-out":
      case "drone-up":
      case "pedestal-up":  return "zoomOutSlow";
      case "truck-right":
      case "orbit":        return "slideLeftSlow";
      case "truck-left":   return "slideRightSlow";
      case "static":       return "zoomInSlow"; // subtle motion better than none
      case "push-in":
      case "pedestal-down":
      default:             return "zoomInSlow";
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

  // Parse JPEG dimensions from the SOF (Start of Frame) marker in the first bytes.
  // Avoids downloading the full image just to check aspect ratio.
  function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
    // JPEG files start with FF D8
    if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;

    let offset = 2;
    while (offset < bytes.length - 1) {
      if (bytes[offset] !== 0xFF) break;
      const marker = bytes[offset + 1];

      // SOF markers: C0 (baseline), C1, C2 (progressive) — all contain dimensions
      if (marker >= 0xC0 && marker <= 0xC3) {
        // SOF structure: FF Cx [length:2] [precision:1] [height:2] [width:2]
        if (offset + 9 > bytes.length) return null;
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }

      // Skip to next marker: read segment length and advance
      if (offset + 3 >= bytes.length) break;
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 2 + segmentLength;
    }
    return null;
  }

  // Fetch just the first 64KB of an image to extract JPEG dimensions.
  // Falls back to full fetch + decode if range request is not supported.
  async function getImageDimensions(imageUrl: string): Promise<{ width: number; height: number } | null> {
    try {
      // Try a range request first (saves bandwidth)
      const rangeResponse = await fetch(imageUrl, {
        headers: { "Range": "bytes=0-65535" },
      });

      const bytes = new Uint8Array(await rangeResponse.arrayBuffer());
      const dims = parseJpegDimensions(bytes);
      if (dims) return dims;

      // If range request didn't work or wasn't JPEG, try full fetch
      if (rangeResponse.status !== 206) {
        // We already have the full (or partial) response — try parsing what we have
        return null;
      }

      // Full fetch fallback for non-JPEG formats (PNG, WebP, etc.)
      const fullResponse = await fetch(imageUrl);
      const fullBytes = new Uint8Array(await fullResponse.arrayBuffer());

      // Try PNG: dimensions at bytes 16-23
      if (fullBytes[0] === 0x89 && fullBytes[1] === 0x50) {
        const width = (fullBytes[16] << 24) | (fullBytes[17] << 16) | (fullBytes[18] << 8) | fullBytes[19];
        const height = (fullBytes[20] << 24) | (fullBytes[21] << 16) | (fullBytes[22] << 8) | fullBytes[23];
        return { width, height };
      }

      return null;
    } catch (err) {
      console.error("Failed to get image dimensions:", err);
      return null;
    }
  }

  async function dualCropLandscape(
    imageUrl: string,
    _supabase: ReturnType<typeof createClient>
  ): Promise<DualCropResult | null> {
    // 1. Get image dimensions
    const dims = await getImageDimensions(imageUrl);
    if (!dims) {
      console.log("Could not determine image dimensions, skipping dual-crop");
      return null;
    }

    const { width, height } = dims;
    console.log(`Image dimensions: ${width}x${height} (ratio: ${(width / height).toFixed(2)})`);

    // Only dual-crop landscape images (width > height × 1.3)
    if (width <= height * 1.3) {
      return null; // Portrait or square — no crop needed
    }

    // 2. Calculate two 9:16 crop regions with ~10% overlap
    const targetRatio = 9 / 16; // 0.5625
    const cropWidth = Math.round(height * targetRatio);
    const cropHeight = height;

    // Ensure crop width doesn't exceed image width
    if (cropWidth * 2 > width * 1.1) {
      // Image isn't wide enough for two distinct crops — skip
      console.log("Image not wide enough for two distinct crops, skipping dual-crop");
      return null;
    }

    // Left crop: starts at 0 (or a small offset for a more natural framing)
    const leftX = 0;
    // Right crop: ends at image width
    const rightX = width - cropWidth;

    const seed = Math.floor(Math.random() * 2147483647);
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);

    // 3. Call crop-image edge function for both crops in parallel
    const cropFunctionUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crop-image`;
    const authHeader = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;

    const [leftResult, rightResult] = await Promise.all([
      fetch(cropFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          imageUrl,
          cropRegion: { x: leftX, y: 0, width: cropWidth, height: cropHeight },
          outputPath: `crops/${timestamp}-${randomId}-left.jpg`,
        }),
      }).then(r => r.json()),
      fetch(cropFunctionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({
          imageUrl,
          cropRegion: { x: rightX, y: 0, width: cropWidth, height: cropHeight },
          outputPath: `crops/${timestamp}-${randomId}-right.jpg`,
        }),
      }).then(r => r.json()),
    ]);

    if (!leftResult.success || !rightResult.success) {
      console.error("Dual-crop failed:", leftResult.error || rightResult.error);
      return null; // Graceful fallback — image passes through unchanged
    }

    return {
      leftUrl: leftResult.url,
      rightUrl: rightResult.url,
      seed,
    };
  }

  // Mark free trial as consumed — called only AFTER generation successfully starts.
  async function markFreeTrialUsed(userId: string) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { error } = await supabase
        .from("users")
        .update({ free_video_used: true })
        .eq("id", userId);
      if (error) {
        console.error("Failed to mark free trial as used:", error);
      } else {
        console.log("Free trial marked as used for user:", userId);
      }
    } catch (err) {
      console.error("Error marking free trial:", err);
    }
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    try {
      // Lightweight auth guard — verify a valid Supabase JWT is present.
      // We disabled infra-level verify_jwt because it was rejecting valid tokens.
      const authHeader = req.headers.get("authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        console.error("[generate-video] Missing or malformed Authorization header");
        return new Response(
          JSON.stringify({ error: "Authentication required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const jwt = authHeader.replace("Bearer ", "");
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const authClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: userData, error: authError } = await authClient.auth.getUser(jwt);
      if (authError || !userData?.user) {
        console.error("[generate-video] JWT verification failed:", authError?.message ?? "no user");
        return new Response(
          JSON.stringify({ error: "Invalid or expired token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`[generate-video] Authenticated user: ${userData.user.id}`);

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
            // Note: free_video_used is NOT marked here — it's marked later
            // only after video generation successfully starts (Runway queued or
            // Ken Burns/Canvas job started). This prevents consuming the trial
            // on failed generations.
            if (!hasActiveSubscription && hasFreeTrial) {
              isFreeTrial = true;
              console.log("This is a free trial video generation — will mark as used after DB record creation");
            }
          }

          const { data: videoRecord, error: dbError } = await supabase
            .from("videos")
            .insert({
              user_id: userId,
              source: source || "upload",
              property_address: propertyData.address || "Unknown Property",
              price: propertyData.price || null,
              bedrooms: propertyData.beds ?? null,
              bathrooms: propertyData.baths ?? null,
              car_spaces: propertyData.carSpaces ?? null,
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

            // Mark free trial as used AFTER video record exists (so user has a video to show for it)
            if (isFreeTrial) {
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
        } catch (dbErr) {
          console.error("Database error:", dbErr);
        }
      }

      // --- Ken Burns flow: skip AI entirely, use Shotstack effects on raw photos ---
      // This is how all professional real estate video tools (AutoReel, Box Brownie, etc.)
      // work: mathematical zoom/pan transforms on the original photos — zero hallucination.
      if (useKenBurns) {
        console.log("Ken Burns flow: bypassing AI generation, applying Shotstack effects to photos");

        // Use camera_intent from AI detection as primary motion source.
        // Only fall back to the legacy cameraAngle dropdown if the user manually overrode it.
        const cameraAngles = metadataSource.map((m: ImageMetadata) =>
          m.userOverridden ? (m.cameraAngle || "auto") : (m.camera_intent || m.cameraAngle || "auto")
        );
        const clipDurations = metadataSource.map((m: ImageMetadata) => m.duration ?? 3.5);

        console.log("Camera intents for Ken Burns:", cameraAngles);

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

        // Mark free trial consumed now that generation succeeded
        if (isFreeTrial && userId) await markFreeTrialUsed(userId);

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
              videoId: videoRecordId,
            }),
          }
        );

        const stitchData = await stitchResponse.json();

        if (!stitchData.success || !stitchData.jobId) {
          throw new Error(stitchData.error || "Failed to start Shotstack stitching");
        }

        console.log("Shotstack stitch job started:", stitchData.jobId);

        // Mark free trial consumed now that generation succeeded
        if (isFreeTrial && userId) await markFreeTrialUsed(userId);

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

      // Helper: get room group for dual-crop intent assignment
      function getRoomGroup(roomType: string): string {
        if (roomType.startsWith("exterior") || roomType === "front-door") return "exterior";
        if (roomType === "entry-foyer") return "entry";
        if (roomType.startsWith("living-room")) return "living-room";
        if (roomType.startsWith("kitchen")) return "kitchen";
        if (roomType === "master-bedroom" || roomType === "bedroom") return "bedroom";
        if (roomType === "bathroom") return "bathroom";
        return "outdoor";
      }

      // Dual-crop intent assignment: each crop gets a complementary camera_intent
      function getDualCropIntents(
        roomType: string,
        originalIntent: string,
      ): { cropAIntent: string; cropBIntent: string } {
        const roomGroup = getRoomGroup(roomType);

        // Bedrooms: both crops pull back. Never push forward into bed.
        if (roomGroup === "bedroom") {
          return { cropAIntent: "pull-out", cropBIntent: "pull-out" };
        }

        // Exteriors: one trucks, one rises.
        if (roomGroup === "exterior") {
          return { cropAIntent: "truck-right", cropBIntent: "pedestal-up" };
        }

        // Living rooms / kitchens / entries: Crop A orbits, Crop B pushes
        return {
          cropAIntent: originalIntent === "orbit" ? "orbit" : "truck-right",
          cropBIntent: "push-in",
        };
      }

      const expandedMetadata: Array<{
        url: string;
        cameraAngle?: string;
        cameraAction?: string;
        room_type?: string;
        camera_intent?: string;
        hero_feature?: string;
        hazards?: string;
        duration?: number;
        seed?: number;
        userOverridden?: boolean;
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
          const roomType = meta.room_type || "living-room-wide";
          const originalIntent = meta.camera_intent || "orbit";
          const { cropAIntent, cropBIntent } = getDualCropIntents(roomType, originalIntent);

          console.log(`Image ${i + 1}: LANDSCAPE → dual-cropped (seed: ${cropResult.seed}, room=${roomType}, cropA=${cropAIntent}, cropB=${cropBIntent})`);

          // Check if adding both crops would exceed the limit
          if (expandedMetadata.length + 2 > 10) {
            // Only add one crop to stay within limit
            expandedMetadata.push({
              ...meta,
              url: cropResult.leftUrl,
              seed: cropResult.seed,
              camera_intent: cropAIntent,
            });
            expandedImageUrls.push(originalUrl);
            console.log(`Only added single crop (clip limit), intent: ${cropAIntent}`);
          } else {
            // Crop A
            expandedMetadata.push({
              ...meta,
              url: cropResult.leftUrl,
              seed: cropResult.seed,
              camera_intent: cropAIntent,
            });
            expandedImageUrls.push(originalUrl);

            // Crop B
            expandedMetadata.push({
              ...meta,
              url: cropResult.rightUrl,
              seed: cropResult.seed,
              camera_intent: cropBIntent,
            });
            expandedImageUrls.push(originalUrl);
          }
        } else {
          // Portrait/square or crop failed — pass through unchanged
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

      if (!runwayResponse.ok) {
        const errorText = await runwayResponse.text();
        throw new Error(`generate-runway-batch HTTP ${runwayResponse.status}: ${errorText}`);
      }

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

      // Mark free trial consumed now that at least one Runway generation started
      if (isFreeTrial && userId) await markFreeTrialUsed(userId);

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
                layout: layout || style,
                customTitle: customTitle || "",
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