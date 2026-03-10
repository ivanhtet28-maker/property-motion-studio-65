import * as Sentry from "@sentry/react";

/**
 * Initialize Sentry error tracking.
 *
 * Set the VITE_SENTRY_DSN environment variable to your Sentry project DSN.
 * Sentry is disabled (no-op) when the DSN is not set, so it's safe to
 * import this module in all environments.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.debug("[Sentry] No DSN configured — error tracking disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE, // "development" | "production"
    // Only send errors in production to avoid noise
    enabled: import.meta.env.PROD,
    // Sample 100% of errors, 10% of transactions (adjust as needed)
    sampleRate: 1.0,
    tracesSampleRate: 0.1,
    // Filter out noisy browser extension errors
    beforeSend(event) {
      // Ignore errors from browser extensions
      if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
        (frame) => frame.filename?.includes("extension://")
      )) {
        return null;
      }
      return event;
    },
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Capture 10% of sessions for replay (adjust based on volume)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

export { Sentry };
