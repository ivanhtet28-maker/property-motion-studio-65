import { supabase } from "@/lib/supabase";

/**
 * Call the stitch-video edge function using a "simple" POST that
 * bypasses CORS preflight entirely.
 *
 * Same pattern as callVideoStatus — Content-Type: text/plain with
 * JWT in the body instead of Authorization header.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function callStitchVideo<T = Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const jwt = sessionData?.session?.access_token;

  if (!jwt) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/stitch-video`,
    {
      method: "POST",
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
    throw new Error(`stitch-video returned ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
