// Edge function for video generation using Luma AI completely
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
    voice: string;
    music: string;
    userId?: string;
    propertyId?: string;
    script?: string;
    agentInfo?: {
      name: string;
      phone: string;
      email: string;
      photo: string | null;
    };
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
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { imageUrls, propertyData, style, voice, music, userId, propertyId, script, agentInfo }: GenerateVideoRequest = await req.json();

      console.log("=== LUMA AI VIDEO GENERATION ===");
      console.log("Total images:", imageUrls?.length || 0);
      console.log("Property:", propertyData?.address);

      if (!imageUrls || imageUrls.length < 3) {
        return new Response(
          JSON.stringify({ error: "Need at least 3 images for video generation (15 seconds minimum)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (imageUrls.length > 6) {
        return new Response(
          JSON.stringify({ error: "Maximum 6 images allowed for 15-30 second video (5 seconds per clip)" }),
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

      const expectedDuration = imageUrls.length * 5;
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
              property_id: propertyId || null,
              provider: "luma",
              template: style,
              voice_id: voice,
              music_id: music,
              aspect_ratio: "9:16",
              script: script || propertyData.description,
              status: "queued",
              progress: 0,
              duration: expectedDuration,
              agent_name: agentInfo?.name || null,
              agent_phone: agentInfo?.phone || null,
              agent_email: agentInfo?.email || null,
              is_free_trial: isFreeTrial,
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

      console.log("Starting Luma batch generation for", imageUrls.length, "images...");

      // Prepare image metadata (use provided metadata or create default)
      const metadataForLuma = imageMetadata || imageUrls.map(url => ({
        url,
        cameraAngle: "auto",
        duration: 3.5
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

      const generations = (lumaData.generations as LumaGeneration[]).filter((g) => g.status === "queued");
      const generationIds = generations.map((g) => g.generationId);

      console.log(`Started ${generations.length} Luma generations`);
      console.log("Generation IDs:", generationIds);

      return new Response(
        JSON.stringify({
          success: true,
          provider: "luma",
          videoId: videoRecordId,
          generationIds: generationIds,
          totalClips: generationIds.length,
          estimatedDuration: expectedDuration,
          estimatedTime: generationIds.length * 45,
          message: `Started ${generationIds.length} Luma AI generations. Use check-luma-batch to poll status.`,
          audioUrl: audioUrl,
          musicUrl: musicUrl,
          agentInfo: agentInfo,
          propertyData: propertyData,
          style: style, // Pass template style for video overlays
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