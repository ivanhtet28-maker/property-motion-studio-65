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
    layout?: string; // "minimal-focus" | "bold-banner" | "modern-luxe"
    customTitle?: string; // Custom title text (e.g., "Just Sold", "Open House")
    videoId?: string;
  }

  // ============================================================
  // LAYOUT GENERATORS - Property details overlay HTML templates
  // Uses absolute positioning (Shotstack doesn't support flex well)
  // ============================================================

  // Format price with commas (e.g., 2500000 → "2,500,000")
  function formatPrice(price: string): string {
    const num = parseInt(price.replace(/[^0-9]/g, ""));
    if (isNaN(num)) return price;
    return num.toLocaleString("en-US");
  }

  /**
   * Layout 1: Minimal Focus
   * Centered dark semi-transparent box with title, address, and specs below.
   */
  function generateMinimalFocusLayout(
    title: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const address = propertyData.streetAddress && propertyData.suburb && propertyData.state
      ? `${propertyData.streetAddress}, ${propertyData.suburb}, ${propertyData.state}`
      : propertyData.address;

    return `
      <div style="
        position: relative;
        width: 100%;
        height: 100%;
        font-family: Helvetica, Arial, sans-serif;
        color: white;
      ">
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.55);
          padding: 40px 60px;
          border-radius: 8px;
          text-align: center;
          width: 85%;
          box-sizing: border-box;
        ">
          <div style="font-size: 48px; font-weight: 800; letter-spacing: 3px; margin-bottom: 16px; text-transform: uppercase;">${title}</div>
          <div style="font-size: 24px; font-weight: 500; opacity: 0.9;">${address}</div>
        </div>
      </div>
    `;
  }

  /**
   * Layout 2: Bold Banner
   * Dark banner at the bottom with title, price, address.
   * Uses absolute positioning for reliable Shotstack rendering.
   */
  function generateBoldBannerLayout(
    title: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const address = propertyData.streetAddress && propertyData.suburb && propertyData.state
      ? `${propertyData.streetAddress}, ${propertyData.suburb}, ${propertyData.state}`
      : propertyData.address;

    const formattedPrice = formatPrice(propertyData.price);

    return `
      <div style="
        position: relative;
        width: 100%;
        height: 100%;
        font-family: Helvetica, Arial, sans-serif;
        color: white;
      ">
        <div style="
          position: absolute;
          bottom: 80px;
          left: 0;
          right: 0;
          background: linear-gradient(to top, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0.4));
          padding: 32px 40px;
        ">
          <div style="font-size: 40px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 8px;">${title}</div>
          <div style="font-size: 36px; font-weight: 800; margin-bottom: 12px;">$${formattedPrice}</div>
          <div style="font-size: 22px; font-weight: 500; opacity: 0.9;">${address}</div>
        </div>
      </div>
    `;
  }

  /**
   * Layout 3: Modern Luxe
   * Large centered title, address in dark pill, price at bottom-right.
   * Uses absolute positioning for reliable Shotstack rendering.
   */
  function generateModernLuxeLayout(
    title: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const address = propertyData.streetAddress && propertyData.suburb && propertyData.state
      ? `${propertyData.streetAddress}, ${propertyData.suburb}, ${propertyData.state}`
      : propertyData.address;

    const formattedPrice = formatPrice(propertyData.price);

    return `
      <div style="
        position: relative;
        width: 100%;
        height: 100%;
        font-family: Helvetica, Arial, sans-serif;
        color: white;
      ">
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          width: 90%;
        ">
          <div style="font-size: 64px; font-weight: 900; margin-bottom: 24px; text-shadow: 3px 3px 8px rgba(0,0,0,0.8); letter-spacing: 1px;">${title}</div>
          <div style="
            display: inline-block;
            background: rgba(0, 0, 0, 0.45);
            padding: 12px 28px;
            border-radius: 6px;
            font-size: 22px;
            font-weight: 600;
          ">${address}</div>
        </div>
        <div style="
          position: absolute;
          bottom: 80px;
          right: 40px;
          font-size: 32px;
          font-weight: 800;
          text-shadow: 2px 2px 6px rgba(0,0,0,0.8);
        ">$${formattedPrice}</div>
      </div>
    `;
  }

  /**
   * Get the property overlay HTML based on selected layout
   */
  function getPropertyOverlayHtml(
    layout: string,
    customTitle: string | undefined,
    style: string | undefined,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    // Use custom title if provided, otherwise fall back to template name, then "Modern Luxe"
    const title = customTitle || (style && TEMPLATE_NAMES[style]) || "Modern Luxe";

    switch (layout) {
      case "minimal-focus":
        return generateMinimalFocusLayout(title, propertyData);
      case "bold-banner":
        return generateBoldBannerLayout(title, propertyData);
      case "modern-luxe":
      default:
        return generateModernLuxeLayout(title, propertyData);
    }
  }

  // Shotstack icon image URLs
  const ICON_URLS = {
    bed: "https://templates.shotstack.io/basic/asset/image/icon/slimline/white/26px/bed.png",
    bath: "https://templates.shotstack.io/basic/asset/image/icon/slimline/white/26px/bath.png",
    car: "https://templates.shotstack.io/basic/asset/image/icon/slimline/white/26px/car.png",
  };

  /**
   * Generate separate Shotstack clips for property spec icons (bed, bath, car).
   * Uses real image assets instead of emoji text for a professional look.
   * Returns an array of clips to be placed in their own track.
   */
  function generatePropertySpecsClips(
    layout: string,
    propertyData: StitchVideoRequest["propertyData"],
    start: number,
    length: number
  ): any[] {
    const clips: any[] = [];

    // Collect specs that have values
    const specs: { icon: string; value: string }[] = [];
    if (propertyData.beds) specs.push({ icon: "bed", value: String(propertyData.beds) });
    if (propertyData.baths) specs.push({ icon: "bath", value: String(propertyData.baths) });
    if (propertyData.carSpaces) specs.push({ icon: "car", value: String(propertyData.carSpaces) });

    if (specs.length === 0) return clips;

    // Position config based on layout
    let baseY: number;
    let baseX: number;
    const iconSpacing = 0.08; // Space between each icon+number pair

    if (layout === "minimal-focus") {
      // Centered below the dark box
      baseY = -0.08; // Below center where the dark box is
      // Calculate starting X to center the specs group
      const totalWidth = specs.length * iconSpacing;
      baseX = 0.5 - (totalWidth / 2);
    } else {
      // Bottom area for Bold Banner and Modern Luxe (above the very bottom to avoid player controls)
      baseY = -0.36;
      baseX = 0.055;
    }

    specs.forEach((spec, index) => {
      const iconX = baseX + (index * iconSpacing);
      const textX = iconX + 0.035; // Text sits right of icon

      // Icon image clip
      clips.push({
        asset: {
          type: "image",
          src: ICON_URLS[spec.icon as keyof typeof ICON_URLS],
        },
        start,
        length,
        fit: "none",
        position: "left",
        offset: {
          x: iconX,
          y: baseY,
        },
        transition: {
          in: "fade",
          out: "fade",
        },
      });

      // Count text clip
      clips.push({
        asset: {
          type: "html",
          html: `<p>${spec.value}</p>`,
          css: `p { font-family: "Helvetica"; color: #ffffff; font-size: 22px; text-align: left; }`,
          width: 40,
          height: 30,
          position: "center",
        },
        start,
        length,
        position: "left",
        offset: {
          x: textX,
          y: baseY,
        },
        transition: {
          in: "fade",
          out: "fade",
        },
      });
    });

    // Add land size as text (no icon for this)
    if (propertyData.landSize) {
      const landX = baseX + (specs.length * iconSpacing);
      clips.push({
        asset: {
          type: "html",
          html: `<p>${propertyData.landSize}m²</p>`,
          css: `p { font-family: "Helvetica"; color: #ffffff; font-size: 20px; text-align: left; }`,
          width: 120,
          height: 30,
          position: "center",
        },
        start,
        length,
        position: "left",
        offset: {
          x: landX,
          y: baseY,
        },
        transition: {
          in: "fade",
          out: "fade",
        },
      });
    }

    return clips;
  }

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    try {
      const { videoUrls, clipDurations, propertyData, audioUrl, musicUrl, agentInfo, style, layout, customTitle, videoId }: StitchVideoRequest = await req.json();

      if (!videoUrls || videoUrls.length === 0) {
        throw new Error("No video URLs provided for stitching");
      }

      console.log("=== SHOTSTACK VIDEO STITCHING ===");
      console.log("Stitching", videoUrls.length, "Luma AI clips");
      console.log("Layout:", layout || "modern-luxe (default)");
      console.log("Custom Title:", customTitle || "(using template name)");
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

        // Update video record with agent photo URL
        if (agentPhotoUrl && videoId) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, supabaseServiceKey);

          await supabase
            .from("videos")
            .update({ agent_photo_url: agentPhotoUrl })
            .eq("id", videoId);
        }
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
          fonts: [
            {
              src: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/fonts/Helvetica.ttf"
            },
            {
              src: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/fonts/Helvetica-Bold.ttf"
            }
          ],
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
                // Circular luma matte (must come first)
                {
                  asset: {
                    type: "luma",
                    src: "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/luma-mattes/circle_square_white.png",
                  },
                  start: videoClipsDuration + 0.1,
                  length: agentCardDuration - 0.1,
                  position: "top",
                  offset: {
                    y: -0.22,
                  },
                  scale: 0.35,
                  fit: "contain"
                },
                // Agent photo (masked by luma matte above)

                {
                  asset: {
                    type: "image",
                    src: agentPhotoUrl || agentInfo.photo, // Use storage URL if available, fallback to base64
                  },
                  start: videoClipsDuration + 0.1,
                  length: agentCardDuration - 0.1,
                  position: "top",
                  offset: {
                    y: -0.15,
                  },
                  scale: 0.35, // Match luma matte scale exactly
                  fit: "contain", // Match luma matte fit parameter
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
                        font-family: Helvetica, Arial, sans-serif;
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

            // Property details HTML overlay - Layout-based (Track 2)
            {
              clips: [
                {
                  asset: {
                    type: "html",
                    html: getPropertyOverlayHtml(layout || "modern-luxe", customTitle, style, propertyData),
                    css: "",
                    width: 1080,
                    height: 1920,
                  },
                  start: 0.1,
                  length: durations[0] - 0.1, // Match first clip duration (minus 0.1s offset)
                },
              ],
            },

            // Property specs icons track (bed, bath, car image icons)
            {
              clips: generatePropertySpecsClips(
                layout || "modern-luxe",
                propertyData,
                0.1,
                durations[0] - 0.1
              ),
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
