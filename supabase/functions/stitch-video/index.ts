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
    videoUrls?: string[];     // AI-generated video clips (Luma/Runway mode)
    imageUrls?: string[];     // Raw property photos (Ken Burns mode)
    imageEffects?: string[];  // Per-image Shotstack effect (Ken Burns mode only)
    cameraAngles?: string[];  // Raw camera angle names — used for orbit offset animation
    clipDurations?: number[]; // Array of durations for each clip
    fallbackSlots?: number[]; // Indices of clips that failed AI generation — use image + zoomInSlow
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
    outputFormat?: "portrait" | "landscape"; // "portrait" = 9:16 (default), "landscape" = 16:9
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
          text-align: center;
          width: 85%;
        ">
          <div style="font-size: 48px; font-weight: 800; letter-spacing: 3px; margin-bottom: 16px; text-transform: uppercase; text-shadow: 3px 3px 8px rgba(0,0,0,0.8);">${title}</div>
          <div style="font-size: 24px; font-weight: 500; opacity: 0.9; text-shadow: 2px 2px 6px rgba(0,0,0,0.8);">${address}</div>
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
          <table style="margin: 0 auto;"><tr><td style="
            background: rgba(0, 0, 0, 0.45);
            padding: 18px 40px;
            border-radius: 8px;
            font-size: 22px;
            font-weight: 600;
          ">${address}</td></tr></table>
        </div>
        <div style="
          position: absolute;
          bottom: 120px;
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
    const iconSpacing = 0.095; // Space between each icon+number pair

    if (layout === "minimal-focus") {
      // Centered below the title/address
      baseY = -0.08;
      // Calculate starting X to center the full specs group (icons + land size)
      const hasLand = !!propertyData.landSize;
      const totalWidth = (specs.length * iconSpacing) + (hasLand ? 0.07 : 0);
      baseX = 0.5 - (totalWidth / 2);
    } else {
      // Bottom-left for Bold Banner and Modern Luxe (raised above player controls)
      baseY = -0.32;
      baseX = 0.055;
    }

    specs.forEach((spec, index) => {
      const iconX = baseX + (index * iconSpacing);
      const textX = iconX + 0.038; // Text sits right of icon

      // Icon image clip
      clips.push({
        asset: {
          type: "image",
          src: ICON_URLS[spec.icon as keyof typeof ICON_URLS],
        },
        start,
        length,
        fit: "none",
        scale: 1.3,
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
          css: `p { font-family: "Helvetica"; color: #ffffff; font-size: 28px; text-align: left; }`,
          width: 50,
          height: 40,
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
          css: `p { font-family: "Helvetica"; color: #ffffff; font-size: 26px; text-align: left; }`,
          width: 140,
          height: 40,
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
      const { videoUrls, imageUrls, imageEffects, cameraAngles, clipDurations, propertyData, audioUrl, musicUrl, agentInfo, style, layout, customTitle, videoId, outputFormat, fallbackSlots }: StitchVideoRequest = await req.json();

      // Ken Burns mode: raw property photos + Shotstack effects
      // AI mode: pre-generated video clips from Luma/Runway
      const isKenBurns = !!(imageUrls && imageUrls.length > 0);
      const sourceUrls = isKenBurns ? imageUrls! : (videoUrls || []);

      if (sourceUrls.length === 0) {
        throw new Error("No video or image URLs provided for stitching");
      }

      console.log("=== SHOTSTACK VIDEO STITCHING ===");
      console.log("Mode:", isKenBurns ? "Ken Burns (still images)" : "AI video clips");
      console.log("Stitching", sourceUrls.length, isKenBurns ? "photos" : "AI clips");
      console.log("Output format:", outputFormat || "portrait (default)");
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

      // Use provided clip durations or default to 3.5 seconds each.
      // Clamp every duration to a minimum of 1s — Shotstack rejects 0, negative, or NaN lengths.
      // Pad to match sourceUrls length if arrays differ in length.
      const rawDurations = clipDurations || [];
      const durations = sourceUrls.map((_: string, i: number) => {
        const d = rawDurations[i];
        const n = Number(d);
        return (Number.isFinite(n) && n >= 1) ? n : 3.5;
      });
      console.log(`Duration alignment: ${rawDurations.length} provided → ${durations.length} needed (${sourceUrls.length} clips)`);

      // ── Pacing Lock: 3.5s hard cut + 0.5s crossfade ────────────────────────
      // Runway generates 5s clips (shortest it supports). Shotstack hard-cuts at
      // 3.5s for punchy social-media pacing — this also eliminates the melt zone
      // entirely (melt artifacts live in the last ~1s). Adjacent AI clips overlap
      // by 0.5s for high-energy crossfade transitions.
      const CLIP_HARD_CUT = 3.5;
      const TRANSITION_OVERLAP = 0.5;

      const fallbackSet = new Set(fallbackSlots || []);
      const effectiveDurations = isKenBurns
        ? durations
        : durations.map(() => CLIP_HARD_CUT);

      // Calculate total duration (AI mode subtracts overlap between adjacent clips)
      const overlapCount = isKenBurns ? 0 : Math.max(0, effectiveDurations.length - 1);
      const videoClipsDuration = effectiveDurations.reduce((sum, duration) => sum + duration, 0) - (TRANSITION_OVERLAP * overlapCount);
      const agentCardDuration = (agentInfo && agentInfo.name) ? Math.max(effectiveDurations[0] || 3.5, 1) : 0; // Use effective (not raw) duration for timeline consistency
      const totalDuration = videoClipsDuration + agentCardDuration;

      console.log("Clip durations (raw):", durations);
      console.log("Clip durations (effective):", effectiveDurations);
      console.log("Fallback slots:", fallbackSlots || []);
      console.log("Video clips duration:", videoClipsDuration);
      console.log("Total duration:", totalDuration);

      // Build main clip track. All Runway clips are now generated at the
      // target output ratio (720:1280 portrait or 1280:720 landscape),
      // so they fit directly with "cover" — no compositing needed.
      let currentStart = 0;
      const videoClips: any[] = [];

      sourceUrls.forEach((url, index) => {
        // Guard: if durations array is shorter than sourceUrls, fall back to 3.5s
        const rawDuration = effectiveDurations[index];
        const clipDuration = (Number.isFinite(rawDuration) && rawDuration >= 0.5) ? rawDuration : 3.5;
        const isFallbackSlot = fallbackSet.has(index);

        const assetDef = isKenBurns
          ? { type: "image", src: url }
          : isFallbackSlot
            ? { type: "image", src: url }
            : { type: "video", src: url };

        const clip: any = {
          asset: { ...assetDef },
          start: currentStart,
          length: clipDuration,
          fit: "cover",
        };

        if (isKenBurns) {
          // Ken Burns: map camera intent to Shotstack effect or offset animation.
          const angle = cameraAngles?.[index] || "auto";

          if (angle === "truck-right" || angle === "orbit") {
            clip.offset = {
              x: [{ from: 0, to: -0.04, start: 0, length: clipDuration,
                     interpolation: "bezier", easing: "easeInOutQuart" }]
            };
          } else if (angle === "truck-left") {
            clip.offset = {
              x: [{ from: 0, to: 0.04, start: 0, length: clipDuration,
                     interpolation: "bezier", easing: "easeInOutQuart" }]
            };
          } else if (angle === "pull-out" || angle === "drone-up" || angle === "pedestal-up") {
            clip.effect = "zoomOutSlow";
          } else if (angle === "push-in" || angle === "pedestal-down") {
            clip.effect = "zoomInSlow";
          } else if (angle === "static") {
            // No effect — locked shot
          } else {
            clip.effect = "zoomInSlow";
          }
          clip.transition = { in: "fade", out: "fade" };
        } else if (isFallbackSlot) {
          // Hybrid Fallback: failed AI clip → original image with zoomInSlow
          // The tour must always finish — never break the sequence.
          clip.effect = "zoomInSlow";
          clip.transition = { in: "fade", out: "fade" };
          console.log(`Clip ${index}: Hybrid fallback — using original image with zoomInSlow`);
        } else {
          // AI-generated clip
          clip.transition = { in: "fade", out: "fade" };
        }

        // AI clips: overlap adjacent clips by 0.5s for crossfade transition
        if (!isKenBurns && index < sourceUrls.length - 1) {
          currentStart += clipDuration - TRANSITION_OVERLAP;
        } else {
          currentStart += clipDuration;
        }
        videoClips.push(clip);
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
                  length: Math.max(agentCardDuration - 0.1, 0.5),
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
                  length: Math.max(agentCardDuration - 0.1, 0.5),
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
                  length: Math.max(agentCardDuration - 0.1, 0.5),
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
                  length: Math.max(effectiveDurations[0] - 0.1, 0.5),
                },
              ],
            },

            // Property specs icons track (bed, bath, car image icons)
            {
              clips: generatePropertySpecsClips(
                layout || "modern-luxe",
                propertyData,
                0.1,
                Math.max(effectiveDurations[0] - 0.1, 0.5)
              ),
            },

            // Agent outro background - First clip/photo blurred (Track 3)
            ...(agentInfo && agentInfo.name ? [{
              clips: [
                {
                  asset: isKenBurns
                    ? { type: "image", src: imageUrls![0] }  // Ken Burns: use first photo
                    : fallbackSet.has(0)
                      ? { type: "image", src: videoUrls![0] }  // Fallback: image URL, not video
                      : { type: "video", src: videoUrls![0] }, // AI mode: use first video clip
                  start: videoClipsDuration,
                  length: agentCardDuration,
                  filter: "blur",
                },
              ],
            }] : []),

            // Main video clips track — foreground (landscape clips use fit:"contain")
            {
              clips: videoClips,
            },

          ],
        },
        output: {
          format: "mp4",
          resolution: "hd",
          aspectRatio: outputFormat === "landscape" ? "16:9" : "9:16",
        },
      };

      console.log("Video clips built:", videoClips.map((c: any, i: number) => `clip[${i}]: length=${c.length}, start=${c.start}`));

      // ── Final safety net: sanitize ALL clip lengths in every track ──────────
      // Catches any edge case where a length slipped through as 0, NaN, or undefined.
      for (const track of edit.timeline.tracks) {
        if (!track.clips || !Array.isArray(track.clips)) continue;
        for (const clip of track.clips) {
          if (!Number.isFinite(clip.length) || clip.length <= 0) {
            console.warn(`Sanitized invalid clip length: ${clip.length} → 3.5`);
            clip.length = 3.5;
          }
          // Also sanitize nested offset keyframe lengths (Ken Burns animations)
          if (clip.offset?.x && Array.isArray(clip.offset.x)) {
            for (const kf of clip.offset.x) {
              if (!Number.isFinite(kf.length) || kf.length <= 0) {
                console.warn(`Sanitized invalid keyframe length: ${kf.length} → ${clip.length}`);
                kf.length = clip.length;
              }
            }
          }
        }
      }

      console.log("Sending stitch job to Shotstack...");
      if (propertyData.streetAddress && propertyData.suburb && propertyData.state) {
        console.log("Property Address Line 1:", `${propertyData.streetAddress},`);
        console.log("Property Address Line 2:", `${propertyData.suburb}, ${propertyData.state}`);
      } else {
        console.log("Property Address Text:", propertyData.address);
      }
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
          totalClips: sourceUrls.length,
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
