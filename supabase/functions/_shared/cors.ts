/**
 * Shared CORS headers for all edge functions.
 *
 * Set the ALLOWED_ORIGIN secret in your Supabase project to your production
 * domain (e.g. "https://propertymotion.com.au"). Falls back to "*" for local
 * development when no origin is configured.
 */
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
