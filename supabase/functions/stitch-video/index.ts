/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { corsHeaders } from "../_shared/cors.ts";

  import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


  const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");

  // Template name mapping
  const TEMPLATE_NAMES: Record<string, string> = {
    "open-house": "Open House",
    "newly-listed": "Newly Listed",
    "elegant-classic": "Elegant Classic",
    "modern-luxe": "Modern Luxe",
    "minimal-focus": "Minimal Focus",
    "big-bold": "Big and Bold",
    "white-on-black": "White on Black",
    "simple-white": "Simple White",
    "modern-treehouse": "Modern Treehouse",
    "just-listed": "Just Listed",
    "minimalist": "Minimalist",
    "cinematic": "Cinematic",
    "luxury": "Luxury",
    "real-estate-pro": "Real Estate Pro",
    "warm-elegance": "Warm Elegance",
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
    musicTrimStart?: number;  // Trim start in seconds
    musicTrimEnd?: number;    // Trim end in seconds
    agentInfo?: {
      name: string;
      phone: string;
      email: string;
      photo?: string | null;
    };
    style?: string;
    layout?: string; // "minimal-focus" | "bold-banner" | "modern-luxe" or template id
    customTitle?: string; // Custom title text (e.g., "Just Sold", "Open House")
    detailsText?: string; // Free-text details shown on intro overlay (e.g. address, date)
    videoId?: string;
    outputFormat?: "portrait" | "landscape"; // "portrait" = 9:16 (default), "landscape" = 16:9
    customIntroImage?: string; // base64 custom intro overlay image
    customOutroImage?: string; // base64 custom outro overlay image
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

  // Build property specs text (e.g., "3 Bed  •  2 Bath  •  2 Car  •  512m²")
  function buildSpecsText(propertyData: StitchVideoRequest["propertyData"]): string {
    const parts: string[] = [];
    if (propertyData.beds) parts.push(`${propertyData.beds} Bed`);
    if (propertyData.baths) parts.push(`${propertyData.baths} Bath`);
    if (propertyData.carSpaces) parts.push(`${propertyData.carSpaces} Car`);
    if (propertyData.landSize) parts.push(`${propertyData.landSize}m²`);
    return parts.join("  •  ");
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

  // ── Template-specific overlay generators ──────────────────

  /** Open House: dark navy banner at bottom, heading left | divider | details + price right */
  function generateOpenHouseLayout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const details = detailsText || getAustralianAddress(propertyData);
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const specs = buildSpecsText(propertyData);
    return `
      <div style="position:relative;width:100%;height:100%;font-family:Helvetica,Arial,sans-serif;color:white;">
        <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(47,64,80,0.92);padding:32px 40px;display:flex;align-items:center;">
          <div style="font-size:44px;font-weight:900;letter-spacing:3px;text-transform:uppercase;white-space:nowrap;">${title}</div>
          <div style="width:2px;align-self:stretch;background:rgba(255,255,255,0.4);margin:0 28px;min-height:44px;"></div>
          <div>
            <div style="font-size:22px;font-weight:500;line-height:1.5;opacity:0.85;white-space:pre-line;">${details}</div>
            ${price ? `<div style="font-size:28px;font-weight:800;color:#f5c518;margin-top:8px;">${price}</div>` : ""}
            ${specs ? `<div style="font-size:18px;font-weight:600;opacity:0.75;margin-top:4px;">${specs}</div>` : ""}
          </div>
        </div>
      </div>
    `;
  }

  /** Newly Listed: centered serif heading + italic address + price over bottom gradient */
  function generateNewlyListedLayout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const details = detailsText || getAustralianAddress(propertyData);
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const specs = buildSpecsText(propertyData);
    return `
      <div style="position:relative;width:100%;height:100%;font-family:Georgia,'Times New Roman',serif;color:white;">
        <div style="position:absolute;bottom:0;left:0;right:0;padding:80px 48px 60px;background:linear-gradient(to top,rgba(0,0,0,0.65),transparent);text-align:center;">
          <div style="font-size:56px;font-weight:700;margin-bottom:16px;">${title}</div>
          <div style="font-size:28px;font-weight:400;font-style:italic;opacity:0.85;line-height:1.5;white-space:pre-line;">${details}</div>
          ${price ? `<div style="font-size:32px;font-weight:700;color:#f5c518;margin-top:12px;">${price}</div>` : ""}
          ${specs ? `<div style="font-size:20px;font-weight:500;font-family:Helvetica,Arial,sans-serif;opacity:0.75;margin-top:8px;">${specs}</div>` : ""}
        </div>
      </div>
    `;
  }

  /** Big and Bold: large centered uppercase heading + address + price + specs */
  function generateBigBoldLayout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const details = detailsText || getAustralianAddress(propertyData);
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const specs = buildSpecsText(propertyData);
    return `
      <div style="position:relative;width:100%;height:100%;font-family:Helvetica,Arial,sans-serif;color:white;">
        <div style="position:absolute;bottom:0;left:0;right:0;padding:80px 48px 60px;background:linear-gradient(to top,rgba(0,0,0,0.7),rgba(0,0,0,0.3),transparent);text-align:center;">
          <div style="font-size:72px;font-weight:900;letter-spacing:6px;text-transform:uppercase;margin-bottom:16px;">${title}</div>
          <div style="font-size:22px;font-weight:400;opacity:0.8;letter-spacing:2px;white-space:pre-line;">${details}</div>
          ${price ? `<div style="font-size:32px;font-weight:800;color:#f5c518;margin-top:12px;">${price}</div>` : ""}
          ${specs ? `<div style="font-size:20px;font-weight:600;opacity:0.7;margin-top:8px;">${specs}</div>` : ""}
        </div>
      </div>
    `;
  }

  /** White on Black: solid black bar at bottom, white centered text + price */
  function generateWhiteOnBlackLayout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const details = detailsText || getAustralianAddress(propertyData);
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const specs = buildSpecsText(propertyData);
    return `
      <div style="position:relative;width:100%;height:100%;font-family:Helvetica,Arial,sans-serif;color:white;">
        <div style="position:absolute;bottom:0;left:0;right:0;background:#000;padding:40px 48px;text-align:center;">
          <div style="font-size:44px;font-weight:800;letter-spacing:3px;text-transform:uppercase;margin-bottom:8px;">${title}</div>
          <div style="font-size:22px;font-weight:400;opacity:0.7;white-space:pre-line;">${details}</div>
          ${price ? `<div style="font-size:28px;font-weight:800;color:#f5c518;margin-top:8px;">${price}</div>` : ""}
          ${specs ? `<div style="font-size:18px;font-weight:600;opacity:0.6;margin-top:4px;">${specs}</div>` : ""}
        </div>
      </div>
    `;
  }

  /** Simple White: white bar at bottom, dark text centered + price */
  function generateSimpleWhiteLayout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const details = detailsText || getAustralianAddress(propertyData);
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const specs = buildSpecsText(propertyData);
    return `
      <div style="position:relative;width:100%;height:100%;font-family:Helvetica,Arial,sans-serif;">
        <div style="position:absolute;bottom:0;left:0;right:0;background:#fff;padding:40px 48px;text-align:center;">
          <div style="font-size:44px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#111;margin-bottom:8px;">${title}</div>
          <div style="font-size:22px;font-weight:400;color:#666;white-space:pre-line;">${details}</div>
          ${price ? `<div style="font-size:28px;font-weight:800;color:#111;margin-top:8px;">${price}</div>` : ""}
          ${specs ? `<div style="font-size:18px;font-weight:600;color:#888;margin-top:4px;">${specs}</div>` : ""}
        </div>
      </div>
    `;
  }

  /** Modern Treehouse: subtle bottom gradient, left-aligned text + price */
  function generateModernTreehouseLayout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const details = detailsText || getAustralianAddress(propertyData);
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const specs = buildSpecsText(propertyData);
    return `
      <div style="position:relative;width:100%;height:100%;font-family:Helvetica,Arial,sans-serif;color:white;">
        <div style="position:absolute;bottom:0;left:0;right:0;padding:60px 48px 48px;background:linear-gradient(to top,rgba(0,0,0,0.55),transparent);">
          <div style="font-size:44px;font-weight:600;letter-spacing:1px;margin-bottom:8px;">${title}</div>
          <div style="font-size:22px;font-weight:400;opacity:0.7;white-space:pre-line;">${details}</div>
          ${price ? `<div style="font-size:28px;font-weight:700;color:#f5c518;margin-top:8px;">${price}</div>` : ""}
          ${specs ? `<div style="font-size:18px;font-weight:600;opacity:0.65;margin-top:4px;">${specs}</div>` : ""}
        </div>
      </div>
    `;
  }

  /** Elegant Classic: centered serif heading, address, price, frosted specs pill */
  function generateElegantClassicLayout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const details = detailsText || getAustralianAddress(propertyData);
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const beds = propertyData.beds || 4;
    const baths = propertyData.baths || 3;
    const cars = propertyData.carSpaces || 2;
    const land = propertyData.landSize;

    const specsItems = [
      `<span style="margin:0 10px;">${beds} <img src="${ICON_URLS.bed}" style="width:20px;height:20px;vertical-align:middle;" /></span>`,
      `<span style="margin:0 10px;">${baths} <img src="${ICON_URLS.bath}" style="width:20px;height:20px;vertical-align:middle;" /></span>`,
      `<span style="margin:0 10px;">${cars} <img src="${ICON_URLS.car}" style="width:20px;height:20px;vertical-align:middle;" /></span>`,
    ].join("");

    const landHtml = land ? `<div style="background:rgba(255,255,255,0.25);backdrop-filter:blur(12px);border-radius:999px;padding:6px 16px;margin-top:8px;font-size:18px;font-weight:600;display:inline-block;">${land}m²</div>` : "";

    return `
      <div style="position:relative;width:100%;height:100%;font-family:Georgia,'Times New Roman',serif;color:white;text-align:center;">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:85%;">
          <div style="font-size:56px;font-style:italic;font-weight:700;margin-bottom:12px;text-shadow:2px 2px 8px rgba(0,0,0,0.7);">${title}</div>
          <div style="font-size:24px;font-weight:400;opacity:0.9;margin-bottom:8px;text-shadow:1px 1px 4px rgba(0,0,0,0.6);white-space:pre-line;">${details}</div>
          ${price ? `<div style="font-size:28px;font-weight:700;font-style:italic;margin-bottom:20px;text-shadow:1px 1px 4px rgba(0,0,0,0.6);">${price}</div>` : ""}
          <div style="display:inline-block;background:rgba(255,255,255,0.25);backdrop-filter:blur(12px);border-radius:999px;padding:10px 24px;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:600;">
            ${specsItems}
          </div>
          ${landHtml}
        </div>
      </div>
    `;
  }

  /** Modern Luxe (competitor style): large bold heading top-area, address, bottom bar with specs + price */
  function generateModernLuxeV2Layout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const details = detailsText || getAustralianAddress(propertyData);
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const beds = propertyData.beds || 4;
    const baths = propertyData.baths || 3;
    const cars = propertyData.carSpaces || 2;
    const land = propertyData.landSize;

    const specsText = [
      `${beds} <img src="${ICON_URLS.bed}" style="width:18px;height:18px;vertical-align:middle;margin-right:12px;" />`,
      `${baths} <img src="${ICON_URLS.bath}" style="width:18px;height:18px;vertical-align:middle;margin-right:12px;" />`,
      `${cars} <img src="${ICON_URLS.car}" style="width:18px;height:18px;vertical-align:middle;margin-right:12px;" />`,
      land ? `${land}m²` : "",
    ].filter(Boolean).join("");

    return `
      <div style="position:relative;width:100%;height:100%;font-family:Helvetica,Arial,sans-serif;color:white;">
        <div style="position:absolute;top:35%;left:40px;right:40px;">
          <div style="font-size:64px;font-weight:900;font-style:italic;text-shadow:3px 3px 10px rgba(0,0,0,0.7);">${title}</div>
          <div style="font-size:22px;font-weight:500;opacity:0.85;margin-top:10px;text-shadow:2px 2px 6px rgba(0,0,0,0.6);white-space:pre-line;">${details}</div>
        </div>
        <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,0.15);backdrop-filter:blur(8px);padding:20px 40px;display:flex;align-items:center;justify-content:space-between;">
          <div style="font-size:20px;font-weight:600;">${specsText}</div>
          ${price ? `<div style="font-size:26px;font-weight:800;">${price}</div>` : ""}
        </div>
      </div>
    `;
  }

  /** Minimal Focus (competitor style): centered uppercase heading, frosted glass address + price box */
  function generateMinimalFocusV2Layout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"]
  ): string {
    const details = detailsText || getAustralianAddress(propertyData);
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const specs = buildSpecsText(propertyData);
    return `
      <div style="position:relative;width:100%;height:100%;font-family:Helvetica,Arial,sans-serif;color:white;text-align:center;">
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:85%;">
          <div style="font-size:48px;font-weight:800;letter-spacing:4px;text-transform:uppercase;margin-bottom:20px;text-shadow:2px 2px 8px rgba(0,0,0,0.7);">${title}</div>
          <table style="margin:0 auto;"><tr><td style="
            border:1px solid rgba(255,255,255,0.4);
            background:rgba(255,255,255,0.1);
            backdrop-filter:blur(8px);
            padding:16px 32px;
            border-radius:6px;
            font-size:24px;
            font-weight:500;
            white-space:pre-line;
            line-height:1.5;
          ">${details}${price ? `<br/><span style="color:#f5c518;font-weight:800;font-size:28px;">${price}</span>` : ""}${specs ? `<br/><span style="font-size:18px;opacity:0.75;">${specs}</span>` : ""}</td></tr></table>
        </div>
      </div>
    `;
  }

  /** Warm Elegance: transparent dark vignette overlay with serif title, designed to sit on top of video clip */
  function generateWarmEleganceLayout(
    title: string,
    detailsText: string,
    propertyData: StitchVideoRequest["propertyData"],
    outputFormat: string = "portrait"
  ): string {
    const streetAddress = propertyData.streetAddress || "";
    const suburb = propertyData.suburb || "";
    const state = propertyData.state || "";
    const price = propertyData.price ? `$${formatPrice(propertyData.price)}` : "";
    const beds = propertyData.beds || 4;
    const baths = propertyData.baths || 3;
    const cars = propertyData.carSpaces || 2;
    const land = propertyData.landSize;

    if (outputFormat === "landscape") {
      const w = 1920;
      const h = 1080;
      return `
        <div style="position:relative;width:${w}px;height:${h}px;overflow:hidden;">
          <div style="position:absolute;top:0;left:0;width:${w}px;height:400px;background:linear-gradient(to bottom,rgba(0,0,0,0.40) 0%,rgba(0,0,0,0) 100%);"></div>
          <div style="position:absolute;bottom:0;left:0;width:${w}px;height:700px;background:linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.60) 40%,rgba(0,0,0,0) 100%);"></div>
          <div style="position:absolute;top:380px;left:0;width:${w}px;text-align:center;font-family:Georgia,serif;font-size:90px;font-weight:normal;font-style:italic;color:rgba(255,255,255,0.96);letter-spacing:1px;line-height:1.1;text-shadow:0 4px 24px rgba(0,0,0,0.5);">${title}</div>
          <div style="position:absolute;top:500px;left:0;width:${w}px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:normal;color:rgba(255,255,255,0.62);letter-spacing:5px;text-transform:uppercase;">${streetAddress}, ${suburb} ${state}</div>
          <div style="position:absolute;top:550px;left:0;width:${w}px;text-align:center;font-family:Georgia,serif;font-size:48px;font-weight:normal;color:rgba(255,255,255,0.90);letter-spacing:1px;text-shadow:0 2px 12px rgba(0,0,0,0.4);">${price}</div>
          <div style="position:absolute;top:620px;left:760px;width:400px;height:1px;background:rgba(255,255,255,0.15);"></div>
          <div style="position:absolute;bottom:140px;left:560px;width:800px;height:92px;background:rgba(0,0,0,0.35);border-radius:60px;border:1px solid rgba(255,255,255,0.16);backdrop-filter:blur(8px);">
            <img src="${ICON_URLS.bed}" style="position:absolute;top:28px;left:50px;width:36px;height:36px;opacity:0.78;" />
            <div style="position:absolute;top:26px;left:94px;font-family:Arial,Helvetica,sans-serif;font-size:30px;color:rgba(255,255,255,0.92);">${beds}</div>
            <div style="position:absolute;top:18px;left:140px;width:1px;height:56px;background:rgba(255,255,255,0.20);"></div>
            <img src="${ICON_URLS.bath}" style="position:absolute;top:28px;left:160px;width:36px;height:36px;opacity:0.78;" />
            <div style="position:absolute;top:26px;left:204px;font-family:Arial,Helvetica,sans-serif;font-size:30px;color:rgba(255,255,255,0.92);">${baths}</div>
            <div style="position:absolute;top:18px;left:250px;width:1px;height:56px;background:rgba(255,255,255,0.20);"></div>
            <img src="${ICON_URLS.car}" style="position:absolute;top:28px;left:270px;width:36px;height:36px;opacity:0.78;" />
            <div style="position:absolute;top:26px;left:314px;font-family:Arial,Helvetica,sans-serif;font-size:30px;color:rgba(255,255,255,0.92);">${cars}</div>
            ${land ? `
            <div style="position:absolute;top:18px;left:360px;width:1px;height:56px;background:rgba(255,255,255,0.20);"></div>
            <div style="position:absolute;top:26px;left:384px;font-family:Arial,Helvetica,sans-serif;font-size:26px;color:rgba(255,255,255,0.72);">${land}m²</div>
            ` : ""}
          </div>
        </div>
      `;
    }

    // Portrait (default) — transparent overlay with dark vignettes
    return `
      <div style="position:relative;width:1080px;height:1920px;overflow:hidden;">
        <div style="position:absolute;top:0;left:0;width:1080px;height:400px;background:linear-gradient(to bottom,rgba(0,0,0,0.40) 0%,rgba(0,0,0,0) 100%);"></div>
        <div style="position:absolute;bottom:0;left:0;width:1080px;height:1100px;background:linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.60) 40%,rgba(0,0,0,0) 100%);"></div>
        <div style="position:absolute;top:820px;left:0;width:1080px;text-align:center;font-family:Georgia,serif;font-size:108px;font-weight:normal;font-style:italic;color:rgba(255,255,255,0.96);letter-spacing:1px;line-height:1.1;text-shadow:0 4px 24px rgba(0,0,0,0.5);">${title}</div>
        <div style="position:absolute;top:958px;left:0;width:1080px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:normal;color:rgba(255,255,255,0.62);letter-spacing:5px;text-transform:uppercase;">${streetAddress}</div>
        <div style="position:absolute;top:1000px;left:0;width:1080px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:normal;color:rgba(255,255,255,0.42);letter-spacing:5px;text-transform:uppercase;">${suburb} ${state}</div>
        <div style="position:absolute;top:1066px;left:0;width:1080px;text-align:center;font-family:Georgia,serif;font-size:56px;font-weight:normal;color:rgba(255,255,255,0.90);letter-spacing:1px;text-shadow:0 2px 12px rgba(0,0,0,0.4);">${price}</div>
        <div style="position:absolute;top:1164px;left:340px;width:400px;height:1px;background:rgba(255,255,255,0.15);"></div>
        <div style="position:absolute;bottom:240px;left:140px;width:800px;height:92px;background:rgba(0,0,0,0.35);border-radius:60px;border:1px solid rgba(255,255,255,0.16);backdrop-filter:blur(8px);">
          <img src="${ICON_URLS.bed}" style="position:absolute;top:28px;left:50px;width:36px;height:36px;opacity:0.78;" />
          <div style="position:absolute;top:26px;left:94px;font-family:Arial,Helvetica,sans-serif;font-size:30px;color:rgba(255,255,255,0.92);">${beds}</div>
          <div style="position:absolute;top:18px;left:140px;width:1px;height:56px;background:rgba(255,255,255,0.20);"></div>
          <img src="${ICON_URLS.bath}" style="position:absolute;top:28px;left:160px;width:36px;height:36px;opacity:0.78;" />
          <div style="position:absolute;top:26px;left:204px;font-family:Arial,Helvetica,sans-serif;font-size:30px;color:rgba(255,255,255,0.92);">${baths}</div>
          <div style="position:absolute;top:18px;left:250px;width:1px;height:56px;background:rgba(255,255,255,0.20);"></div>
          <img src="${ICON_URLS.car}" style="position:absolute;top:28px;left:270px;width:36px;height:36px;opacity:0.78;" />
          <div style="position:absolute;top:26px;left:314px;font-family:Arial,Helvetica,sans-serif;font-size:30px;color:rgba(255,255,255,0.92);">${cars}</div>
          ${land ? `
          <div style="position:absolute;top:18px;left:360px;width:1px;height:56px;background:rgba(255,255,255,0.20);"></div>
          <div style="position:absolute;top:26px;left:384px;font-family:Arial,Helvetica,sans-serif;font-size:26px;color:rgba(255,255,255,0.72);">${land}m²</div>
          ` : ""}
        </div>
      </div>
    `;
  }

  /** Helper: build Australian-format address from property data */
  function getAustralianAddress(propertyData: StitchVideoRequest["propertyData"]): string {
    const parts: string[] = [];
    if (propertyData.streetAddress) parts.push(propertyData.streetAddress);
    const line2 = [propertyData.suburb, propertyData.state].filter(Boolean).join(" ");
    if (line2) parts.push(line2);
    if (parts.length > 0) return parts.join(",\n");
    return propertyData.address || "27 Alamanda Blvd,\nPoint Cook VIC 3030";
  }

  /**
   * Generate animated overlay as separate Shotstack tracks.
   * Each text element (heading, address line, property type, sale method)
   * becomes its own clip with staggered slide-in transitions — matching
   * how the competitor builds overlays in Shotstack Studio.
   *
   * Returns an array of track objects to spread into the timeline tracks array.
   */
  function generateAnimatedOverlayTracks(
    layout: string,
    customTitle: string | undefined,
    style: string | undefined,
    propertyData: any,
    detailsText: string | undefined,
    clipStart: number,
    clipLength: number,
    outputFormat: string
  ): any[] {
    const title = customTitle || (style && TEMPLATE_NAMES[style]) || "Open House";
    const isPortrait = outputFormat !== "landscape";
    const w = isPortrait ? 1080 : 1920;
    const h = isPortrait ? 1920 : 1080;

    // Build text elements from property data
    const elements: { text: string; style: string; delay: number }[] = [];

    // Street address (line 1)
    const street = propertyData.streetAddress || "";
    if (street) {
      elements.push({
        text: street.toUpperCase(),
        style: `font-family:Helvetica,Arial,sans-serif;color:white;font-size:${isPortrait ? 52 : 40}px;font-weight:900;letter-spacing:2px;text-transform:uppercase;`,
        delay: 0,
      });
    }

    // Suburb + State (line 2)
    const suburbLine = [propertyData.suburb, propertyData.state, propertyData.postcode]
      .filter(Boolean).join(" ").toUpperCase();
    if (suburbLine) {
      elements.push({
        text: suburbLine,
        style: `font-family:Helvetica,Arial,sans-serif;color:white;font-size:${isPortrait ? 32 : 24}px;font-weight:500;letter-spacing:1px;`,
        delay: 0.3,
      });
    }

    // Price (e.g. "$1,250,000")
    if (propertyData.price) {
      const priceNum = parseInt(propertyData.price.replace(/[^0-9]/g, ""));
      const formattedPrice = !isNaN(priceNum) ? `$${priceNum.toLocaleString("en-US")}` : `$${propertyData.price}`;
      elements.push({
        text: formattedPrice,
        style: `font-family:Helvetica,Arial,sans-serif;color:#f5c518;font-size:${isPortrait ? 44 : 34}px;font-weight:800;letter-spacing:1px;`,
        delay: 0.6,
      });
    }

    // Property specs (e.g. "3 Bed  •  2 Bath  •  2 Car  •  512m²")
    const specParts: string[] = [];
    if (propertyData.beds) specParts.push(`${propertyData.beds} Bed`);
    if (propertyData.baths) specParts.push(`${propertyData.baths} Bath`);
    if (propertyData.carSpaces) specParts.push(`${propertyData.carSpaces} Car`);
    if (propertyData.landSize) specParts.push(`${propertyData.landSize}m²`);
    if (specParts.length > 0) {
      elements.push({
        text: specParts.join("  •  "),
        style: `font-family:Helvetica,Arial,sans-serif;color:rgba(255,255,255,0.85);font-size:${isPortrait ? 26 : 20}px;font-weight:600;letter-spacing:1px;`,
        delay: 0.9,
      });
    }

    // Property type (e.g. "HOUSE", "APARTMENT")
    const propType = propertyData.propertyType || "";
    if (propType) {
      elements.push({
        text: propType.toUpperCase(),
        style: `font-family:Helvetica,Arial,sans-serif;color:rgba(255,255,255,0.8);font-size:${isPortrait ? 26 : 20}px;font-weight:500;letter-spacing:2px;`,
        delay: 1.2,
      });
    }

    // Sale method (e.g. "AUCTION", "FOR SALE")
    const saleMethod = propertyData.saleMethod || propertyData.listingType || "";
    if (saleMethod) {
      elements.push({
        text: saleMethod.toUpperCase(),
        style: `font-family:Helvetica,Arial,sans-serif;color:#f5c518;font-size:${isPortrait ? 28 : 22}px;font-weight:700;letter-spacing:2px;`,
        delay: 1.5,
      });
    }

    // Fallback: if no structured data, use the title + details + price as elements
    if (elements.length === 0) {
      elements.push({
        text: title.toUpperCase(),
        style: `font-family:Helvetica,Arial,sans-serif;color:white;font-size:${isPortrait ? 52 : 40}px;font-weight:900;letter-spacing:2px;text-transform:uppercase;`,
        delay: 0,
      });
      const details = detailsText || getAustralianAddress(propertyData);
      if (details) {
        elements.push({
          text: details,
          style: `font-family:Helvetica,Arial,sans-serif;color:rgba(255,255,255,0.85);font-size:${isPortrait ? 28 : 22}px;font-weight:500;`,
          delay: 0.3,
        });
      }
      if (propertyData.price) {
        const priceNum = parseInt(propertyData.price.replace(/[^0-9]/g, ""));
        const formattedPrice = !isNaN(priceNum) ? `$${priceNum.toLocaleString("en-US")}` : `$${propertyData.price}`;
        elements.push({
          text: formattedPrice,
          style: `font-family:Helvetica,Arial,sans-serif;color:#f5c518;font-size:${isPortrait ? 44 : 34}px;font-weight:800;letter-spacing:1px;`,
          delay: 0.6,
        });
      }
    }

    // Background banner track (dark overlay behind text area)
    const bannerHeight = isPortrait ? 520 : 320;
    const bgTrack = {
      clips: [{
        asset: {
          type: "html",
          html: `<div style="position:absolute;bottom:0;left:0;right:0;height:${bannerHeight}px;background:linear-gradient(to top,rgba(30,40,55,0.95),rgba(30,40,55,0.7),transparent);"></div>`,
          css: "",
          width: w,
          height: h,
        },
        start: clipStart,
        length: clipLength,
        transition: {
          in: "fade",
        },
      }],
    };

    // Text element tracks — each on its own track with staggered slide-in
    const textTracks = elements.map((el, i) => {
      // Stack text from bottom: first element highest up, last element at bottom
      const bottomOffset = isPortrait
        ? 0.06 + (elements.length - 1 - i) * 0.045
        : 0.08 + (elements.length - 1 - i) * 0.06;

      return {
        clips: [{
          asset: {
            type: "html",
            html: `<div style="position:absolute;bottom:${Math.round(bottomOffset * h)}px;left:48px;"><p style="${el.style}">${el.text}</p></div>`,
            css: "",
            width: w,
            height: h,
          },
          start: clipStart + el.delay,
          length: Math.max(clipLength - el.delay, 0.5),
          transition: {
            in: "slideLeft",
            out: "fade",
          },
        }],
      };
    });

    return [bgTrack, ...textTracks];
  }

  /**
   * Get the property overlay HTML based on selected template/layout
   */
  function getPropertyOverlayHtml(
    layout: string,
    customTitle: string | undefined,
    style: string | undefined,
    propertyData: StitchVideoRequest["propertyData"],
    detailsText?: string
  ): string {
    // Use custom title if provided, otherwise fall back to template name
    const title = customTitle || (style && TEMPLATE_NAMES[style]) || "Open House";
    const details = detailsText || "";

    // Route by template-specific layout id first
    switch (layout) {
      case "open-house":
        return generateOpenHouseLayout(title, details, propertyData);
      case "newly-listed":
        return generateNewlyListedLayout(title, details, propertyData);
      case "big-bold":
        return generateBigBoldLayout(title, details, propertyData);
      case "white-on-black":
        return generateWhiteOnBlackLayout(title, details, propertyData);
      case "simple-white":
        return generateSimpleWhiteLayout(title, details, propertyData);
      case "modern-treehouse":
        return generateModernTreehouseLayout(title, details, propertyData);
      case "elegant-classic":
        return generateElegantClassicLayout(title, details, propertyData);
      case "modern-luxe":
        return generateModernLuxeV2Layout(title, details, propertyData);
      case "minimal-focus":
        return generateMinimalFocusV2Layout(title, details, propertyData);
      case "warm-elegance":
        return generateWarmEleganceLayout(title, details, propertyData);
      case "none":
        return ""; // No overlay
      // Legacy layout ids
      case "bold-banner":
        return generateBoldBannerLayout(title, propertyData);
      default:
        return generateOpenHouseLayout(title, details, propertyData);
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
      // Parse body — supports both JSON and text/plain (CORS-preflight bypass mode).
      // When the frontend sends Content-Type: text/plain, the browser skips the
      // CORS preflight request entirely, avoiding Supabase gateway CORS/JWT issues.
      let rawBody: Record<string, unknown>;
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("text/plain")) {
        rawBody = JSON.parse(await req.text());
      } else {
        rawBody = await req.json();
      }

      // Lightweight auth guard — accept JWT from Authorization header OR body._jwt
      // (body._jwt is used in CORS-preflight bypass mode where no auth headers are sent).
      const authHeader = req.headers.get("authorization");
      const jwt = authHeader?.startsWith("Bearer ")
        ? authHeader.replace("Bearer ", "")
        : (rawBody._jwt as string | undefined);

      if (jwt) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const authClient = createClient(supabaseUrl, supabaseServiceKey);
        const { error: authError } = await authClient.auth.getUser(jwt);
        if (authError) {
          console.warn("[stitch-video] JWT verification failed:", authError.message, "— continuing anyway for internal calls");
        }
      }

      const { videoUrls, imageUrls, imageEffects, cameraAngles, clipDurations, propertyData, audioUrl, musicUrl, musicTrimStart, musicTrimEnd, agentInfo, style, layout, customTitle, detailsText, videoId, outputFormat, fallbackSlots, customIntroImage, customOutroImage } = rawBody as unknown as StitchVideoRequest;

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

      // Upload custom intro/outro images to storage if provided
      let customIntroUrl: string | null = null;
      let customOutroUrl: string | null = null;

      if (customIntroImage) {
        console.log("Uploading custom intro image to storage...");
        let ext = "png";
        if (customIntroImage.includes("data:image/jpeg") || customIntroImage.includes("data:image/jpg")) ext = "jpg";
        else if (customIntroImage.includes("data:image/webp")) ext = "webp";
        const introFileName = `custom-intro-${videoId || Date.now()}.${ext}`;
        customIntroUrl = await uploadBase64ToStorage(customIntroImage, introFileName, "custom-templates");
        console.log("Custom intro URL:", customIntroUrl);
      }

      if (customOutroImage) {
        console.log("Uploading custom outro image to storage...");
        let ext = "png";
        if (customOutroImage.includes("data:image/jpeg") || customOutroImage.includes("data:image/jpg")) ext = "jpg";
        else if (customOutroImage.includes("data:image/webp")) ext = "webp";
        const outroFileName = `custom-outro-${videoId || Date.now()}.${ext}`;
        customOutroUrl = await uploadBase64ToStorage(customOutroImage, outroFileName, "custom-templates");
        console.log("Custom outro URL:", customOutroUrl);
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
      const agentCardDuration = (customOutroUrl || (agentInfo && agentInfo.name)) ? 4 : 0; // Fixed 4s outro — enough to read CTA without dragging
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

          if (angle === "tracking" || angle === "orbit") {
            // Portrait 9:16 heavily crops wide-angle photos — increase pan range
            // so orbit reveals hidden content (e.g. kitchen beside the living room).
            const panTo = outputFormat === "landscape" ? -0.04 : -0.15;
            clip.offset = {
              x: [{ from: 0, to: panTo, start: 0, length: clipDuration,
                     interpolation: "bezier", easing: "easeInOutQuart" }]
            };
          } else if (angle === "pull-out" || angle === "drone-up" || angle === "crane-up") {
            clip.effect = "zoomOutSlow";
          } else if (angle === "push-in") {
            clip.effect = "zoomInSlow";
          } else if (angle === "static") {
            // No effect — locked shot
          } else {
            clip.effect = "zoomInSlow";
          }
          clip.transition = { in: "fade", out: "fade" };
        } else if (isFallbackSlot) {
          // Hybrid Fallback: failed AI clip → original image with user's camera motion
          // The tour must always finish — never break the sequence.
          const angle = cameraAngles?.[index] || "push-in";

          if (angle === "tracking" || angle === "orbit") {
            const panTo = outputFormat === "landscape" ? -0.04 : -0.15;
            clip.offset = {
              x: [{ from: 0, to: panTo, start: 0, length: clipDuration,
                     interpolation: "bezier", easing: "easeInOutQuart" }]
            };
          } else if (angle === "pull-out" || angle === "drone-up" || angle === "crane-up") {
            clip.effect = "zoomOutSlow";
          } else if (angle === "static") {
            // No effect — locked shot
          } else {
            clip.effect = "zoomInSlow";
          }
          clip.transition = { in: "fade", out: "fade" };
          console.log(`Clip ${index}: Hybrid fallback — using original image with camera motion "${angle}"`);
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
            volume: 0.2,
            ...(musicTrimStart ? { trim: musicTrimStart } : {}),
          } : undefined,
          // Note: custom fonts removed — Shotstack render fails if font URLs are inaccessible.
          // Shotstack's default sans-serif is used instead (matches Helvetica closely).
          fonts: [],
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

            // Custom outro image OR agent card tracks
            ...(customOutroUrl ? [{
              clips: [{
                asset: { type: "image", src: customOutroUrl },
                start: videoClipsDuration,
                length: agentCardDuration > 0 ? agentCardDuration : 4,
                fit: "cover",
                transition: { in: "fade" },
              }],
            }] : []),

            // Agent photo - Track 1 (TOP - separate image asset) — skip if custom outro
            ...(!customOutroUrl && agentPhotoUrl ? [{
              clips: [
                {
                  asset: {
                    type: "image",
                    src: agentPhotoUrl,
                  },
                  start: videoClipsDuration + 0.3,
                  length: agentCardDuration - 0.3,
                  position: "top",
                  offset: {
                    y: -0.15,
                  },
                  scale: 0.35,
                  fit: "contain",
                  transition: {
                    in: "fade",
                  },
                },
              ],
            }] : []),

            // Agent text details - Track 2 (HTML for text only, no images) — skip if custom outro
            ...(!customOutroUrl && agentInfo && agentInfo.name ? [{
              clips: [
                {
                  asset: {
                    type: "html",
                    html: `
                      <div style="
                        position: relative;
                        width: 100%;
                        height: 100%;
                        font-family: Helvetica, Arial, sans-serif;
                        color: white;
                      ">
                        <!-- Semi-transparent overlay for readability on blurred background -->
                        <div style="
                          position: absolute;
                          top: 0; left: 0; right: 0; bottom: 0;
                          background: rgba(0, 0, 0, 0.45);
                        "></div>

                        <!-- Agent info centered with photo space above -->
                        <div style="
                          position: absolute;
                          top: 55%;
                          left: 50%;
                          transform: translate(-50%, -50%);
                          text-align: center;
                          width: 85%;
                        ">
                          <div style="font-size: 44px; font-weight: 800; margin-bottom: 20px; letter-spacing: 1px; text-shadow: 2px 2px 6px rgba(0,0,0,0.8);">${agentInfo.name}</div>
                          ${agentInfo.phone ? `<div style="font-size: 32px; margin-bottom: 12px; font-weight: 500; opacity: 0.9; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${agentInfo.phone}</div>` : ''}
                          ${agentInfo.email ? `<div style="font-size: 28px; font-weight: 500; opacity: 0.85; text-shadow: 2px 2px 4px rgba(0,0,0,0.8);">${agentInfo.email}</div>` : ''}
                        </div>

                        <!-- CTA button at bottom -->
                        <div style="
                          position: absolute;
                          bottom: 180px;
                          left: 50%;
                          transform: translateX(-50%);
                          text-align: center;
                        ">
                          <table style="margin: 0 auto;"><tr><td style="
                            background: linear-gradient(135deg, #c8a84e, #e8c84e);
                            padding: 22px 60px;
                            border-radius: 12px;
                            font-size: 34px;
                            font-weight: 800;
                            color: #1a1a1a;
                            letter-spacing: 2px;
                            text-transform: uppercase;
                          ">Schedule a Showing</td></tr></table>
                        </div>
                      </div>
                    `,
                    css: "",
                    width: 1080,
                    height: 1920,
                  },
                  start: videoClipsDuration,
                  length: agentCardDuration,
                  transition: {
                    in: "fade",
                  },
                },
              ],
            }] : []),

            // Intro overlay: custom uploaded image OR animated HTML overlay
            ...(customIntroUrl ? [{
              clips: [{
                asset: { type: "image", src: customIntroUrl },
                start: 0,
                length: Math.max(effectiveDurations[0], 3.5),
                fit: "cover",
                transition: { in: "fade", out: "fade" },
              }],
            }] : [
              // Property details — animated multi-track overlay with staggered slide-ins
              ...generateAnimatedOverlayTracks(
                layout || "open-house",
                customTitle,
                style,
                propertyData,
                detailsText,
                0.1,
                Math.max(effectiveDurations[0] - 0.1, 0.5),
                outputFormat || "portrait"
              ),

              // Property specs icons track (bed, bath, car image icons)
              {
                clips: generatePropertySpecsClips(
                  layout || "modern-luxe",
                  propertyData,
                  0.1,
                  Math.max(effectiveDurations[0] - 0.1, 0.5)
                ),
              },
            ]),

            // Agent outro background - First clip/photo blurred (Track 3) — skip if custom outro
            ...(!customOutroUrl && agentInfo && agentInfo.name && sourceUrls[0] ? [{
              clips: [
                {
                  asset: isKenBurns || fallbackSet.has(0)
                    ? { type: "image", src: sourceUrls[0] }
                    : { type: "video", src: sourceUrls[0] },
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
          size: outputFormat === "landscape"
            ? { width: 1920, height: 1080 }
            : { width: 1080, height: 1920 },
          fps: 30,
          aspectRatio: outputFormat === "landscape" ? "16:9" : "9:16",
          quality: "high",
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

      // Validate all clip source URLs before submitting — prevent "missing image source" errors
      const downloadableTypes = new Set(["image", "video", "audio", "luma"]);
      for (const [trackIdx, track] of edit.timeline.tracks.entries()) {
        if (track && track.clips) {
          for (const [clipIdx, clip] of (track.clips as any[]).entries()) {
            const src = clip?.asset?.src;
            const assetType = clip?.asset?.type;
            if (downloadableTypes.has(assetType) && (!src || !src.startsWith("http"))) {
              console.error(`Invalid source URL at track ${trackIdx} clip ${clipIdx}: type=${assetType}, src=${String(src).substring(0, 80)}`);
              throw new Error(`Invalid or missing source URL at track ${trackIdx} clip ${clipIdx} (type: ${assetType}). URL: ${src ? String(src).substring(0, 80) : "empty"}`);
            }
          }
        }
      }
      // Log all source URLs for debugging
      console.log("=== Source URLs being sent to Shotstack ===");
      for (const [trackIdx, track] of edit.timeline.tracks.entries()) {
        if (track?.clips) {
          for (const [clipIdx, clip] of (track.clips as any[]).entries()) {
            if (clip?.asset?.src) {
              console.log(`  Track ${trackIdx} Clip ${clipIdx}: type=${clip.asset.type}, src=${String(clip.asset.src).substring(0, 100)}`);
            }
          }
        }
      }

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
