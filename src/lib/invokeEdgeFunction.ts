import { supabase } from "@/lib/supabase";

/**
 * Centralized wrapper for `supabase.functions.invoke`.
 *
 * Why this exists:
 *   The Supabase SDK returns the same generic error message
 *   ("Edge Function returned a non-2xx status code") for ALL HTTP failures.
 *   Previously each call site handled errors differently — some treated every
 *   error as a 401, hiding the real cause. This helper extracts the actual
 *   server response, detects real 401s, and surfaces the true error.
 *
 * Auth handling:
 *   When `requireAuth` is true (the default), the helper fetches a fresh
 *   access token from the current session and sends it as an explicit
 *   `Authorization` header. This prevents stale-token failures without
 *   requiring each call site to manage tokens manually.
 */

export class EdgeFunctionError extends Error {
  /** HTTP status code returned by the edge function (if available) */
  status: number | undefined;
  /** Whether this is specifically a 401 auth failure */
  isAuthError: boolean;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = status;
    this.isAuthError = status === 401;
  }
}

interface InvokeOptions {
  body?: Record<string, unknown>;
  /** Extra headers to merge (Authorization is auto-added when requireAuth=true) */
  headers?: Record<string, string>;
  /** If true (default), fetch a fresh JWT and send it. Set false for public endpoints. */
  requireAuth?: boolean;
}

/**
 * Invoke a Supabase Edge Function with proper error handling.
 *
 * @returns The parsed response `data` from the edge function.
 * @throws {EdgeFunctionError} with the real server message and HTTP status.
 */
export async function invokeEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  options: InvokeOptions = {},
): Promise<T> {
  const { body, headers = {}, requireAuth = true } = options;

  // Build headers — inject fresh auth token when required
  const finalHeaders: Record<string, string> = { ...headers };

  if (requireAuth && !finalHeaders.Authorization) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      throw new EdgeFunctionError(
        "Your session has expired. Please sign in again.",
        401,
      );
    }
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    headers: finalHeaders,
    body,
  });

  if (error) {
    // Try to extract the real error body from the response
    let serverMessage = "";
    let httpStatus: number | undefined;

    try {
      httpStatus = error.context?.status;
      if (error.context && typeof error.context.json === "function") {
        const errorBody = await error.context.json();
        serverMessage = errorBody?.error || errorBody?.message || "";
      }
    } catch {
      // context may not be readable — fall through
    }

    // Determine if this is actually a 401
    const is401 = httpStatus === 401 || error.message?.includes("401");

    if (is401) {
      throw new EdgeFunctionError(
        "Authentication failed (401). Your session may have expired — please sign in again.",
        401,
      );
    }

    // Surface the real error, not the SDK's generic wrapper
    const displayMessage =
      serverMessage || error.message || `Edge function "${functionName}" failed`;

    throw new EdgeFunctionError(displayMessage, httpStatus);
  }

  return data as T;
}
