// Scrapingdog Integration for Property Image Scraping
// Supports: realestate.com.au (REA), Domain.com.au, Realtor.com.au
//
// Two modes:
//   default       — full scrape: extract property data + upload images to storage + DB records
//   "images-only" — lightweight: extract gallery image URLs only, return them directly (no DB, no upload)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCRAPINGDOG_API_KEY = Deno.env.get("SCRAPINGDOG_API_KEY") || "";
const SCRAPINGDOG_API_BASE = "https://api.scrapingdog.com/scrape";

const ALLOWED_ORIGIN = (Deno.env.get("CORS_ALLOWED_ORIGIN") || "*").replace(/\/+$/, "");
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScrapedProperty {
  address: string;
  suburb?: string;
  state?: string;
  postcode?: string;
  price?: string;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  landSize?: string;
  features?: string[];
  description?: string;
  imageUrls: string[];
  sourceUrl: string;
  sourceWebsite: string;
  listingId?: string;
}

// ── Site Detection ───────────────────────────────────────────────────────────

function detectWebsite(url: string): string {
  if (url.includes("realestate.com.au")) return "realestate.com.au";
  if (url.includes("domain.com.au")) return "domain.com.au";
  if (url.includes("realtor.com.au")) return "realtor.com.au";
  return "unknown";
}

// Extract listing ID from URL
function extractListingId(url: string, website: string): string | undefined {
  try {
    if (website === "realestate.com.au") {
      // Example: https://www.realestate.com.au/property-house-vic-point+cook-149102400
      const match = url.match(/-(\d+)(?:\?|$)/);
      return match ? match[1] : undefined;
    } else if (website === "domain.com.au") {
      const match = url.match(/-(\d+)$/);
      return match ? match[1] : undefined;
    } else if (website === "realtor.com.au") {
      const match = url.match(/property\/(\d+)/);
      return match ? match[1] : undefined;
    }
  } catch (e) {
    console.error("Error extracting listing ID:", e);
  }
  return undefined;
}

// ── Direct Fetch (no Scrapingdog — free fallback) ────────────────────────────

async function directFetch(url: string): Promise<string> {
  console.log("Attempting direct fetch for:", url);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-AU,en-US;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Direct fetch error: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

// ── Headless Fetch via Scrapingdog ──────────────────────────────────────────

async function scrapePropertyData(url: string): Promise<string> {
  // Strategy 1: Try Scrapingdog if key is available
  if (SCRAPINGDOG_API_KEY) {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const scraperUrl = new URL(SCRAPINGDOG_API_BASE);
        scraperUrl.searchParams.set("api_key", SCRAPINGDOG_API_KEY);
        scraperUrl.searchParams.set("url", url);
        scraperUrl.searchParams.set("dynamic", "true");
        scraperUrl.searchParams.set("country", "au");

        if (attempt > 0) {
          scraperUrl.searchParams.set("session_number", String(Date.now()));
          console.log(`Retrying Scrapingdog (attempt ${attempt + 1}) for:`, url);
        } else {
          console.log("Calling Scrapingdog for:", url);
        }

        const response = await fetch(scraperUrl.toString(), {
          signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          console.error(`Scrapingdog error (attempt ${attempt + 1}):`, response.status, errorBody);
          throw new Error(`Scrapingdog error: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        if (html.length > 1000) {
          console.log("Scrapingdog succeeded, HTML length:", html.length);
          return html;
        }
        throw new Error("Scrapingdog returned insufficient HTML");
      } catch (e) {
        lastError = e;
        console.warn(`Scrapingdog attempt ${attempt + 1} failed:`, e.message);
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    console.warn("Scrapingdog failed, falling back to direct fetch. Last error:", lastError?.message);
  } else {
    console.log("No SCRAPINGDOG_API_KEY set, using direct fetch");
  }

  // Strategy 2: Direct fetch fallback (works for REA server-rendered pages)
  return await directFetch(url);
}

// ── REA (realestate.com.au) Image Extraction ─────────────────────────────────

function extractReaImages(html: string): string[] {
  const urls = new Set<string>();

  // Strategy 1: ArgonautExchange JSON — REA embeds structured listing data in
  // a <script> tag containing window.ArgonautExchange with templatedUrl fields.
  const argonautMatch = html.match(
    /window\.ArgonautExchange\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/
  );
  if (argonautMatch) {
    try {
      const json = JSON.parse(argonautMatch[1]);
      const jsonStr = JSON.stringify(json);
      const templateMatches = jsonStr.matchAll(
        /"templatedUrl"\s*:\s*"([^"]+)"/g
      );
      for (const m of templateMatches) {
        let imgUrl = m[1]
          .replace(/\\u002F/g, "/")
          .replace(/\\\//g, "/");
        imgUrl = imgUrl.replace(/\{size\}/g, "1600x1200");
        if (imgUrl.startsWith("http")) urls.add(imgUrl);
      }

      const photoMatches = jsonStr.matchAll(
        /"(?:server|baseUrl|photoUrl)"\s*:\s*"(https?:\/\/[^"]+)"/g
      );
      for (const m of photoMatches) {
        const imgUrl = m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
        if (
          imgUrl.includes("i2.au.reastatic.net") ||
          imgUrl.includes("i4.au.reastatic.net") ||
          imgUrl.includes("bucket-api.domain")
        ) {
          urls.add(imgUrl);
        }
      }
    } catch (e) {
      console.warn("[REA] Failed to parse ArgonautExchange JSON:", e);
    }
  }

  // Strategy 2: Open Graph meta tags (cover image)
  const ogMatches = html.matchAll(
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi
  );
  for (const m of ogMatches) {
    if (m[1].startsWith("http")) urls.add(m[1]);
  }
  // Also check content before property (attribute order varies)
  const ogMatches2 = html.matchAll(
    /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/gi
  );
  for (const m of ogMatches2) {
    if (m[1].startsWith("http")) urls.add(m[1]);
  }

  // Strategy 3: Gallery <img> tags with reastatic.net
  const imgMatches = html.matchAll(
    /<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+reastatic\.net[^"]+)"/gi
  );
  for (const m of imgMatches) {
    const imgUrl = m[1];
    if (
      !imgUrl.includes("logo") &&
      !imgUrl.includes("icon") &&
      !imgUrl.includes("avatar") &&
      !imgUrl.includes("agent") &&
      !imgUrl.includes("1x1")
    ) {
      urls.add(imgUrl);
    }
  }

  // Strategy 4: Background images with reastatic URLs
  const bgMatches = html.matchAll(
    /background-image:\s*url\(["']?(https?:\/\/[^"')]+reastatic\.net[^"')]+)["']?\)/gi
  );
  for (const m of bgMatches) {
    urls.add(m[1]);
  }

  // Strategy 5: Any src containing reastatic that we might have missed
  const allReaMatches = html.matchAll(
    /["'](https?:\/\/[^"']+reastatic\.net\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi
  );
  for (const m of allReaMatches) {
    const imgUrl = m[1];
    if (
      !imgUrl.includes("logo") &&
      !imgUrl.includes("icon") &&
      !imgUrl.includes("avatar") &&
      !imgUrl.includes("agent")
    ) {
      urls.add(imgUrl);
    }
  }

  return [...urls];
}

// ── REA Property Data Extraction ─────────────────────────────────────────────

function parseReaAu(html: string, sourceUrl: string): ScrapedProperty {
  const imageUrls = extractReaImages(html);

  let price = "";
  const priceMatch = html.match(/<[^>]*price[^>]*>([^<]*\$[^<]+)<\/[^>]*>/i) ||
    html.match(/\$[\d,]+(?:\.\d+)?\s*(?:million|k)?/i);
  if (priceMatch) price = priceMatch[1] || priceMatch[0];

  let address = "";
  const addressMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (addressMatch) address = addressMatch[1].trim();

  const bedroomsMatch = html.match(/(\d+)\s*(?:bed|bedroom)/i);
  const bathroomsMatch = html.match(/(\d+)\s*(?:bath|bathroom)/i);
  const parkingMatch = html.match(/(\d+)\s*(?:car|parking|garage)/i);

  let landSize = "";
  const landMatch = html.match(/(\d+(?:,\d+)?)\s*(?:m²|sqm|square metre)/i);
  if (landMatch) landSize = landMatch[1] + " m²";

  return {
    address,
    price,
    bedrooms: bedroomsMatch ? parseInt(bedroomsMatch[1]) : undefined,
    bathrooms: bathroomsMatch ? parseInt(bathroomsMatch[1]) : undefined,
    parking: parkingMatch ? parseInt(parkingMatch[1]) : undefined,
    landSize,
    imageUrls: [...new Set(imageUrls)],
    sourceUrl,
    sourceWebsite: "realestate.com.au",
    listingId: extractListingId(sourceUrl, "realestate.com.au"),
  };
}

// ── Domain.com.au Image Extraction ───────────────────────────────────────────

function extractDomainImages(html: string): string[] {
  const urls = new Set<string>();

  // Strategy 1: __NEXT_DATA__ JSON blob
  const nextDataMatch = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const jsonStr = JSON.stringify(json);
      const cdnMatches = jsonStr.matchAll(
        /"(https?:\/\/(?:rimh2\.domainstatic\.com\.au|bucket-api\.domain\.com\.au)[^"]+)"/g
      );
      for (const m of cdnMatches) {
        const imgUrl = m[1].replace(/\\u002F/g, "/").replace(/\\\//g, "/");
        if (
          !imgUrl.includes("logo") &&
          !imgUrl.includes("icon") &&
          !imgUrl.includes("avatar")
        ) {
          urls.add(imgUrl);
        }
      }
    } catch (e) {
      console.warn("[Domain] Failed to parse __NEXT_DATA__:", e);
    }
  }

  // Strategy 2: Open Graph meta tags
  const ogMatches = html.matchAll(
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi
  );
  for (const m of ogMatches) {
    if (m[1].startsWith("http")) urls.add(m[1]);
  }
  const ogMatches2 = html.matchAll(
    /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/gi
  );
  for (const m of ogMatches2) {
    if (m[1].startsWith("http")) urls.add(m[1]);
  }

  // Strategy 3: Gallery <img> tags with domainstatic CDN
  const imgMatches = html.matchAll(
    /<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+domainstatic\.com\.au[^"]+)"/gi
  );
  for (const m of imgMatches) {
    const imgUrl = m[1];
    if (
      !imgUrl.includes("logo") &&
      !imgUrl.includes("icon") &&
      !imgUrl.includes("avatar") &&
      !imgUrl.includes("agent")
    ) {
      urls.add(imgUrl);
    }
  }

  // Strategy 4: bucket-api.domain.com.au images
  const bucketMatches = html.matchAll(
    /<img[^>]+(?:data-src|src)="(https?:\/\/bucket-api\.domain\.com\.au[^"]+)"/gi
  );
  for (const m of bucketMatches) {
    urls.add(m[1]);
  }

  // Strategy 5: Background images from Domain CDN
  const bgMatches = html.matchAll(
    /background-image:\s*url\(["']?(https?:\/\/[^"')]+domainstatic\.com\.au[^"')]+)["']?\)/gi
  );
  for (const m of bgMatches) {
    urls.add(m[1]);
  }

  // Strategy 6: Catch-all for domainstatic image URLs in any attribute
  const allDomainMatches = html.matchAll(
    /["'](https?:\/\/[^"']+domainstatic\.com\.au\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi
  );
  for (const m of allDomainMatches) {
    const imgUrl = m[1];
    if (
      !imgUrl.includes("logo") &&
      !imgUrl.includes("icon") &&
      !imgUrl.includes("avatar") &&
      !imgUrl.includes("agent")
    ) {
      urls.add(imgUrl);
    }
  }

  return [...urls];
}

// Parse Domain.com.au HTML (full property data)
function parseDomainAu(html: string, sourceUrl: string): ScrapedProperty {
  const imageUrls = extractDomainImages(html);
  const features: string[] = [];

  let price = "";
  const priceMatch = html.match(/<[^>]*price[^>]*>([^<]*\$[^<]+)<\/[^>]*>/i) ||
    html.match(/\$[\d,]+(?:\.\d+)?\s*(?:million|k)?/i);
  if (priceMatch) price = priceMatch[1] || priceMatch[0];

  let address = "";
  const addressMatch = html.match(/<h1[^>]*>([^<]*(?:\d+\s+)?[^<]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Lane|Ln)[^<]*)<\/h1>/i);
  if (addressMatch) address = addressMatch[1].trim();

  const bedroomsMatch = html.match(/(\d+)\s*(?:bed|bedroom)/i);
  const bathroomsMatch = html.match(/(\d+)\s*(?:bath|bathroom)/i);
  const parkingMatch = html.match(/(\d+)\s*(?:car|parking|garage)/i);

  let landSize = "";
  const landMatch = html.match(/(\d+(?:,\d+)?)\s*(?:m²|sqm|square metre)/i);
  if (landMatch) landSize = landMatch[1] + " m²";

  const featureMatches = html.matchAll(/<li[^>]*feature[^>]*>([^<]+)<\/li>/gi);
  for (const fm of featureMatches) {
    features.push(fm[1].trim());
  }

  let description = "";
  const descMatch = html.match(/<div[^>]*description[^>]*>([^<]+(?:<[^>]+>[^<]*)*?)<\/div>/i);
  if (descMatch) {
    description = descMatch[1].replace(/<[^>]+>/g, "").trim();
  }

  return {
    address,
    price,
    bedrooms: bedroomsMatch ? parseInt(bedroomsMatch[1]) : undefined,
    bathrooms: bathroomsMatch ? parseInt(bathroomsMatch[1]) : undefined,
    parking: parkingMatch ? parseInt(parkingMatch[1]) : undefined,
    landSize,
    features: features.length > 0 ? features : undefined,
    description,
    imageUrls: [...new Set(imageUrls)],
    sourceUrl,
    sourceWebsite: "domain.com.au",
    listingId: extractListingId(sourceUrl, "domain.com.au"),
  };
}

// Parse Realtor.com.au HTML
function parseRealtorAu(html: string, sourceUrl: string): ScrapedProperty {
  const imageUrls: string[] = [];
  const features: string[] = [];

  const imageRegex = /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = imageRegex.exec(html)) !== null) {
    const imgUrl = match[1];
    if (imgUrl && imgUrl.startsWith("http")) {
      if (!imgUrl.includes("logo") && !imgUrl.includes("icon") && !imgUrl.includes("avatar")) {
        imageUrls.push(imgUrl);
      }
    }
  }

  let price = "";
  const priceMatch = html.match(/<span[^>]*price[^>]*>([^<]*\$[^<]+)<\/span>/i) ||
    html.match(/\$[\d,]+/);
  if (priceMatch) price = priceMatch[1] || priceMatch[0];

  let address = "";
  const addressMatch = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  if (addressMatch) address = addressMatch[1].trim();

  const bedroomsMatch = html.match(/(\d+)\s*bed/i);
  const bathroomsMatch = html.match(/(\d+)\s*bath/i);
  const parkingMatch = html.match(/(\d+)\s*car/i);

  let landSize = "";
  const landMatch = html.match(/(\d+)\s*m²/i);
  if (landMatch) landSize = landMatch[1] + " m²";

  return {
    address,
    price,
    bedrooms: bedroomsMatch ? parseInt(bedroomsMatch[1]) : undefined,
    bathrooms: bathroomsMatch ? parseInt(bathroomsMatch[1]) : undefined,
    parking: parkingMatch ? parseInt(parkingMatch[1]) : undefined,
    landSize,
    features: features.length > 0 ? features : undefined,
    imageUrls: [...new Set(imageUrls)],
    sourceUrl,
    sourceWebsite: "realtor.com.au",
    listingId: extractListingId(sourceUrl, "realtor.com.au"),
  };
}

// Parse scraped HTML based on website
function parsePropertyHtml(html: string, url: string, website: string): ScrapedProperty {
  if (website === "realestate.com.au") {
    return parseReaAu(html, url);
  } else if (website === "domain.com.au") {
    return parseDomainAu(html, url);
  } else if (website === "realtor.com.au") {
    return parseRealtorAu(html, url);
  }
  throw new Error(`Unsupported website: ${website}`);
}

// ── Image Quality Filter ─────────────────────────────────────────────────────

function filterHighResImages(urls: string[]): string[] {
  const seen = new Set<string>();
  const filtered: string[] = [];

  for (const url of urls) {
    const base = url.split("?")[0];

    if (
      base.includes("floorplan") ||
      base.includes("floor-plan") ||
      base.includes("map") ||
      base.includes("streetview") ||
      base.includes("logo") ||
      base.includes("branding")
    ) {
      continue;
    }

    // Skip tiny thumbnails (e.g. 100x75, 120x90)
    const sizeMatch = base.match(/(\d+)x(\d+)/);
    if (sizeMatch) {
      const w = parseInt(sizeMatch[1]);
      const h = parseInt(sizeMatch[2]);
      if (w < 400 || h < 300) continue;
    }

    if (!seen.has(base)) {
      seen.add(base);
      filtered.push(url);
    }
  }

  return filtered;
}

// Upload image to Supabase Storage
async function uploadImageToStorage(
  supabase: SupabaseClient,
  imageUrl: string,
  userId: string,
  index: number
): Promise<string | null> {
  try {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) return null;

    const imageBlob = await imageResponse.blob();
    const fileExt = imageUrl.split(".").pop()?.split("?")[0] || "jpg";
    const fileName = `${userId}/${Date.now()}_${index}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from("property-images")
      .upload(fileName, imageBlob, {
        contentType: imageBlob.type || "image/jpeg",
        cacheControl: "3600",
      });

    if (error) {
      console.error("Storage upload error:", error);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("property-images")
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (e) {
    console.error("Error uploading image:", e);
    return null;
  }
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { url, userId, mode } = body;

    if (!url) {
      throw new Error("Property URL is required");
    }

    // Detect website
    const website = detectWebsite(url);
    if (website === "unknown") {
      if (mode === "images-only") {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Listing could not be reached. Please check the URL or upload photos manually.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error("Unsupported property website. Supported: realestate.com.au, Domain.com.au, Realtor.com.au");
    }

    console.log(`Scraping property from: ${website} (mode: ${mode || "full"})`);

    // Scrape the property page
    const html = await scrapePropertyData(url);
    console.log(`HTML length: ${html.length}`);

    // ── "images-only" mode ─────────────────────────────────────────────────
    // Lightweight path: extract gallery images, filter, return directly.
    // No DB writes, no image uploads to storage.
    if (mode === "images-only") {
      let rawImages: string[];
      if (website === "realestate.com.au") {
        rawImages = extractReaImages(html);
      } else if (website === "domain.com.au") {
        rawImages = extractDomainImages(html);
      } else {
        // Realtor fallback — use the generic img extraction
        const parsed = parseRealtorAu(html, url);
        rawImages = parsed.imageUrls;
      }

      console.log(`Raw images found: ${rawImages.length}`);
      const images = filterHighResImages(rawImages);
      console.log(`After filtering: ${images.length} images`);

      if (images.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Listing could not be reached. Please check the URL or upload photos manually.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          images,
          site: website,
          totalFound: images.length,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Full scrape mode (default — original behaviour) ────────────────────

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create scraping job record
    const { data: scrapingJob, error: jobError } = await supabase
      .from("scraping_jobs")
      .insert({
        user_id: userId,
        source_url: url,
        source_website: website,
        status: "in_progress",
      })
      .select()
      .single();

    if (jobError) {
      console.error("Error creating scraping job:", jobError);
    }

    // Parse property data
    const propertyData = parsePropertyHtml(html, url, website);

    console.log(`Found ${propertyData.imageUrls.length} images`);

    // Upload images to Supabase Storage
    const uploadedImageUrls: string[] = [];
    for (let i = 0; i < Math.min(propertyData.imageUrls.length, 20); i++) {
      const imageUrl = propertyData.imageUrls[i];
      const uploadedUrl = await uploadImageToStorage(supabase, imageUrl, userId || "anonymous", i);
      if (uploadedUrl) {
        uploadedImageUrls.push(uploadedUrl);
      }
    }

    console.log(`Successfully uploaded ${uploadedImageUrls.length} images`);

    // Create property record
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .insert({
        user_id: userId,
        address: propertyData.address,
        suburb: propertyData.suburb,
        state: propertyData.state,
        postcode: propertyData.postcode,
        price: propertyData.price,
        bedrooms: propertyData.bedrooms,
        bathrooms: propertyData.bathrooms,
        parking: propertyData.parking,
        land_size: propertyData.landSize,
        features: propertyData.features,
        description: propertyData.description,
        source_url: propertyData.sourceUrl,
        source_website: propertyData.sourceWebsite,
        listing_id: propertyData.listingId,
        image_urls: uploadedImageUrls,
      })
      .select()
      .single();

    if (propertyError) {
      console.error("Error creating property:", propertyError);
    }

    // Update scraping job
    if (scrapingJob) {
      await supabase
        .from("scraping_jobs")
        .update({
          status: "completed",
          images_found: propertyData.imageUrls.length,
          images_scraped: uploadedImageUrls,
          property_data: propertyData,
          completed_at: new Date().toISOString(),
        })
        .eq("id", scrapingJob.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        property: {
          ...propertyData,
          imageUrls: uploadedImageUrls,
          propertyId: property?.id,
        },
        imagesScraped: uploadedImageUrls.length,
        totalImagesFound: propertyData.imageUrls.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Scraping error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
