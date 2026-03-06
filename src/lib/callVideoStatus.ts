import { supabase } from "@/lib/supabase";

/**
 * Call the video-status edge function using a "simple" POST that
 * bypasses CORS preflight entirely.
 *
 * Why this exists:
 *   Supabase's API gateway sometimes blocks CORS preflight (OPTIONS)
 *   requests even when verify_jwt=false is set. The browser sends a
 *   preflight because supabase.functions.invoke() includes Authorization
 *   and Content-Type: application/json headers.
 *
 *   By using Content-Type: text/plain and omitting the Authorization
 *   header (passing the JWT in the body instead), the browser treats
 *   this as a "simple" cross-origin request — no preflight needed.
 *
 * The edge function detects the text/plain content type and reads
 * the JWT from the body's _jwt field instead of the Authorization header.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function callVideoStatus<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  // Get fresh session token
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData?.session?.access_token;

  if (!jwt) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/video-status`,
    {
      method: "POST",
      // text/plain = "simple" request → NO CORS preflight
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        ...body,
        _jwt: jwt,
        _apikey: SUPABASE_ANON_KEY,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`video-status returned ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
