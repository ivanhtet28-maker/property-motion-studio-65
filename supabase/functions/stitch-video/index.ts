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
                              font-size: 38px;
                              font-weight: 700;
                              letter-spacing: 1px;
                              text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.9);
                            ">
                              ${propertyData.address}
                            </div>
                          </div>

                          <!-- Bottom Section: Property Stats (Left-aligned single row) -->
                          <div style="
                            display: flex;
                            align-items: center;
                            gap: 30px;
                          ">
                            <!-- Bedrooms -->
                            <div style="
                              display: flex;
                              align-items: center;
                              gap: 10px;
                            ">
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(2px 2px 6px rgba(0, 0, 0, 0.8));">
                                <path d="M20 9V6C20 4.9 19.1 4 18 4H6C4.9 4 4 4.9 4 6V9C2.9 9 2 9.9 2 11V17H4V20H6V17H18V20H20V17H22V11C22 9.9 21.1 9 20 9ZM18 9H13V6H18V9ZM6 6H11V9H6V6Z" fill="white"/>
                              </svg>
                              <span style="
                                font-size: 28px;
                                font-weight: 700;
                                text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.8);
                              ">${propertyData.beds}</span>
                            </div>

                            <!-- Bathrooms -->
                            <div style="
                              display: flex;
                              align-items: center;
                              gap: 10px;
                            ">
                              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(2px 2px 6px rgba(0, 0, 0, 0.8));">
                                <path d="M21 10H7V7C7 5.9 7.9 5 9 5C10.1 5 11 5.9 11 7H13C13 4.79 11.21 3 9 3C6.79 3 5 4.79 5 7V10H3C2.45 10 2 10.45 2 11V12C2 15.31 4.69 18 8 18V21H10V18H14V21H16V18C19.31 18 22 15.31 22 12V11C22 10.45 21.55 10 21 10Z" fill="white"/>
                              </svg>
                              <span style="
                                font-size: 28px;
                                font-weight: 700;
                                text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.8);
                              ">${propertyData.baths}</span>
                            </div>

                            ${propertyData.carSpaces ? `
                              <!-- Parking -->
                              <div style="
                                display: flex;
                                align-items: center;
                                gap: 10px;
                              ">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(2px 2px 6px rgba(0, 0, 0, 0.8));">
                                  <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5H6.5C5.84 5 5.29 5.42 5.08 6.01L3 12V20C3 20.55 3.45 21 4 21H5C5.55 21 6 20.55 6 20V19H18V20C18 20.55 18.45 21 19 21H20C20.55 21 21 20.55 21 20V12L18.92 6.01ZM6.5 16C5.67 16 5 15.33 5 14.5C5 13.67 5.67 13 6.5 13C7.33 13 8 13.67 8 14.5C8 15.33 7.33 16 6.5 16ZM17.5 16C16.67 16 16 15.33 16 14.5C16 13.67 16.67 13 17.5 13C18.33 13 19 13.67 19 14.5C19 15.33 18.33 16 17.5 16ZM5 11L6.5 6.5H17.5L19 11H5Z" fill="white"/>
                                </svg>
                                <span style="
                                  font-size: 28px;
                                  font-weight: 700;
                                  text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.8);
                                ">${propertyData.carSpaces}</span>
                              </div>
                            ` : ''}

                            ${propertyData.landSize ? `
                              <!-- Land Size -->
                              <div style="
                                display: flex;
                                align-items: center;
                                gap: 10px;
                              ">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="filter: drop-shadow(2px 2px 6px rgba(0, 0, 0, 0.8));">
                                  <path d="M20 2H4C2.9 2 2 2.9 2 4V20C2 21.1 2.9 22 4 22H20C21.1 22 22 21.1 22 20V4C22 2.9 21.1 2 20 2ZM20 20H4V4H20V20ZM6 6H18V9H6V6ZM6 11H13V18H6V11ZM15 11H18V14H15V11ZM15 16H18V18H15V16Z" fill="white"/>
                                </svg>
                                <span style="
                                  font-size: 28px;
                                  font-weight: 700;
                                  color: white;
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