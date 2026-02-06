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

            // Property details overlay (first 5 seconds only) - Bottom positioned
              {
                clips: [
                  {
                    asset: {
                      type: "html",
                      html: `
                        <div style="
                          position: absolute;
                          bottom: 200px;
                          left: 50%;
                          transform: translateX(-50%);
                          background: rgba(0, 0, 0, 0.95);
                          backdrop-filter: blur(25px);
                          border-radius: 12px;
                          padding: 30px 40px;
                          text-align: center;
                          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(0, 0, 0, 0.9);
                          border: 2px solid rgba(0, 0, 0, 0.5);
                          max-width: 950px;
                          width: 90%;
                        ">
                          <div style="color: white; font-family: 'Helvetica Neue', Arial, sans-serif;">
                            <!-- Property Address & Price Row -->
                            <div style="margin-bottom: 20px;">
                              <div style="
                                font-size: 26px;
                                font-weight: 300;
                                letter-spacing: 1px;
                                margin-bottom: 8px;
                                text-transform: uppercase;
                                text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.9), 0 0 20px rgba(0, 0, 0, 0.8);
                              ">
                                ${propertyData.address}
                              </div>
                              ${propertyData.price ? `
                                <div style="
                                  font-size: 32px;
                                  font-weight: 600;
                                  letter-spacing: 0.5px;
                                  color: white;
                                  margin-top: 5px;
                                  text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.9), 0 0 20px rgba(0, 0, 0, 0.8);
                                ">
                                  $${propertyData.price.replace(/^\$/, '')}
                                </div>
                              ` : ''}
                            </div>

                            <!-- Divider -->
                            <div style="
                              width: 50px;
                              height: 1px;
                              background: rgba(255, 255, 255, 0.5);
                              margin: 20px auto;
                              box-shadow: 0 0 4px rgba(255, 255, 255, 0.3);
                            "></div>

                            <!-- Property Stats - Horizontal Single Row -->
                            <div style="
                              display: flex;
                              justify-content: center;
                              align-items: center;
                              gap: 35px;
                              flex-wrap: wrap;
                            ">
                              <!-- Bedrooms -->
                              <div style="display: flex; align-items: baseline; gap: 8px;">
                                <span style="
                                  font-size: 28px;
                                  font-weight: 300;
                                  text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.8);
                                ">${propertyData.beds}</span>
                                <span style="
                                  font-size: 11px;
                                  text-transform: uppercase;
                                  letter-spacing: 1.5px;
                                  text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.8);
                                ">Beds</span>
                              </div>

                              <!-- Separator -->
                              <div style="
                                width: 1px;
                                height: 20px;
                                background: rgba(255, 255, 255, 0.4);
                                box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
                              "></div>

                              <!-- Bathrooms -->
                              <div style="display: flex; align-items: baseline; gap: 8px;">
                                <span style="
                                  font-size: 28px;
                                  font-weight: 300;
                                  text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.8);
                                ">${propertyData.baths}</span>
                                <span style="
                                  font-size: 11px;
                                  text-transform: uppercase;
                                  letter-spacing: 1.5px;
                                  text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.8);
                                ">Baths</span>
                              </div>

                              ${propertyData.carSpaces ? `
                                <!-- Separator -->
                                <div style="
                                  width: 1px;
                                  height: 20px;
                                  background: rgba(255, 255, 255, 0.4);
                                  box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
                                "></div>

                                <!-- Parking -->
                                <div style="display: flex; align-items: baseline; gap: 8px;">
                                  <span style="
                                    font-size: 28px;
                                    font-weight: 300;
                                    text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.8);
                                  ">${propertyData.carSpaces}</span>
                                  <span style="
                                    font-size: 11px;
                                    text-transform: uppercase;
                                    letter-spacing: 1.5px;
                                    text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.8);
                                  ">Parking</span>
                                </div>
                              ` : ''}

                              ${propertyData.landSize ? `
                                <!-- Separator -->
                                <div style="
                                  width: 1px;
                                  height: 20px;
                                  background: rgba(255, 255, 255, 0.4);
                                  box-shadow: 0 0 2px rgba(0, 0, 0, 0.8);
                                "></div>

                                <!-- Land Size -->
                                <div style="display: flex; align-items: baseline; gap: 8px;">
                                  <span style="
                                    font-size: 28px;
                                    font-weight: 300;
                                    text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.8);
                                  ">${propertyData.landSize}</span>
                                  <span style="
                                    font-size: 11px;
                                    text-transform: uppercase;
                                    letter-spacing: 1.5px;
                                    text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.8);
                                  ">m²</span>
                                </div>
                              ` : ''}
                            </div>

                            <!-- Property Features (Top 3) -->
                            ${propertyData.features && propertyData.features.length > 0 ? `
                              <div style="
                                margin-top: 20px;
                                display: flex;
                                justify-content: center;
                                gap: 15px;
                                flex-wrap: wrap;
                              ">
                                ${propertyData.features.slice(0, 3).map(feature => `
                                  <span style="
                                    font-size: 10px;
                                    text-transform: uppercase;
                                    letter-spacing: 1.5px;
                                    opacity: 0.8;
                                    padding: 0 10px;
                                    border-right: 1px solid rgba(255, 255, 255, 0.3);
                                    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
                                  ">
                                    ${feature}
                                  </span>
                                `).join('')}
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