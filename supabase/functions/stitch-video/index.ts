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
      photo: string | null;
    };
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

      // Calculate total duration (5 seconds per Luma clip)
      const totalDuration = videoUrls.length * 5;

      // Build video track with all Luma clips in sequence
      const videoClips = videoUrls.map((url, index) => ({
        asset: {
          type: "video",
          src: url,
        },
        start: index * 5, // Each clip is 5 seconds
        length: 5,
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
            volume: 0.3, // Background music at 30% volume
          } : undefined,
          tracks: [
            // Voiceover track (if available)
            ...(audioUrl ? [{
              clips: [
                {
                  asset: {
                    type: "audio",
                    src: audioUrl,
                    volume: 1.0, // Full volume for voiceover
                  },
                  start: 0,
                  length: totalDuration,
                },
              ],
            }] : []),

            // Gradient overlay on first clip (dark left to transparent right)
            {
              clips: [
                {
                  asset: {
                    type: "html",
                    html: `
                      <div style="
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: linear-gradient(90deg, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.3) 50%, transparent 100%);
                      "></div>
                    `,
                    css: "",
                    width: 1080,
                    height: 1920,
                  },
                  start: 0,
                  length: 5, // Only on first 5 seconds (first clip)
                  transition: {
                    out: "fade",
                  },
                },
              ],
            },

            // Property details overlay (first 5 seconds only) - Clean gradient design
              {
                clips: [
                  {
                    asset: {
                      type: "html",
                      html: `
                        <div style="
                          position: absolute;
                          top: 0;
                          left: 0;
                          width: 100%;
                          height: 100%;
                          padding: 80px 60px;
                          display: flex;
                          flex-direction: column;
                          justify-content: space-between;
                          font-family: 'Helvetica Neue', Arial, sans-serif;
                          color: white;
                        ">
                          <!-- Top Section: Address -->
                          <div style="text-align: center;">
                            <div style="
                              font-size: 28px;
                              font-weight: 400;
                              letter-spacing: 1px;
                              text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.9);
                            ">
                              ${propertyData.address}
                            </div>
                          </div>

                          <!-- Bottom Section: Property Stats (Left-aligned with icons) -->
                          <div style="
                            display: flex;
                            align-items: center;
                            gap: 25px;
                          ">
                            <!-- Bedrooms with icon -->
                            <div style="
                              display: flex;
                              align-items: center;
                              gap: 8px;
                            ">
                              <span style="font-size: 24px;">🛏️</span>
                              <span style="
                                font-size: 22px;
                                font-weight: 500;
                                text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.8);
                              ">${propertyData.beds}</span>
                            </div>

                            <!-- Bathrooms with icon -->
                            <div style="
                              display: flex;
                              align-items: center;
                              gap: 8px;
                            ">
                              <span style="font-size: 24px;">🚿</span>
                              <span style="
                                font-size: 22px;
                                font-weight: 500;
                                text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.8);
                              ">${propertyData.baths}</span>
                            </div>

                            ${propertyData.carSpaces ? `
                              <!-- Parking with icon -->
                              <div style="
                                display: flex;
                                align-items: center;
                                gap: 8px;
                              ">
                                <span style="font-size: 24px;">🚗</span>
                                <span style="
                                  font-size: 22px;
                                  font-weight: 500;
                                  text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.8);
                                ">${propertyData.carSpaces}</span>
                              </div>
                            ` : ''}

                            ${propertyData.landSize ? `
                              <!-- Land Size -->
                              <div style="
                                display: flex;
                                align-items: center;
                                gap: 8px;
                              ">
                                <span style="
                                  font-size: 22px;
                                  font-weight: 500;
                                  text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.8);
                                ">${propertyData.landSize}m²</span>
                              </div>
                            ` : ''}
                          </div>
                        </div>
                      `,
                      css: "",
                      width: 1080,
                      height: 1920,
                    },
                    start: 0,
                    length: 5,
                    transition: {
                      in: "fade",
                      out: "fade",
                    },
                  },
                ],
              },

            // Agent overlay track (if available)
            ...(agentInfo && agentInfo.name ? [{
              clips: [
                {
                  asset: {
                    type: "html",
                    html: `
                      <div style="
                        position: absolute;
                        bottom: 40px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(0, 0, 0, 0.85);
                        backdrop-filter: blur(10px);
                        border-radius: 20px;
                        padding: 15px 25px;
                        display: flex;
                        align-items: center;
                        gap: 15px;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                      ">
                        ${agentInfo.photo ? `
                          <img
                            src="${agentInfo.photo}"
                            style="
                              width: 60px;
                              height: 60px;
                              border-radius: 50%;
                              border: 2px solid white;
                              object-fit: cover;
                            "
                          />
                        ` : ''}
                        <div style="color: white; font-family: Arial, sans-serif;">
                          <div style="font-size: 18px; font-weight: bold; margin-bottom: 3px;">
                            ${agentInfo.name}
                          </div>
                          ${agentInfo.phone ? `
                            <div style="font-size: 14px; opacity: 0.9;">
                              ${agentInfo.phone}
                            </div>
                          ` : ''}
                          ${agentInfo.email ? `
                            <div style="font-size: 12px; opacity: 0.7; margin-top: 2px;">
                              ${agentInfo.email}
                            </div>
                          ` : ''}
                        </div>
                      </div>
                    `,
                    css: "",
                    width: 1080,
                    height: 1920,
                  },
                  start: 0,
                  length: totalDuration,
                  position: "bottom",
                },
              ],
            }] : []),

            // Video track with all Luma clips
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
          estimatedTime: 60, // ~60 seconds for stitching
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