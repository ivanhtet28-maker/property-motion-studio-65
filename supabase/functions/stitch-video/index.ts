/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");

  // Template name mapping
  const TEMPLATE_NAMES: Record<string, string> = {
    "modern-luxe": "Modern Luxe",
    "just-listed": "Just Listed",
    "minimalist": "Minimalist",
    "cinematic": "Cinematic",
    "luxury": "Luxury",
    "real-estate-pro": "Real Estate Pro",
  };

  // Helper function to upload base64 image to Supabase Storage
  async function uploadBase64ToStorage(
    base64Data: string,
    fileName: string,
    folder: string
  ): Promise<string | null> {
    try {
      console.log("Starting image upload...");
      console.log("Base64 data length:", base64Data.length);

      // Detect content type from base64 prefix
      let contentType = "image/png";
      if (base64Data.includes("data:image/jpeg") || base64Data.includes("data:image/jpg")) {
        contentType = "image/jpeg";
      } else if (base64Data.includes("data:image/png")) {
        contentType = "image/png";
      } else if (base64Data.includes("data:image/webp")) {
        contentType = "image/webp";
      }

      console.log("Detected content type:", contentType);

      // Remove data:image/xxx;base64, prefix if present
      const base64Content = base64Data.includes(",")
        ? base64Data.split(",")[1]
        : base64Data;

      console.log("Base64 content length after split:", base64Content.length);

      // Convert base64 to Uint8Array
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log("Converted to bytes, length:", bytes.length);

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const filePath = `${folder}/${fileName}`;

      console.log("Uploading to path:", filePath);

      const { error: uploadError } = await supabase.storage
        .from("video-assets")
        .upload(filePath, bytes, {
          contentType: contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("video-assets")
        .getPublicUrl(filePath);

      console.log("Upload successful, URL:", urlData.publicUrl);

      // Verify the image is accessible
      try {
        const verifyResponse = await fetch(urlData.publicUrl, { method: "HEAD" });
        console.log("Image verification status:", verifyResponse.status);
        console.log("Image content-type:", verifyResponse.headers.get("content-type"));
        console.log("Image content-length:", verifyResponse.headers.get("content-length"));
      } catch (verifyErr) {
        console.error("Failed to verify uploaded image:", verifyErr);
      }

      return urlData.publicUrl;
    } catch (err) {
      console.error("Failed to upload base64 image:", err);
      return null;
    }
  }

  interface StitchVideoRequest {
    videoUrls: string[];
    clipDurations?: number[]; // Array of durations for each clip
    propertyData: {
      address: string;
      streetAddress?: string;
      suburb?: string;
      state?: string;
      price: string;
      beds: number;
      baths: number;
      carSpaces?: number;
      landSize?: string;
      features?: string[];
      description?: string;
    };
    audioUrl?: string;
    musicUrl?: string;
    agentInfo?: {
      name: string;
      phone: string;
      email: string;
      photo?: string | null;
    };
    style?: string;
    videoId?: string;
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    try {
      const { videoUrls, clipDurations, propertyData, audioUrl, musicUrl, agentInfo, style, videoId }: StitchVideoRequest = await req.json();

      if (!videoUrls || videoUrls.length === 0) {
        throw new Error("No video URLs provided for stitching");
      }

      console.log("=== SHOTSTACK VIDEO STITCHING ===");
      console.log("Stitching", videoUrls.length, "Luma AI clips");
      console.log("Property Data Received:", JSON.stringify(propertyData, null, 2));
      console.log("Agent Info Received:", agentInfo ? {
        name: agentInfo.name,
        phone: agentInfo.phone,
        email: agentInfo.email,
        hasPhoto: !!agentInfo.photo,
        photoLength: agentInfo.photo ? agentInfo.photo.length : 0
      } : "No agent info");

      // Upload agent photo to storage if provided (to avoid payload size issues)
      let agentPhotoUrl: string | null = null;
      if (agentInfo?.photo) {
        console.log("Agent photo data type:", typeof agentInfo.photo);
        console.log("Agent photo starts with:", agentInfo.photo.substring(0, 50));
        console.log("Uploading agent photo to storage...");

        // Detect file extension from base64 prefix
        let extension = "png";
        if (agentInfo.photo.includes("data:image/jpeg") || agentInfo.photo.includes("data:image/jpg")) {
          extension = "jpg";
        } else if (agentInfo.photo.includes("data:image/webp")) {
          extension = "webp";
        }

        const fileName = `agent-${videoId || Date.now()}.${extension}`;
        console.log("Using filename:", fileName);
        agentPhotoUrl = await uploadBase64ToStorage(agentInfo.photo, fileName, "agent-photos");
        console.log("Agent photo URL:", agentPhotoUrl);
      } else {
        console.log("No agent photo provided in agentInfo");
      }

      // Use provided clip durations or default to 5 seconds each
      const durations = clipDurations || videoUrls.map(() => 5);

      // Calculate total duration
      const videoClipsDuration = durations.reduce((sum, duration) => sum + duration, 0);
      const agentCardDuration = (agentInfo && agentInfo.name) ? durations[0] : 0; // Match first clip duration
      const totalDuration = videoClipsDuration + agentCardDuration;

      console.log("Clip durations:", durations);
      console.log("Video clips duration:", videoClipsDuration);
      console.log("Total duration:", totalDuration);

      // Build video track with all Luma clips in sequence
      let currentStart = 0;
      const videoClips = videoUrls.map((url, index) => {
        const clipDuration = durations[index];
        const clip = {
          asset: {
            type: "video",
            src: url,
          },
          start: currentStart,
          length: clipDuration,
          // Reduce opacity on first clip to make text more visible
          opacity: index === 0 ? 0.7 : 1.0,
          transition: index > 0 ? {
            in: "fade",
            out: "fade",
          } : undefined,
        };
        currentStart += clipDuration;
        return clip;
      });

      // Build Shotstack edit
      const edit = {
        timeline: {
          soundtrack: musicUrl ? {
            src: musicUrl,
            effect: "fadeInFadeOut",
            volume: 0.3,
          } : undefined,
          tracks: [
            // Voiceover track (Track 0)
            ...(audioUrl ? [{
              clips: [
                {
                  asset: {
                    type: "audio",
                    src: audioUrl,
                    volume: 1.0,
                  },
                  start: 0,
                  length: totalDuration, // Extended to include agent outro
                },
              ],
            }] : []),

            // Agent photo - Track 1 (TOP - separate image asset, Shotstack HTML doesn't support images)
            ...(agentInfo?.photo ? [{
              clips: [
                // Circular luma matte (must come first) - BIGGER MASK
                {
                  asset: {
                    type: "luma",
                    src: "https://shotstack-assets.s3-ap-southeast-2.amazonaws.com/luma-mattes/static/circle-sd.jpg",
                  },
                  start: videoClipsDuration + 0.1,
                  length: agentCardDuration - 0.1,
                  position: "top",
                  offset: {
                    y: -0.22,
                  },
                  scale: 0.149,
                  crop: {
                    top: 0.22, // Crop top and bottom to create square aspect ratio
                    bottom: 0.22,
                    left: 0,
                    right: 0
                  }
                },
                // Agent photo (masked by luma matte above) - SAME SIZE
                {
                  asset: {
                    type: "image",
                    src: agentPhotoUrl || agentInfo.photo, // Use storage URL if available, fallback to base64
                  },
                  start: videoClipsDuration + 0.1,
                  length: agentCardDuration - 0.1,
                  position: "top",
                  offset: {
                    y: -0.22,
                  },
                  scale: 0.149, // Keep photo at same size
                  // No fit parameter - use default crop behavior
                },
              ],
            }] : []),

            // Agent text details - Track 2 (HTML for text only, no images)
            ...(agentInfo && agentInfo.name ? [{
              clips: [
                {
                  asset: {
                    type: "html",
                    html: `
                      <div style="
                        width: 100%;
                        height: 100%;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        text-align: center;
                        font-family: Arial, sans-serif;
                        color: white;
                        padding-top: 100px;
                      ">
                        <div style="font-size: 42px; font-weight: 700; margin-bottom: 15px; letter-spacing: 1px; text-shadow: 3px 3px 6px rgba(0,0,0,1);">${agentInfo.name}</div>
                        ${agentInfo.phone ? `<div style="font-size: 38px; margin-bottom: 10px; font-weight: 600; text-shadow: 3px 3px 6px rgba(0,0,0,1);">${agentInfo.phone}</div>` : ''}
                        ${agentInfo.email ? `<div style="font-size: 38px; font-weight: 600; text-shadow: 3px 3px 6px rgba(0,0,0,1);">${agentInfo.email}</div>` : ''}
                        <div style="margin-top: 40px; font-size: 42px; font-weight: 700; letter-spacing: 2px; text-shadow: 3px 3px 6px rgba(0,0,0,1);">CONTACT ME TODAY</div>
                      </div>
                    `,
                    css: "",
                    width: 1080,
                    height: 1920,
                  },
                  start: videoClipsDuration + 0.1,
                  length: agentCardDuration - 0.1,
                },
              ],
            }] : []),

            // Property details HTML overlay (Track 2)
            {
              clips: [
                {
                  asset: {
                    type: "html",
                    html: `
                      <div style="
                        width: 100%;
                        height: 100%;
                        display: flex;
                        flex-direction: column;
                        padding-top: 80px;
                        text-align: center;
                        font-family: Arial, sans-serif;
                        color: white;
                      ">
                        ${style && TEMPLATE_NAMES[style] ? `<div style="font-size: 52px; font-weight: 900; margin-bottom: 28px; text-shadow: 3px 3px 6px rgba(0,0,0,1); color: white;">${TEMPLATE_NAMES[style]}</div>` : ''}
                        ${propertyData.streetAddress && propertyData.suburb && propertyData.state ? `
                          <div style="font-size: 28px; font-weight: 700; margin-bottom: 22px; text-shadow: 3px 3px 6px rgba(0,0,0,1); color: white;">${propertyData.streetAddress}, ${propertyData.suburb}, ${propertyData.state}</div>
                        ` : `
                          <div style="font-size: 28px; font-weight: 700; margin-bottom: 22px; text-shadow: 3px 3px 6px rgba(0,0,0,1); color: white;">${propertyData.address}</div>
                        `}
                        <div style="font-size: 38px; font-weight: 900; margin-bottom: 18px; text-shadow: 3px 3px 6px rgba(0,0,0,1); color: white;">$${propertyData.price}</div>
                        <div style="font-size: 32px; line-height: 1.7; text-shadow: 3px 3px 6px rgba(0,0,0,1); font-weight: 600; color: white;">
                          <div>${propertyData.beds} Bedroom${propertyData.beds !== 1 ? 's' : ''} | ${propertyData.baths} Bathroom${propertyData.baths !== 1 ? 's' : ''}</div>
                          <div>${propertyData.carSpaces ? `${propertyData.carSpaces} Car Space${propertyData.carSpaces !== 1 ? 's' : ''}` : ''}${propertyData.carSpaces && propertyData.landSize ? ' | ' : ''}${propertyData.landSize ? `${propertyData.landSize}m² Land Size` : ''}</div>
                        </div>
                      </div>
                    `,
                    css: "",
                    width: 1080,
                    height: 1920,
                  },
                  start: 0.1,
                  length: durations[0] - 0.1, // Match first clip duration (minus 0.1s offset)
                },
              ],
            },

            // Agent outro background - First clip blurred (Track 3)
            ...(agentInfo && agentInfo.name ? [{
              clips: [
                {
                  asset: {
                    type: "video",
                    src: videoUrls[0], // Use first Luma clip
                  },
                  start: videoClipsDuration,
                  length: agentCardDuration,
                  filter: "blur",
                },
              ],
            }] : []),

            // Main video clips track (Track 4 - AT BOTTOM)
            {
              clips: videoClips,
            },
          ],
        },
        output: {
          format: "mp4",
          resolution: "hd",
          aspectRatio: "9:16",
        },
      };

      console.log("Sending stitch job to Shotstack...");
      if (propertyData.streetAddress && propertyData.suburb && propertyData.state) {
        console.log("Property Address Line 1:", `${propertyData.streetAddress},`);
        console.log("Property Address Line 2:", `${propertyData.suburb}, ${propertyData.state}`);
      } else {
        console.log("Property Address Text:", propertyData.address);
      }
      console.log("Property Specs Text:", `${propertyData.beds} BED • ${propertyData.baths} BATH${propertyData.carSpaces ? ` • ${propertyData.carSpaces} CAR` : ""}${propertyData.landSize ? ` • ${propertyData.landSize}m²` : ""}`);
      console.log("Edit payload tracks count:", edit.timeline.tracks.length);
      console.log("Full Shotstack edit payload:", JSON.stringify(edit, null, 2));

      // Submit to Shotstack
      const response = await fetch("https://api.shotstack.io/v1/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SHOTSTACK_API_KEY!,
        },
        body: JSON.stringify(edit),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Shotstack API error: ${error}`);
      }

      const data = await response.json();
      const jobId = data.response?.id;

      if (!jobId) {
        throw new Error("No job ID returned from Shotstack");
      }

      console.log("Shotstack stitch job started:", jobId);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: jobId,
          message: "Video stitching started with Shotstack",
          estimatedTime: 60,
          totalClips: videoUrls.length,
          duration: totalDuration,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error stitching video:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Failed to stitch video",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  });
