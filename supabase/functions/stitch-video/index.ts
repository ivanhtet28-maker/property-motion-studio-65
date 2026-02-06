/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");

  // Template configurations
  const TEMPLATE_STYLES: Record<string, {
    title: string;
    titleFont: string;
    titleSize: string;
    titleWeight: string;
    titleColor: string;
    titleShadow: string;
    addressFont: string;
    addressSize: string;
    addressWeight: string;
    statFont: string;
    statSize: string;
    statWeight: string;
    accentColor: string;
  }> = {
    "modern-luxe": {
      title: "Modern Luxe",
      titleFont: "'Montserrat', 'Helvetica Neue', sans-serif",
      titleSize: "80px",
      titleWeight: "800",
      titleColor: "white",
      titleShadow: "4px 4px 15px rgba(0, 0, 0, 0.9)",
      addressFont: "'Montserrat', sans-serif",
      addressSize: "36px",
      addressWeight: "600",
      statFont: "'Montserrat', sans-serif",
      statSize: "40px",
      statWeight: "700",
      accentColor: "#8B5CF6", // Purple
    },
    "just-listed": {
      title: "Just Listed",
      titleFont: "'Playfair Display', serif",
      titleSize: "75px",
      titleWeight: "700",
      titleColor: "white",
      titleShadow: "3px 3px 12px rgba(0, 0, 0, 0.9)",
      addressFont: "'Lato', sans-serif",
      addressSize: "34px",
      addressWeight: "400",
      statFont: "'Lato', sans-serif",
      statSize: "38px",
      statWeight: "700",
      accentColor: "#3B82F6", // Blue
    },
    "minimalist": {
      title: "Now Available",
      titleFont: "'Inter', sans-serif",
      titleSize: "70px",
      titleWeight: "300",
      titleColor: "white",
      titleShadow: "2px 2px 10px rgba(0, 0, 0, 0.9)",
      addressFont: "'Inter', sans-serif",
      addressSize: "32px",
      addressWeight: "300",
      statFont: "'Inter', sans-serif",
      statSize: "36px",
      statWeight: "600",
      accentColor: "#6B7280", // Gray
    },
    "cinematic": {
      title: "Featured Property",
      titleFont: "'Bebas Neue', 'Arial Black', sans-serif",
      titleSize: "85px",
      titleWeight: "900",
      titleColor: "white",
      titleShadow: "5px 5px 20px rgba(0, 0, 0, 1)",
      addressFont: "'Roboto', sans-serif",
      addressSize: "38px",
      addressWeight: "700",
      statFont: "'Roboto', sans-serif",
      statSize: "42px",
      statWeight: "900",
      accentColor: "#EF4444", // Red
    },
    "luxury": {
      title: "Luxury Estate",
      titleFont: "'Cormorant Garamond', serif",
      titleSize: "78px",
      titleWeight: "600",
      titleColor: "#FFD700", // Gold
      titleShadow: "3px 3px 12px rgba(0, 0, 0, 0.95)",
      addressFont: "'Cormorant Garamond', serif",
      addressSize: "35px",
      addressWeight: "500",
      statFont: "'Cormorant Garamond', serif",
      statSize: "39px",
      statWeight: "600",
      accentColor: "#FFD700", // Gold
    },
    "real-estate-pro": {
      title: "New Listing",
      titleFont: "'Open Sans', sans-serif",
      titleSize: "72px",
      titleWeight: "700",
      titleColor: "white",
      titleShadow: "3px 3px 10px rgba(0, 0, 0, 0.9)",
      addressFont: "'Open Sans', sans-serif",
      addressSize: "33px",
      addressWeight: "600",
      statFont: "'Open Sans', sans-serif",
      statSize: "37px",
      statWeight: "700",
      accentColor: "#10B981", // Green
    },
  };

  function getTemplateStyle(style: string | undefined) {
    return TEMPLATE_STYLES[style || "modern-luxe"] || TEMPLATE_STYLES["modern-luxe"];
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
      photo: string | null;
    };
    style?: string;
    videoId?: string;
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { videoUrls, propertyData, audioUrl, musicUrl, agentInfo, style, videoId }: StitchVideoRequest = await req.json();

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

      // Get template style
      const templateStyle = getTemplateStyle(style);
      console.log("Using template style:", style || "modern-luxe");

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

            // Dark gradient overlay on first clip (left to right fade)
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
                        background: linear-gradient(to right, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.6) 40%, rgba(0, 0, 0, 0.3) 70%, transparent 100%);
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
                          font-family: ${templateStyle.addressFont};
                          color: ${templateStyle.titleColor};
                        ">
                          <!-- Top Section: Template Title + Address + Features -->
                          <div style="text-align: center;">
                            <!-- Template Title -->
                            <div style="
                              font-family: ${templateStyle.titleFont};
                              font-size: ${templateStyle.titleSize};
                              font-weight: ${templateStyle.titleWeight};
                              color: ${templateStyle.titleColor};
                              text-shadow: ${templateStyle.titleShadow};
                              letter-spacing: 2px;
                              margin-bottom: 25px;
                            ">
                              ${templateStyle.title}
                            </div>

                            <!-- Address -->
                            <div style="
                              font-family: ${templateStyle.addressFont};
                              font-size: ${templateStyle.addressSize};
                              font-weight: ${templateStyle.addressWeight};
                              letter-spacing: 1px;
                              text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.9);
                              margin-bottom: ${propertyData.features && propertyData.features.length > 0 ? '15px' : '0'};
                            ">
                              ${propertyData.address}
                            </div>
                            ${propertyData.features && propertyData.features.length > 0 ? `
                              <div style="
                                font-size: 16px;
                                font-weight: 400;
                                letter-spacing: 0.5px;
                                opacity: 0.9;
                                text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.9);
                                margin-top: 10px;
                              ">
                                ${propertyData.features.slice(0, 4).join(' • ')}
                              </div>
                            ` : ''}
                          </div>

                          <!-- Bottom Section: Property Stats (Left-aligned modern text layout) -->
                          <div style="
                            display: flex;
                            align-items: center;
                            gap: 40px;
                          ">
                            <!-- Bedrooms -->
                            <div style="
                              display: flex;
                              flex-direction: column;
                              align-items: flex-start;
                            ">
                              <span style="
                                font-family: ${templateStyle.statFont};
                                font-size: ${templateStyle.statSize};
                                font-weight: ${templateStyle.statWeight};
                                line-height: 1;
                                margin-bottom: 5px;
                                text-shadow: 3px 3px 8px rgba(0, 0, 0, 0.9);
                              ">${propertyData.beds}</span>
                              <span style="
                                font-family: ${templateStyle.addressFont};
                                font-size: 18px;
                                font-weight: 400;
                                letter-spacing: 1px;
                                opacity: 0.95;
                                text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.9);
                              ">${propertyData.beds === 1 ? 'Bedroom' : 'Bedrooms'}</span>
                            </div>

                            <!-- Bathrooms -->
                            <div style="
                              display: flex;
                              flex-direction: column;
                              align-items: flex-start;
                            ">
                              <span style="
                                font-family: ${templateStyle.statFont};
                                font-size: ${templateStyle.statSize};
                                font-weight: ${templateStyle.statWeight};
                                line-height: 1;
                                margin-bottom: 5px;
                                text-shadow: 3px 3px 8px rgba(0, 0, 0, 0.9);
                              ">${propertyData.baths}</span>
                              <span style="
                                font-family: ${templateStyle.addressFont};
                                font-size: 18px;
                                font-weight: 400;
                                letter-spacing: 1px;
                                opacity: 0.95;
                                text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.9);
                              ">${propertyData.baths === 1 ? 'Bathroom' : 'Bathrooms'}</span>
                            </div>

                            ${propertyData.carSpaces ? `
                              <!-- Car Spaces -->
                              <div style="
                                display: flex;
                                flex-direction: column;
                                align-items: flex-start;
                              ">
                                <span style="
                                  font-size: 42px;
                                  font-weight: 700;
                                  line-height: 1;
                                  margin-bottom: 5px;
                                  text-shadow: 3px 3px 8px rgba(0, 0, 0, 0.9);
                                ">${propertyData.carSpaces}</span>
                                <span style="
                                  font-size: 18px;
                                  font-weight: 400;
                                  letter-spacing: 1px;
                                  opacity: 0.95;
                                  text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.9);
                                ">${propertyData.carSpaces === 1 ? 'Car Space' : 'Car Spaces'}</span>
                              </div>
                            ` : ''}

                            ${propertyData.landSize ? `
                              <!-- Land Size -->
                              <div style="
                                display: flex;
                                flex-direction: column;
                                align-items: flex-start;
                              ">
                                <span style="
                                  font-size: 42px;
                                  font-weight: 700;
                                  line-height: 1;
                                  margin-bottom: 5px;
                                  text-shadow: 3px 3px 8px rgba(0, 0, 0, 0.9);
                                ">${propertyData.landSize}m²</span>
                                <span style="
                                  font-size: 18px;
                                  font-weight: 400;
                                  letter-spacing: 1px;
                                  opacity: 0.95;
                                  text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.9);
                                ">Land Size</span>
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