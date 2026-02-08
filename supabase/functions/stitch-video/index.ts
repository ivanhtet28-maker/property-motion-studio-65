/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");

  // Helper function to upload base64 image to Supabase Storage
  async function uploadBase64ToStorage(
    base64Data: string,
    fileName: string,
    folder: string = "temp"
  ): Promise<string | null> {
    try {
      // Remove data:image/xxx;base64, prefix if present
      const base64String = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;

      // Convert base64 to Uint8Array
      const binaryString = atob(base64String);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const filePath = `${folder}/${fileName}`;

      const { error } = await supabase.storage
        .from("video-assets")
        .upload(filePath, bytes, {
          contentType: "image/png",
          upsert: true,
        });

      if (error) {
        console.error("Storage upload error:", error);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from("video-assets")
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (err) {
      console.error("Failed to upload base64 to storage:", err);
      return null;
    }
  }

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

      // Convert base64 images to storage URLs to reduce payload size
      let logoUrl: string | null = null;
      let photoUrl: string | null = null;

      if (agentInfo) {
        console.log("Agent Info - Name:", agentInfo.name);
        console.log("Agent Info - Logo:", agentInfo.logo ? `Logo size: ${agentInfo.logo.length} chars` : "No logo");
        console.log("Agent Info - Photo:", agentInfo.photo ? `Photo size: ${agentInfo.photo.length} chars` : "No photo");
        console.log("Agent Info - Color Scheme:", agentInfo.colorScheme || "default (purple)");
        console.log("Brand Color:", getBrandColor(agentInfo.colorScheme));

        // Upload logo to storage if it's base64
        if (agentInfo.logo && agentInfo.logo.startsWith("data:")) {
          console.log("Uploading logo to storage to reduce payload size...");
          logoUrl = await uploadBase64ToStorage(
            agentInfo.logo,
            `logo-${Date.now()}.png`,
            "agent-logos"
          );
          if (logoUrl) {
            console.log("Logo uploaded to storage:", logoUrl);
          }
        } else if (agentInfo.logo) {
          logoUrl = agentInfo.logo; // Already a URL
        }

        // Upload photo to storage if it's base64
        if (agentInfo.photo && agentInfo.photo.startsWith("data:")) {
          console.log("Uploading agent photo to storage to reduce payload size...");
          photoUrl = await uploadBase64ToStorage(
            agentInfo.photo,
            `agent-${Date.now()}.png`,
            "agent-photos"
          );
          if (photoUrl) {
            console.log("Agent photo uploaded to storage:", photoUrl);
          }
        } else if (agentInfo.photo) {
          photoUrl = agentInfo.photo; // Already a URL
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

            // Property details overlay - simplified single text test
            {
              clips: [
                {
                  asset: {
                    type: "title",
                    text: templateStyle.title,
                    style: "minimal",
                    color: "#FFFFFF",
                    size: "large",
                    background: "#000000",
                    position: "top",
                  },
                  start: 0,
                  length: 5,
                },
                {
                  asset: {
                    type: "title",
                    text: propertyData.address,
                    style: "minimal",
                    color: "#FFFFFF",
                    size: "medium",
                    background: "#000000",
                    position: "center",
                  },
                  start: 0,
                  length: 5,
                },
                {
                  asset: {
                    type: "title",
                    text: `${propertyData.beds} BED • ${propertyData.baths} BATH${propertyData.carSpaces ? ` • ${propertyData.carSpaces} CAR` : ""}`,
                    style: "minimal",
                    color: templateStyle.accentColor,
                    size: "small",
                    background: "#000000",
                    position: "bottom",
                  },
                  start: 0,
                  length: 5,
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
                        ${logoUrl ? `
                          <img
                            src="${logoUrl}"
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
                          ${photoUrl ? `
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
                                src="${photoUrl}"
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