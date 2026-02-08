/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");

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

            // Property address overlay - ON TOP (Track 2 or 1)
            {
              clips: [
                {
                  asset: {
                    type: "title",
                    text: propertyData.address,
                    style: "subtitle",
                    color: "#FFFFFF",
                    size: "large",
                    position: "top",
                    offset: {
                      x: 0,
                      y: 0.05,
                    },
                  },
                  start: 0.1,
                  length: 4.9,
                  fit: "none",
                  scale: 1.0,
                },
              ],
            },

            // Property specs overlay - ON TOP (Track 3 or 2)
            {
              clips: [
                {
                  asset: {
                    type: "title",
                    text: `${propertyData.beds} BED • ${propertyData.baths} BATH${propertyData.carSpaces ? ` • ${propertyData.carSpaces} CAR` : ""}${propertyData.landSize ? ` • ${propertyData.landSize}m²` : ""}`,
                    style: "subtitle",
                    color: "#FFFFFF",
                    size: "medium",
                    position: "bottom",
                    offset: {
                      x: 0,
                      y: -0.05,
                    },
                  },
                  start: 0.1,
                  length: 4.9,
                  fit: "none",
                  scale: 1.0,
                },
              ],
            },

            // Agent card at the end - ON TOP (Track 4 or 3)
            ...(agentInfo && agentInfo.name ? [{
              clips: [
                {
                  asset: {
                    type: "title",
                    text: `${agentInfo.name}\n${agentInfo.phone}${agentInfo.email ? `\n${agentInfo.email}` : ""}\n\nCONTACT ME TODAY`,
                    style: "subtitle",
                    color: "#FFFFFF",
                    size: "large",
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
