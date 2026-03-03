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
 *   `Authorization` header. If the call returns 401, it automatically
 *   refreshes the session and retries once before giving up.
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

interface InvokeFailure {
  ok: false;
  serverMessage: string;
  httpStatus: number | undefined;
  is401: boolean;
}

/** Build auth headers, optionally forcing a token refresh. */
async function buildAuthHeaders(
  baseHeaders: Record<string, string>,
  requireAuth: boolean,
  forceRefresh: boolean,
): Promise<Record<string, string>> {
  const finalHeaders: Record<string, string> = { ...baseHeaders };

  if (requireAuth && !finalHeaders.Authorization) {
    let accessToken: string | undefined;

    if (forceRefresh) {
      const { data: refreshData, error: refreshError } =
        await supabase.auth.refreshSession();
      if (refreshError || !refreshData?.session?.access_token) {
        throw new EdgeFunctionError(
          "Your session has expired. Please sign in again.",
          401,
        );
      }
      accessToken = refreshData.session.access_token;
    } else {
      const { data: sessionData } = await supabase.auth.getSession();
      accessToken = sessionData?.session?.access_token;
    }

    if (!accessToken) {
      throw new EdgeFunctionError(
        "Your session has expired. Please sign in again.",
        401,
      );
    }
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  return finalHeaders;
}

/** Attempt a single invoke call and parse errors into a structured result. */
async function attemptInvoke<T>(
  functionName: string,
  finalHeaders: Record<string, string>,
  body: Record<string, unknown> | undefined,
): Promise<{ ok: true; data: T } | InvokeFailure> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    headers: finalHeaders,
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

  // Attempt 1: use cached session (fast path)
  const headers1 = await buildAuthHeaders(headers, requireAuth, false);
  const result1 = await attemptInvoke<T>(functionName, headers1, body);

  if (result1.ok) {
    return result1.data;
  }

  // On 401 with auth enabled: refresh session and retry once
  if (result1.is401 && requireAuth) {
    console.warn(
      `[invokeEdgeFunction] ${functionName} returned 401 — refreshing session and retrying...`,
    );

    let headers2: Record<string, string>;
    try {
      headers2 = await buildAuthHeaders(headers, requireAuth, true);
    } catch {
      throw new EdgeFunctionError(
        "Authentication failed (401). Your session may have expired — please sign in again.",
        401,
      );
    }

    const result2 = await attemptInvoke<T>(functionName, headers2, body);

    if (result2.ok) {
      return result2.data;
    }

    // Second attempt also failed
    if (result2.is401) {
      throw new EdgeFunctionError(
        "Authentication failed (401). Your session may have expired — please sign in again.",
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
      "Authentication failed (401). Your session may have expired — please sign in again.",
      401,
    );
  }

  const displayMessage =
    result1.serverMessage || `Edge function "${functionName}" failed`;
  throw new EdgeFunctionError(displayMessage, result1.httpStatus);
}
