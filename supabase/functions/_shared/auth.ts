import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";

/**
 * Verify the caller's Supabase JWT and return the authenticated user.
 *
 * Usage:
 *   const { user, error } = await requireAuth(req);
 *   if (error) return error;  // 401 Response already built
 *   // user is now the authenticated Supabase user
 */
export async function requireAuth(req: Request): Promise<{
  user: { id: string; email?: string } | null;
  error: Response | null;
}> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      user: null,
      error: new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  const jwt = authHeader.replace("Bearer ", "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Allow service-role key for server-to-server calls between edge functions
  if (jwt === supabaseServiceKey) {
    return { user: { id: "service-role" }, error: null };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) {
    return {
      user: null,
      error: new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  return { user, error: null };
}

/**
 * Validate that a URL is safe to fetch (SSRF protection).
 * Only allows HTTPS URLs to known-safe domains.
 */
const ALLOWED_IMAGE_HOSTS = new Set([
  // Supabase storage
  "supabase.co",
  "supabase.com",
  // Real estate listing CDNs
  "reastatic.net",
  "domainstatic.com.au",
  "domain.com.au",
  // Common image CDNs
  "cloudinary.com",
  "imgix.net",
  "cloudfront.net",
  "googleapis.com",
  "ggpht.com",
]);

export function validateImageUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Only HTTPS URLs are allowed" };
  }

  // Block private/internal IPs
  const hostname = parsed.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("172.") ||
    hostname === "169.254.169.254" || // AWS metadata
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { valid: false, error: "Internal URLs are not allowed" };
  }

  // Check against allowlist — match domain suffix
  const matchesAllowed = [...ALLOWED_IMAGE_HOSTS].some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
  );

  if (!matchesAllowed) {
    return { valid: false, error: `Domain not allowed: ${hostname}` };
  }

  return { valid: true };
}
