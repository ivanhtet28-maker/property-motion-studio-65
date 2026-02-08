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
      // Remove data:image/xxx;base64, prefix if present
      const base64Content = base64Data.includes(",")
        ? base64Data.split(",")[1]
        : base64Data;

      // Convert base64 to Uint8Array
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const filePath = `${folder}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("video-assets")
        .upload(filePath, bytes, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("video-assets")
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (err) {
      console.error("Failed to upload base64 image:", err);
      return null;
    }
  }

  interface StitchVideoRequest {
    videoUrls: string[];
    propertyData: {
      address: string;
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
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { videoUrls, propertyData, audioUrl, musicUrl, agentInfo, videoId }: StitchVideoRequest = await req.json();

      if (!videoUrls || videoUrls.length === 0) {
        throw new Error("No video URLs provided for stitching");
      }

      console.log("=== SHOTSTACK VIDEO STITCHING ===");
      console.log("Stitching", videoUrls.length, "Luma AI clips");
      console.log("Property Data Received:", JSON.stringify(propertyData, null, 2));
      console.log("Agent Info Received:", agentInfo ? JSON.stringify(agentInfo, null, 2) : "No agent info");

      // Upload agent photo to storage if provided (to avoid payload size issues)
      let agentPhotoUrl: string | null = null;
      if (agentInfo?.photo) {
        console.log("Uploading agent photo to storage...");
        const fileName = `agent-${videoId || Date.now()}.png`;
        agentPhotoUrl = await uploadBase64ToStorage(agentInfo.photo, fileName, "agent-photos");
        console.log("Agent photo URL:", agentPhotoUrl);
      }

      // Calculate total duration
      const videoClipsDuration = videoUrls.length * 5;
      const agentCardDuration = (agentInfo && agentInfo.name) ? 5 : 0;
      const totalDuration = videoClipsDuration + agentCardDuration;

      // Build video track with all Luma clips in sequence
      const videoClips = videoUrls.map((url, index) => ({
        asset: {
          type: "video",
          src: url,
        },
        start: index * 5,
        length: 5,
        // Reduce opacity on first clip to make text more visible
        opacity: index === 0 ? 0.7 : 1.0,
        transition: index > 0 ? {
          in: "fade",
          out: "fade",
        } : undefined,
      }));

      // Build Shotstack edit
      const edit = {
        timeline: {
          soundtrack: musicUrl ? {
            src: musicUrl,
            effect: "fadeInFadeOut",
            volume: 0.3,
          } : undefined,
          tracks: [
            // Voiceover track - BOTTOM (Track 0)
            ...(audioUrl ? [{
              clips: [
                {
                  asset: {
                    type: "audio",
                    src: audioUrl,
                    volume: 1.0,
                  },
                  start: 0,
                  length: videoClipsDuration,
                },
              ],
            }] : []),

            // Video track (Track 1 or 0 if no audio)
            {
              clips: videoClips,
            },

            // Template title overlay - TOP (Track 2 or 1)
            ...(style && TEMPLATE_NAMES[style] ? [{
              clips: [
                {
                  asset: {
                    type: "title",
                    text: TEMPLATE_NAMES[style],
                    style: "subtitle",
                    color: "#FFFFFF",
                    size: "small",
                    position: "top",
                    offset: {
                      x: 0,
                      y: 0.02,
                    },
                  },
                  start: 0.1,
                  length: 4.9,
                  fit: "none",
                  scale: 1.0,
                },
              ],
            }] : []),

            // Property address overlay (Track 3 or 2)
            {
              clips: [
                {
                  asset: {
                    type: "title",
                    text: propertyData.address,
                    style: "subtitle",
                    color: "#FFFFFF",
                    size: "small",
                    position: "top",
                    offset: {
                      x: 0,
                      y: 0.08,
                    },
                  },
                  start: 0.1,
                  length: 4.9,
                  fit: "none",
                  scale: 0.9,
                },
              ],
            },

            // Property details overlay - price and specs (Track 4 or 3)
            {
              clips: [
                {
                  asset: {
                    type: "title",
                    text: `${propertyData.price} • ${propertyData.beds} BED • ${propertyData.baths} BATH${propertyData.carSpaces ? ` • ${propertyData.carSpaces} CAR` : ""}${propertyData.landSize ? ` • ${propertyData.landSize}m²` : ""}`,
                    style: "subtitle",
                    color: "#FFFFFF",
                    size: "small",
                    position: "top",
                    offset: {
                      x: 0,
                      y: 0.14,
                    },
                  },
                  start: 0.1,
                  length: 4.9,
                  fit: "none",
                  scale: 0.8,
                },
              ],
            },

            // Agent card at the end - ON TOP (Track 5 or 4)
            ...(agentInfo && agentInfo.name ? [{
              clips: [
                {
                  asset: agentPhotoUrl ? {
                    type: "html",
                    html: `
                      <div style="
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        width: 100%;
                        height: 100%;
                        font-family: Arial, sans-serif;
                        text-align: center;
                        color: white;
                      ">
                        <img
                          src="${agentPhotoUrl}"
                          style="
                            width: 120px;
                            height: 120px;
                            border-radius: 50%;
                            border: 3px solid white;
                            object-fit: cover;
                            margin-bottom: 20px;
                          "
                        />
                        <div style="font-size: 32px; font-weight: bold; margin-bottom: 10px;">
                          ${agentInfo.name}
                        </div>
                        <div style="font-size: 24px; margin-bottom: 5px;">
                          ${agentInfo.phone}
                        </div>
                        ${agentInfo.email ? `<div style="font-size: 20px; margin-bottom: 20px;">${agentInfo.email}</div>` : ''}
                        <div style="font-size: 28px; font-weight: bold; margin-top: 15px;">
                          CONTACT ME TODAY
                        </div>
                      </div>
                    `,
                    css: "",
                    width: 1080,
                    height: 1920,
                  } : {
                    type: "title",
                    text: `${agentInfo.name}\n${agentInfo.phone}${agentInfo.email ? `\n${agentInfo.email}` : ""}\n\nCONTACT ME TODAY`,
                    style: "subtitle",
                    color: "#FFFFFF",
                    size: "small",
                    position: "center",
                  },
                  start: videoClipsDuration,
                  length: 5,
                },
              ],
            }] : []),
          ],
        },
        output: {
          format: "mp4",
          resolution: "hd",
          aspectRatio: "9:16",
        },
      };

      console.log("Sending stitch job to Shotstack...");
      console.log("Property Address Text:", propertyData.address);
      console.log("Property Specs Text:", `${propertyData.beds} BED • ${propertyData.baths} BATH${propertyData.carSpaces ? ` • ${propertyData.carSpaces} CAR` : ""}${propertyData.landSize ? ` • ${propertyData.landSize}m²` : ""}`);
      console.log("Edit payload tracks count:", edit.timeline.tracks.length);

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
