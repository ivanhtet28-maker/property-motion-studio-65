import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Simple database-backed rate limiter for Supabase edge functions.
 *
 * Usage:
 *   const { allowed, remaining } = await checkRateLimit("generate-video", userId, 10, 3600);
 *   if (!allowed) return new Response("Rate limit exceeded", { status: 429 });
 */

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Check and increment rate limit for a given key.
 *
 * @param action   - Name of the action (e.g. "generate-video", "signup")
 * @param identity - User ID, IP hash, or other identifier
 * @param limit    - Max requests allowed in the window
 * @param windowSeconds - Window size in seconds (default: 3600 = 1 hour)
 */
export async function checkRateLimit(
  action: string,
  identity: string,
  limit: number,
  windowSeconds: number = 3600,
): Promise<RateLimitResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const key = `${action}:${identity}`;
  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

  // Count requests in current window
  const { data, error } = await supabase
    .from("rate_limits")
    .select("request_count")
    .eq("key", key)
    .gte("window_start", windowStart);

  if (error) {
    console.error("Rate limit check failed:", error);
    // Fail open — don't block users if DB is down
    return { allowed: true, remaining: limit, limit };
  }

  const totalRequests = (data || []).reduce(
    (sum, row) => sum + (row.request_count || 0),
    0,
  );

  if (totalRequests >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  // Record this request
  await supabase.from("rate_limits").insert({
    key,
    window_start: new Date().toISOString(),
    request_count: 1,
  });

  // Opportunistic cleanup (1% of requests)
  if (Math.random() < 0.01) {
    await supabase
      .from("rate_limits")
      .delete()
      .lt("window_start", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  }

  return { allowed: true, remaining: limit - totalRequests - 1, limit };
}

/**
 * Hash an IP address for privacy-friendly storage.
 * Uses a simple hash — not cryptographically strong but sufficient
 * for abuse detection without storing raw IPs.
 */
export async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + "_propertymotion_salt");
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Extract client IP from request headers.
 * Supabase edge functions receive the real IP via x-forwarded-for.
 */
export function getClientIP(req: Request): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
