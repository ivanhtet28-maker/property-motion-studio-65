import { corsHeaders } from "../_shared/cors.ts";
// scrape-listing-images — Extracts high-resolution gallery images from
// realestate.com.au (REA) and domain.com.au listings.
//
// Strategy:
//   1. Identify the source site from the URL.
//   2. Use Scrapingdog with dynamic=true (headless browser) + country=au
//      to execute JS-heavy galleries and bypass bot detection.
//   3. Parse the HTML for gallery image URLs using site-specific strategies:
//      - REA: window.ArgonautExchange JSON blob, og:image meta, gallery data-src
//      - Domain: photo gallery component, listing-details__gallery, og:image meta
//   4. De-duplicate and filter to high-res URLs only.
//   5. Return all found image URLs (the frontend handles selection of up to 10).

const SCRAPINGDOG_API_KEY = Deno.env.get("SCRAPINGDOG_API_KEY") || "";
const SCRAPINGDOG_API_BASE = "https://api.scrapingdog.com/scrape";


// ── Site Detection ───────────────────────────────────────────────────────────

type ListingSite = "rea" | "domain";

function detectSite(url: string): ListingSite | null {
  const lower = url.toLowerCase();
  if (lower.includes("realestate.com.au")) return "rea";
  if (lower.includes("domain.com.au")) return "domain";
  return null;
}

// ── Headless Fetch via Scrapingdog ──────────────────────────────────────────

async function fetchRenderedHtml(url: string): Promise<string> {
  if (!SCRAPINGDOG_API_KEY) {
    throw new Error("SCRAPINGDOG_API_KEY environment variable not set");
  }

  const scraperUrl = new URL(SCRAPINGDOG_API_BASE);
  scraperUrl.searchParams.set("api_key", SCRAPINGDOG_API_KEY);
  scraperUrl.searchParams.set("url", url);
  scraperUrl.searchParams.set("dynamic", "true");
  scraperUrl.searchParams.set("country", "au");

  console.log("[scrape-listing-images] Fetching via Scrapingdog:", url);

  const response = await fetch(scraperUrl.toString(), {
    signal: AbortSignal.timeout(60_000), // 60s timeout for JS-heavy pages
  });

  if (!response.ok) {
    throw new Error(
      `Scrapingdog error: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

// ── REA (realestate.com.au) Image Extraction ─────────────────────────────────

function extractReaImages(html: string): string[] {
  const urls = new Set<string>();

  // Strategy 1: ArgonautExchange JSON — REA embeds structured listing data in
  // a <script> tag containing window.ArgonautExchange. The JSON includes image
  // objects with templatedUrl fields.
  const argonautMatch = html.match(
    /window\.ArgonautExchange\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/
  );
  if (argonautMatch) {
    try {
      const json = JSON.parse(argonautMatch[1]);
      const jsonStr = JSON.stringify(json);
      // templatedUrl pattern: "https://bucket-api.domain/v1/…/image.jpg"
      const templateMatches = jsonStr.matchAll(
        /"templatedUrl"\s*:\s*"([^"]+)"/g
      );
      for (const m of templateMatches) {
        let imgUrl = m[1]
          .replace(/\\u002F/g, "/")
          .replace(/\\\//g, "/");
        // Replace size template with high-res dimensions
        imgUrl = imgUrl.replace(/\{size\}/g, "1600x1200");
        if (imgUrl.startsWith("http")) urls.add(imgUrl);
      }

      // Also look for photoUrl / server patterns in the JSON
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

  // Strategy 2: Open Graph and meta image tags (cover image)
  const ogMatches = html.matchAll(
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/gi
  );
  for (const m of ogMatches) {
    if (m[1].startsWith("http")) urls.add(m[1]);
  }

  // Strategy 3: Gallery <img> tags with reastatic.net or high-res src
  const imgMatches = html.matchAll(
    /<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+reastatic\.net[^"]+)"/gi
  );
  for (const m of imgMatches) {
    const imgUrl = m[1];
    // Skip tiny thumbnails, logos, icons
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

  // Strategy 4: Background-image CSS inline styles with reastatic URLs
  const bgMatches = html.matchAll(
    /background-image:\s*url\(["']?(https?:\/\/[^"')]+reastatic\.net[^"')]+)["']?\)/gi
  );
  for (const m of bgMatches) {
    urls.add(m[1]);
  }

  return [...urls];
}

// ── Domain.com.au Image Extraction ───────────────────────────────────────────

function extractDomainImages(html: string): string[] {
  const urls = new Set<string>();

  // Strategy 1: __NEXT_DATA__ or similar JSON blobs embedded by Domain's React/Next.js app
  const nextDataMatch = html.match(
    /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (nextDataMatch) {
    try {
      const json = JSON.parse(nextDataMatch[1]);
      const jsonStr = JSON.stringify(json);
      // Domain image CDN patterns
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

  // Strategy 3: Photo gallery component — Domain's gallery uses <img> tags
  // with domainstatic.com.au CDN URLs
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

  // Strategy 4: Any generic high-res listing images from bucket-api
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

  return [...urls];
}

// ── Image Quality Filter ─────────────────────────────────────────────────────
// Remove thumbnails, duplicates with different size params, floor plans, etc.

function filterHighResImages(urls: string[]): string[] {
  const seen = new Set<string>();
  const filtered: string[] = [];

  for (const url of urls) {
    // Normalise URL: strip query params for dedup but keep original for output
    const base = url.split("?")[0];

    // Skip obvious non-property images
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

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "URL is required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid URL format",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Detect site
    const site = detectSite(url);
    if (!site) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Unsupported website. Please use a link from realestate.com.au or domain.com.au.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[scrape-listing-images] Site: ${site}, URL: ${url}`);

    // Fetch rendered HTML via headless browser (Scrapingdog)
    const html = await fetchRenderedHtml(url);
    console.log(`[scrape-listing-images] HTML length: ${html.length}`);

    // Extract images using site-specific strategy
    const rawImages =
      site === "rea" ? extractReaImages(html) : extractDomainImages(html);

    console.log(
      `[scrape-listing-images] Raw images found: ${rawImages.length}`
    );

    // Filter to high-res property images only
    const images = filterHighResImages(rawImages);

    console.log(
      `[scrape-listing-images] After filtering: ${images.length} images`
    );

    if (images.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Listing could not be reached. Please check the URL or upload photos manually.",
        }),
        {
          status: 200, // 200 so the frontend doesn't get a network error
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        images,
        site,
        totalFound: images.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[scrape-listing-images] Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Listing could not be reached. Please check the URL or upload photos manually.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
