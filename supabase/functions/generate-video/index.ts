// Edge function for video generation using Runway Gen4 Turbo
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
    cameraAction?: string;    // User's chosen camera motion (e.g., "orbit", "push-in")
    duration: number;
    isLandscape?: boolean;    // true if image width > height
  }

  interface GenerateVideoRequest {
    imageUrls: string[];
    imageMetadata?: ImageMetadata[];
    propertyData: PropertyData;
    style: string;
    layout?: string;
    customTitle?: string;
    detailsText?: string;
    voice: string;
    music: string;
    customMusicUrl?: string;   // Direct URL to user-uploaded audio
    musicTrimStart?: number;   // Trim start in seconds
    musicTrimEnd?: number;     // Trim end in seconds
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
      case "crane-up":     return "zoomOutSlow";
      case "tracking":
      case "orbit":        return "slideLeftSlow";
      case "static":       return "none"; // locked shot — no Ken Burns effect
      case "push-in":
      default:             return "zoomInSlow";
    }
  }

  // Music library mapping — filenames match Supabase Storage: video-assets/music/
    const MUSIC_BASE = "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music";
    const MUSIC_LIBRARY: Record<string, string> = {
      // Cinematic
      "cinematic-epic-1": `${MUSIC_BASE}/cinematic-epic-1`,
      "cinematic-epic-2": `${MUSIC_BASE}/cinematic-epic-2`,
      "cinematic-epic-3": `${MUSIC_BASE}/cinematic-epic-3`,
      "luxury-1": `${MUSIC_BASE}/${encodeURIComponent("Luxury 1.mp3")}`,
      // Modern
      "modern-chill-1": `${MUSIC_BASE}/modern-chill-1`,
      "modern-chill-2": `${MUSIC_BASE}/modern-chill-2`,
      "lofi-2": `${MUSIC_BASE}/${encodeURIComponent("Lofi 2 .mp3")}`,
      // Energetic
      "upbeat-energetic-3": `${MUSIC_BASE}/upbeat-energetic-3.mp3`,
      "upbeat-1": `${MUSIC_BASE}/${encodeURIComponent("Upbeat 1 .mp3")}`,
      // Classical
      "classical-elegant-1": `${MUSIC_BASE}/classical-elegant-1`,
      "classical-elegant-2": `${MUSIC_BASE}/classical-elegant-2`,
      // Ambient
      "ambient-relaxing-1": `${MUSIC_BASE}/ambient-relaxing-1`,
      "ambient-relaxing-2": `${MUSIC_BASE}/ambient-relaxing-2`,
      // Legacy IDs (backwards compatibility with old video records)
      "cinematic-1": `${MUSIC_BASE}/cinematic-epic-1`,
      "cinematic-2": `${MUSIC_BASE}/cinematic-epic-2`,
      "cinematic-3": `${MUSIC_BASE}/cinematic-epic-3`,
      "modern-1": `${MUSIC_BASE}/modern-chill-1`,
      "modern-2": `${MUSIC_BASE}/modern-chill-2`,
      "energetic-3": `${MUSIC_BASE}/upbeat-energetic-3.mp3`,
      "classical-1": `${MUSIC_BASE}/classical-elegant-1`,
      "classical-2": `${MUSIC_BASE}/classical-elegant-2`,
      "ambient-1": `${MUSIC_BASE}/ambient-relaxing-1`,
      "ambient-2": `${MUSIC_BASE}/ambient-relaxing-2`,
    };

  const getMusicUrl = (musicId: string): string | null => {
    return MUSIC_LIBRARY[musicId] || null;
  };

  // ── Shotstack Create API (image-to-video) — inlined to bypass Supabase gateway ──
  // Internal edge-function-to-function calls via the Supabase gateway fail with 401
  // even when verify_jwt=false is set in config.toml (deployment doesn't always apply).
  // Calling the Shotstack API directly from here eliminates the gateway dependency.
  const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");
  const SHOTSTACK_CREATE_URL = "https://api.shotstack.io/create/v1/assets";

  interface MotionConfig {
    motion: number;
    guidanceScale: number;
  }

  const MOTION_MAP: Record<string, MotionConfig> = {
    "push-in":  { motion: 140, guidanceScale: 1.8 },
    "pull-out": { motion: 140, guidanceScale: 1.8 },
    "tracking": { motion: 160, guidanceScale: 1.8 },
    "orbit":    { motion: 180, guidanceScale: 1.6 },
    "crane-up": { motion: 150, guidanceScale: 1.8 },
    "drone-up": { motion: 170, guidanceScale: 1.6 },
    "static":   { motion: 40,  guidanceScale: 2.0 },
  };

  const DEFAULT_MOTION: MotionConfig = { motion: 127, guidanceScale: 1.8 };

  function getMotionConfig(cameraAction?: string): MotionConfig {
    if (!cameraAction) return DEFAULT_MOTION;
    return MOTION_MAP[cameraAction] || DEFAULT_MOTION;
  }

  interface LumaGeneration {
    imageUrl: string;
    generationId: string;
    status: "queued" | "error";
    error?: string;
  }

  // ── Re-upload external images to Supabase Storage ──────────────────────────
  // Scraped images (images-only mode) are raw CDN URLs from reastatic.net,
  // domainstatic.com.au, etc. These may be blocked by Runway (hotlink
  // protection, geo-blocking, token expiry). Re-uploading to Supabase Storage
  // gives Runway a reliable, always-accessible URL.
  const SUPABASE_STORAGE_HOST = Deno.env.get("SUPABASE_URL")?.replace("https://", "") || "";

  async function ensureStorageUrls(urls: string[]): Promise<string[]> {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: string[] = [];
    const folder = `scraped-${Date.now()}`;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      // Already in Supabase Storage — skip
      if (url.includes(SUPABASE_STORAGE_HOST)) {
        results.push(url);
        continue;
      }

      // External URL — download and re-upload
      try {
        console.log(`Re-uploading external image ${i + 1}/${urls.length}: ${url.substring(0, 80)}...`);
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "image/*,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          console.warn(`Failed to fetch external image ${i + 1}: HTTP ${response.status}`);
          results.push(url); // Keep original URL as fallback
          continue;
        }

        const blob = await response.blob();
        const contentType = blob.type || "image/jpeg";
        const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
        const filePath = `${folder}/image-${i + 1}.${ext}`;

        const bytes = new Uint8Array(await blob.arrayBuffer());
        const { error: uploadError } = await supabase.storage
          .from("video-assets")
          .upload(filePath, bytes, { contentType, upsert: true });

        if (uploadError) {
          console.warn(`Upload failed for image ${i + 1}:`, uploadError.message);
          results.push(url); // Keep original URL as fallback
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("video-assets")
          .getPublicUrl(filePath);

        console.log(`Image ${i + 1} re-uploaded: ${urlData.publicUrl.substring(0, 80)}...`);
        results.push(urlData.publicUrl);
      } catch (err) {
        console.warn(`Error re-uploading image ${i + 1}:`, err instanceof Error ? err.message : err);
        results.push(url); // Keep original URL as fallback
      }
    }

    const reUploaded = results.filter((r, i) => r !== urls[i]).length;
    console.log(`Image URL check: ${reUploaded} re-uploaded to Storage, ${urls.length - reUploaded} already accessible`);
    return results;
  }

  // Mark free trial as consumed — called only AFTER generation successfully starts.
  async function markFreeTrialUsed(userId: string) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const { error } = await supabase
        .from("user_preferences")
        .update({ free_video_used: true })
        .eq("user_id", userId);
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

      const { imageUrls, imageMetadata, propertyData, style, layout, customTitle, detailsText, voice, music, customMusicUrl, musicTrimStart, musicTrimEnd, userId, propertyId, script, source, agentInfo, preGeneratedVideoUrls, useKenBurns }: GenerateVideoRequest = await req.json();

      console.log("=== VIDEO GENERATION ===");
      console.log("Mode:", useKenBurns ? "Ken Burns (Shotstack direct)" : "Shotstack Create API (image-to-video)");
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

      // Calculate expected duration — all Runway clips are 5s, Shotstack hard-cuts at 3.5s
      const metadataSource = imageMetadata || imageUrls.map(url => ({ url, cameraAngle: "auto", duration: 5 }));
      const expectedDuration = metadataSource.length * 3.5; // 3.5s per clip after Shotstack hard-cut
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
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
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
      if (customMusicUrl) {
        musicUrl = customMusicUrl;
        console.log("Using custom uploaded music:", customMusicUrl);
      } else if (music) {
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
              aspect_ratio: "9:16", // DB default — updated by stitch-video based on actual outputFormat
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

        // Use user's chosen camera action as motion source.
        const cameraAngles = metadataSource.map((m: ImageMetadata) =>
          m.cameraAction || m.cameraAngle || "auto"
        );
        const clipDurations = metadataSource.map((m: ImageMetadata) => m.duration ?? 3.5);

        console.log("Camera intents for Ken Burns:", cameraAngles);

        const stitchResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/stitch-video`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
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
              detailsText: detailsText || "",
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
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
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
              detailsText: detailsText || "",
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

      // --- Shotstack Create API flow ---
      // Uses Shotstack's image-to-video (Stable Video Diffusion) for clip generation.
      // Each clip is 4 seconds. Shotstack key is already configured in Supabase secrets.
      console.log("Starting Shotstack Create API batch generation for", imageUrls.length, "images...");

      // Ensure all images are accessible (re-upload external CDN URLs to Storage)
      const reliableImageUrls = await ensureStorageUrls(imageUrls.slice(0, 10));

      // Pre-crop landscape images to 9:16 portrait so Shotstack's SVD model
      // generates portrait clips instead of landscape ones that get squeezed.
      console.log("Pre-cropping images to 9:16 portrait for Shotstack...");
      const portraitImageUrls = await Promise.all(
        reliableImageUrls.map(async (url, index) => {
          try {
            const cropResponse = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/smart-crop-portrait`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ imageUrl: url }),
              }
            );
            if (cropResponse.ok) {
              const cropData = await cropResponse.json();
              if (cropData.url) {
                console.log(`Image ${index + 1}: ${cropData.cropped ? "cropped to 9:16" : "already portrait"}`);
                return cropData.url;
              }
            }
            console.warn(`Image ${index + 1}: crop failed, using original`);
            return url;
          } catch (err) {
            console.warn(`Image ${index + 1}: crop error, using original:`, err instanceof Error ? err.message : err);
            return url;
          }
        })
      );

      const baseMetadata = imageMetadata || portraitImageUrls.map(url => ({
        url,
        cameraAngle: "auto",
        duration: 4
      }));

      // Update metadata URLs to use cropped portrait versions
      const metadataForShotstack = baseMetadata.slice(0, 10).map((m: ImageMetadata, i: number) => ({
        ...m,
        url: portraitImageUrls[i] || m.url,
      }));
      const finalImageUrls = reliableImageUrls;

      console.log(`Sending ${metadataForShotstack.length} images to Shotstack Create API (direct — bypassing gateway)`);

      if (!SHOTSTACK_API_KEY) {
        throw new Error("SHOTSTACK_API_KEY not configured in Supabase secrets");
      }

      // Call Shotstack Create API directly for each image (parallel)
      const batchResults = await Promise.all(
        metadataForShotstack.map(async (metadata: ImageMetadata, index: number) => {
          const effectiveAction = metadata.cameraAction || metadata.cameraAngle || "push-in";
          const motionConfig = getMotionConfig(effectiveAction);
          console.log(`Clip ${index + 1}/${metadataForShotstack.length}: motion=${motionConfig.motion}, guidance=${motionConfig.guidanceScale}`);

          try {
            const response = await fetch(SHOTSTACK_CREATE_URL, {
              method: "POST",
              headers: {
                "x-api-key": SHOTSTACK_API_KEY!,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                provider: "shotstack",
                options: {
                  type: "image-to-video",
                  imageUrl: metadata.url,
                  motion: motionConfig.motion,
                  guidanceScale: motionConfig.guidanceScale,
                },
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`Shotstack Create API error clip ${index + 1}: ${response.status} ${errorText}`);
              return { imageUrl: metadata.url, generationId: null as string | null, status: "error" as const, error: `Shotstack API ${response.status}: ${errorText}` };
            }

            const data = await response.json();
            const assetId = data.data?.id || data.id;
            console.log(`Clip ${index + 1} started: ${assetId}`);

            if (!assetId) {
              return { imageUrl: metadata.url, generationId: null as string | null, status: "error" as const, error: `No asset ID: ${JSON.stringify(data)}` };
            }

            return { imageUrl: metadata.url, generationId: assetId as string, status: "queued" as const, error: undefined };
          } catch (error) {
            console.error(`Error creating clip ${index + 1}:`, error);
            return { imageUrl: metadata.url, generationId: null as string | null, status: "error" as const, error: error instanceof Error ? error.message : "Unknown error" };
          }
        })
      );

      const generations = batchResults.filter(
        (g): g is typeof g & { generationId: string; status: "queued" } => g.status === "queued" && !!g.generationId
      );
      const generationIds = generations.map((g) => g.generationId);
      const failedCount = batchResults.length - generations.length;

      console.log(`Shotstack batch: ${generations.length} queued, ${failedCount} failed`);
      console.log("Generation IDs:", generationIds);

      if (generationIds.length === 0) {
        const errors = batchResults.filter(g => g.status === "error").map(g => g.error).join("; ");
        throw new Error(`No valid Shotstack generation IDs returned. All ${batchResults.length} submissions failed. Errors: ${errors || "unknown"}`);
      }

      // Mark free trial consumed now that at least one Shotstack generation started
      if (isFreeTrial && userId) await markFreeTrialUsed(userId);

      // Extract camera actions for fallback slots and stitch-video
      const cameraAngles = metadataForShotstack.map((m: ImageMetadata) =>
        m.cameraAction || m.cameraAngle || "push-in"
      );

      // Save generation context to DB so Dashboard can resume polling if user navigates away
      if (videoRecordId) {
        try {
          const supabaseAdminUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseAdminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabaseAdmin = createClient(supabaseAdminUrl, supabaseAdminKey);

          const clipDurations = metadataForShotstack.map((m: ImageMetadata) => m.duration ?? 4);

          await supabaseAdmin
            .from("videos")
            .update({
              photos: JSON.stringify({
                generationIds,
                provider: "shotstack-create",
                audioUrl,
                musicUrl,
                clipDurations,
                cameraAngles,
                agentInfo: agentInfo || null,
                propertyData: propertyData,
                style: style,
                layout: layout || style,
                customTitle: customTitle || "",
                detailsText: detailsText || "",
                imageUrls: finalImageUrls,
              }),
            })
            .eq("id", videoRecordId);

          console.log("Saved Shotstack generation context to DB for recovery");
        } catch (err) {
          console.error("Failed to save generation context:", err);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          provider: "shotstack-create",
          videoId: videoRecordId,
          generationIds: generationIds,
          totalClips: generationIds.length,
          estimatedDuration: expectedDuration,
          estimatedTime: generationIds.length * 20, // ~20s per clip with Shotstack
          message: `Started ${generationIds.length} Shotstack image-to-video generations. Poll video-status to track progress.`,
          audioUrl: audioUrl,
          musicUrl: musicUrl,
          musicTrimStart: musicTrimStart || 0,
          musicTrimEnd: musicTrimEnd || 0,
          agentInfo: agentInfo,
          propertyData: propertyData,
          style: style,
          imageUrls: finalImageUrls,
          cameraAngles: cameraAngles,
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