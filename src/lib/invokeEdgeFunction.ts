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
 *   The Supabase SDK's internal `fetchWithAuth` automatically injects
 *   the current session's JWT as the Authorization header. We do NOT
 *   set a custom Authorization header — doing so can override the SDK's
 *   correctly-resolved token with a stale one from `getSession()`.
 *
 *   On 401, the helper calls `refreshSession()` to force the SDK's
 *   internal session state to update, then retries once.
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
  /** Extra headers to merge (do NOT include Authorization — the SDK handles it) */
  headers?: Record<string, string>;
  /** If true (default), require a valid session. Set false for public endpoints. */
  requireAuth?: boolean;
}

/** Attempt a single invoke call and parse errors into a structured result. */
async function attemptInvoke<T>(
  functionName: string,
  headers: Record<string, string>,
  body: Record<string, unknown> | undefined,
): Promise<{ ok: true; data: T } | { ok: false; serverMessage: string; httpStatus: number | undefined; is401: boolean }> {
  // Let the SDK's fetchWithAuth handle Authorization + apikey automatically.
  // We only pass non-auth headers (Content-Type, etc.) as custom headers.
  const { data, error } = await supabase.functions.invoke(functionName, {
    headers,
    body,
  });

  if (error) {
    let serverMessage = "";
    let httpStatus: number | undefined;

    try {
      httpStatus = (error as { context?: { status?: number; json?: () => Promise<{ error?: string; message?: string }> } }).context?.status;
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } }).context;
      if (ctx && typeof ctx.json === "function") {
        const errorBody = await ctx.json();
        serverMessage = errorBody?.error || errorBody?.message || "";
      }
    } catch {
      // context may not be readable — fall through
    }

    const is401 = httpStatus === 401 || (error instanceof Error && error.message?.includes("401"));

    return { ok: false, serverMessage, httpStatus, is401 };
  }

  return { ok: true, data: data as T };
}

/**
 * Invoke a Supabase Edge Function with proper error handling.
 *
 * On 401, automatically refreshes the session and retries once.
 *
 * @returns The parsed response `data` from the edge function.
 * @throws {EdgeFunctionError} with the real server message and HTTP status.
 */
export async function invokeEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  options: InvokeOptions = {},
): Promise<T> {
  const { body, headers = {}, requireAuth = true } = options;

  // Pre-flight: if auth is required, verify a session exists before calling
  if (requireAuth) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) {
      throw new EdgeFunctionError(
        "Your session has expired. Please sign in again.",
        401,
      );
    }
  }

  // Attempt 1 — SDK's fetchWithAuth automatically injects the JWT
  const result1 = await attemptInvoke<T>(functionName, headers, body);

  if (result1.ok) {
    return result1.data;
  }

  // On 401: refresh the SDK's internal session state, then retry once
  if (result1.is401 && requireAuth) {
    console.warn(
      `[invokeEdgeFunction] ${functionName} returned 401 — refreshing session and retrying...`,
    );

    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      throw new EdgeFunctionError(
        "Authentication failed (401). Your session has expired — please sign in again.",
        401,
      );
    }

    // Attempt 2 — SDK will now use the freshly-refreshed token
    const result2 = await attemptInvoke<T>(functionName, headers, body);

    if (result2.ok) {
      return result2.data;
    }

    if (result2.is401) {
      throw new EdgeFunctionError(
        "Authentication failed (401). Your session has expired — please sign in again.",
        401,
      );
    }

    const displayMessage =
      result2.serverMessage || `Edge function "${functionName}" failed`;
    throw new EdgeFunctionError(displayMessage, result2.httpStatus);
  }

  // Non-401 error — throw immediately
  if (result1.is401) {
    throw new EdgeFunctionError(
      "Authentication failed (401). Your session has expired — please sign in again.",
      401,
    );
  }

  const displayMessage =
    result1.serverMessage || `Edge function "${functionName}" failed`;
  throw new EdgeFunctionError(displayMessage, result1.httpStatus);
}
