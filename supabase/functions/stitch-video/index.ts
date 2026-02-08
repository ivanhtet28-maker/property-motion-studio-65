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

  // Color scheme mapping (matches frontend options)
  const COLOR_SCHEMES: Record<string, string> = {
    purple: "#6D28D9",
    blue: "#0066FF",
    teal: "#06B6D4",
    green: "#10B981",
    orange: "#F97316",
    pink: "#EC4899",
  };

  function getBrandColor(colorScheme: string | undefined) {
    return COLOR_SCHEMES[colorScheme || "purple"] || COLOR_SCHEMES["purple"];
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
      logo?: string | null;
      colorScheme?: string;
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

      // Calculate total duration (5 seconds per Luma clip + 5 seconds for agent card if agent info provided)
      const videoClipsDuration = videoUrls.length * 5;
      const agentCardDuration = (agentInfo && agentInfo.name) ? 5 : 0;
      const totalDuration = videoClipsDuration + agentCardDuration;

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

      // Debug: Log agentInfo values and check image sizes
      if (agentInfo) {
        console.log("Agent Info - Name:", agentInfo.name);
        console.log("Agent Info - Logo:", agentInfo.logo ? `Logo size: ${agentInfo.logo.length} chars` : "No logo");
        console.log("Agent Info - Photo:", agentInfo.photo ? `Photo size: ${agentInfo.photo.length} chars` : "No photo");
        console.log("Agent Info - Color Scheme:", agentInfo.colorScheme || "default (purple)");
        console.log("Brand Color:", getBrandColor(agentInfo.colorScheme));

        // Warn if images are too large
        if (agentInfo.logo && agentInfo.logo.length > 100000) {
          console.warn("WARNING: Logo is very large:", agentInfo.logo.length, "chars - may cause Shotstack issues");
        }
        if (agentInfo.photo && agentInfo.photo.length > 100000) {
          console.warn("WARNING: Agent photo is very large:", agentInfo.photo.length, "chars - may cause Shotstack issues");
        }
      }

      // Build Shotstack edit
      const edit = {
        timeline: {
          soundtrack: musicUrl ? {
            src: musicUrl,
            effect: "fadeInFadeOut",
            volume: 0.3, // Background music at 30% volume
          } : undefined,
          tracks: [
            // Video track with all Luma clips (BOTTOM LAYER)
            {
              clips: videoClips,
            },

            // Dark gradient overlay on first clip (top and bottom gradients)
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
                        background: linear-gradient(to bottom, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.4) 35%, rgba(0, 0, 0, 0.4) 65%, rgba(0, 0, 0, 0.9) 100%);
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
                          color: white;
                        ">
                          <!-- Top Section: Template Title + Address + Features -->
                          <div style="text-align: center;">
                            <!-- Template Title -->
                            <div style="
                              font-family: ${templateStyle.titleFont};
                              font-size: ${templateStyle.titleSize};
                              font-weight: ${templateStyle.titleWeight};
                              color: white;
                              text-shadow: 4px 4px 12px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
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
                              color: white;
                              letter-spacing: 1px;
                              text-shadow: 3px 3px 10px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                              margin-bottom: ${propertyData.features && propertyData.features.length > 0 ? '15px' : '0'};
                            ">
                              ${propertyData.address}
                            </div>
                            ${propertyData.features && propertyData.features.length > 0 ? `
                              <div style="
                                font-size: 16px;
                                font-weight: 400;
                                letter-spacing: 0.5px;
                                color: white;
                                opacity: 0.95;
                                text-shadow: 3px 3px 8px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                                margin-top: 10px;
                              ">
                                ${propertyData.features.slice(0, 4).join(' • ')}
                              </div>
                            ` : ''}
                          </div>

                          <!-- Bottom Section: Property Stats (Text Only) -->
                          <div style="
                            display: flex;
                            align-items: center;
                            gap: 45px;
                          ">
                            <!-- Bedrooms -->
                            <div style="display: flex; flex-direction: column; align-items: flex-start;">
                              <span style="
                                font-family: ${templateStyle.statFont};
                                font-size: ${templateStyle.statSize};
                                font-weight: ${templateStyle.statWeight};
                                color: white;
                                line-height: 1;
                                margin-bottom: 8px;
                                text-shadow: 3px 3px 10px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                              ">${propertyData.beds}</span>
                              <span style="
                                font-family: ${templateStyle.addressFont};
                                font-size: 20px;
                                font-weight: 400;
                                letter-spacing: 1px;
                                color: ${templateStyle.accentColor};
                                text-shadow: 3px 3px 8px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                              ">${propertyData.beds === 1 ? 'BEDROOM' : 'BEDROOMS'}</span>
                            </div>

                            <!-- Bathrooms -->
                            <div style="display: flex; flex-direction: column; align-items: flex-start;">
                              <span style="
                                font-family: ${templateStyle.statFont};
                                font-size: ${templateStyle.statSize};
                                font-weight: ${templateStyle.statWeight};
                                color: white;
                                line-height: 1;
                                margin-bottom: 8px;
                                text-shadow: 3px 3px 10px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                              ">${propertyData.baths}</span>
                              <span style="
                                font-family: ${templateStyle.addressFont};
                                font-size: 20px;
                                font-weight: 400;
                                letter-spacing: 1px;
                                color: ${templateStyle.accentColor};
                                text-shadow: 3px 3px 8px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                              ">${propertyData.baths === 1 ? 'BATHROOM' : 'BATHROOMS'}</span>
                            </div>

                            ${propertyData.carSpaces ? `
                              <!-- Car Spaces -->
                              <div style="display: flex; flex-direction: column; align-items: flex-start;">
                                <span style="
                                  font-family: ${templateStyle.statFont};
                                  font-size: ${templateStyle.statSize};
                                  font-weight: ${templateStyle.statWeight};
                                  color: white;
                                  line-height: 1;
                                  margin-bottom: 8px;
                                  text-shadow: 3px 3px 10px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                                ">${propertyData.carSpaces}</span>
                                <span style="
                                  font-family: ${templateStyle.addressFont};
                                  font-size: 20px;
                                  font-weight: 400;
                                  letter-spacing: 1px;
                                  color: ${templateStyle.accentColor};
                                  text-shadow: 3px 3px 8px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                                ">${propertyData.carSpaces === 1 ? 'CAR SPACE' : 'CAR SPACES'}</span>
                              </div>
                            ` : ''}

                            ${propertyData.landSize ? `
                              <!-- Land Size -->
                              <div style="display: flex; flex-direction: column; align-items: flex-start;">
                                <span style="
                                  font-family: ${templateStyle.statFont};
                                  font-size: ${templateStyle.statSize};
                                  font-weight: ${templateStyle.statWeight};
                                  color: white;
                                  line-height: 1;
                                  margin-bottom: 8px;
                                  text-shadow: 3px 3px 10px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                                ">${propertyData.landSize}m²</span>
                                <span style="
                                  font-family: ${templateStyle.addressFont};
                                  font-size: 20px;
                                  font-weight: 400;
                                  letter-spacing: 1px;
                                  color: ${templateStyle.accentColor};
                                  text-shadow: 3px 3px 8px rgba(0, 0, 0, 1), 2px 2px 6px rgba(0, 0, 0, 0.9);
                                ">LAND SIZE</span>
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

            // Black background for agent card at the end (if agent info provided)
            ...(agentInfo && agentInfo.name ? [{
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
                        background: #000000;
                      "></div>
                    `,
                    css: "",
                    width: 1080,
                    height: 1920,
                  },
                  start: videoClipsDuration,
                  length: 5,
                },
              ],
            }] : []),

            // Agent branding card at the end (if available)
            ...(agentInfo && agentInfo.name ? [{
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
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        font-family: 'Helvetica Neue', Arial, sans-serif;
                        color: white;
                        padding: 60px;
                      ">
                        ${agentInfo.logo ? `
                          <img
                            src="${agentInfo.logo}"
                            style="
                              max-width: 200px;
                              max-height: 80px;
                              object-fit: contain;
                              margin-bottom: 60px;
                            "
                          />
                        ` : ''}
                        <div style="
                          display: flex;
                          flex-direction: row;
                          align-items: center;
                          justify-content: center;
                          gap: 30px;
                          margin-bottom: 50px;
                        ">
                          ${agentInfo.photo ? `
                            <div style="
                              width: 136px;
                              height: 136px;
                              border-radius: 50%;
                              background: ${getBrandColor(agentInfo.colorScheme)};
                              display: flex;
                              align-items: center;
                              justify-content: center;
                              padding: 6px;
                              box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
                            ">
                              <img
                                src="${agentInfo.photo}"
                                style="
                                  width: 120px;
                                  height: 120px;
                                  border-radius: 50%;
                                  border: 3px solid white;
                                  object-fit: cover;
                                "
                              />
                            </div>
                          ` : ''}
                          <div style="text-align: left; max-width: 450px;">
                            <div style="
                              font-size: 36px;
                              font-weight: 700;
                              margin-bottom: 12px;
                              letter-spacing: 0.5px;
                              line-height: 1.2;
                            ">
                              ${agentInfo.name}
                            </div>
                            ${agentInfo.phone ? `
                              <div style="
                                font-size: 24px;
                                opacity: 0.95;
                                margin-bottom: 8px;
                                font-weight: 400;
                              ">
                                ${agentInfo.phone}
                              </div>
                            ` : ''}
                            ${agentInfo.email ? `
                              <div style="
                                font-size: 20px;
                                opacity: 0.85;
                                font-weight: 300;
                              ">
                                ${agentInfo.email}
                              </div>
                            ` : ''}
                          </div>
                        </div>
                        <div style="
                          background: ${getBrandColor(agentInfo.colorScheme)};
                          padding: 15px 40px;
                          border-radius: 12px;
                          font-size: 20px;
                          font-weight: 500;
                          letter-spacing: 2px;
                          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
                        ">
                          CONTACT ME TODAY
                        </div>
                      </div>
                    `,
                    css: "",
                    width: 1080,
                    height: 1920,
                  },
                  start: videoClipsDuration,
                  length: 5,
                  transition: {
                    in: "fade",
                  },
                },
              ],
            }] : []),

            // Voiceover track (if available) - only during video clips, not agent card
            ...(audioUrl ? [{
              clips: [
                {
                  asset: {
                    type: "audio",
                    src: audioUrl,
                    volume: 1.0, // Full volume for voiceover
                  },
                  start: 0,
                  length: videoClipsDuration, // Only play during video clips
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

      // Check payload size before sending
      const payloadString = JSON.stringify(edit);
      const payloadSizeKB = (payloadString.length / 1024).toFixed(2);
      console.log("Payload size:", payloadSizeKB, "KB");
      if (payloadString.length > 500000) {
        console.warn("WARNING: Payload is very large (", payloadSizeKB, "KB) - may exceed Shotstack limits");
      }

      console.log("Sending stitch job to Shotstack...");

      // Submit to Shotstack
      const response = await fetch("https://api.shotstack.io/v1/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SHOTSTACK_API_KEY!,
        },
        body: payloadString,
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