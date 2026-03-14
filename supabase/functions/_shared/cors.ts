/**
 * Shared CORS headers for all edge functions.
 *
 * Set the ALLOWED_ORIGIN secret in your Supabase project to a comma-separated
 * list of allowed origins (e.g. "https://propertymotion.app,https://propertymotion.com.au").
 * Falls back to "*" for local development when no origin is configured.
 */
const ALLOWED_ORIGINS_RAW = Deno.env.get("ALLOWED_ORIGIN") || "*";
const ALLOWED_ORIGINS = ALLOWED_ORIGINS_RAW === "*"
  ? null // null means allow all
  : ALLOWED_ORIGINS_RAW.split(",").map((o) => o.trim()).filter(Boolean);

/**
 * Return CORS headers that reflect the request's Origin when it matches
 * the allowlist. Also matches Vercel preview URLs (*.vercel.app).
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  let origin = "*";

  if (req && ALLOWED_ORIGINS) {
    const requestOrigin = req.headers.get("origin") || "";
    const isAllowed =
      ALLOWED_ORIGINS.includes(requestOrigin) ||
      requestOrigin.endsWith(".vercel.app");
    origin = isAllowed ? requestOrigin : ALLOWED_ORIGINS[0];
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

/**
 * Static CORS headers (backwards-compatible).
 * Uses "*" when ALLOWED_ORIGIN is not set, or the first origin in the list.
 * Prefer getCorsHeaders(req) for proper multi-origin support.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS ? ALLOWED_ORIGINS[0] : "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
