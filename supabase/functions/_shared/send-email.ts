/**
 * Lightweight email helper using the Resend HTTP API.
 *
 * Requires the RESEND_API_KEY environment variable to be set.
 * If the key is missing the function logs a warning and returns silently
 * so video processing is never blocked by a missing email configuration.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("EMAIL_FROM") || "Property Motion <noreply@propertymotion.com.au>";

export async function sendVideoReadyEmail(
  toEmail: string,
  propertyAddress: string,
  videoUrl: string,
  dashboardUrl: string,
) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email notification");
    return;
  }

  const subject = `Your video for ${propertyAddress} is ready!`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="margin: 0 0 8px;">Your video is ready!</h2>
      <p style="color: #555; margin: 0 0 24px; font-size: 15px;">
        Great news — your listing video for <strong>${propertyAddress}</strong> has finished generating.
      </p>
      <a href="${dashboardUrl}" style="display: inline-block; background: #18181b; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 15px;">
        View on Dashboard
      </a>
      <p style="color: #999; font-size: 13px; margin-top: 32px;">
        You're receiving this because a video you created on Property Motion has finished processing.
      </p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "no body");
      console.error(`Resend API error (${res.status}):`, errBody);
    } else {
      console.log(`Email notification sent to ${toEmail} for video at ${propertyAddress}`);
    }
  } catch (err) {
    // Never throw — email is best-effort
    console.error("Failed to send email notification:", err);
  }
}

export async function sendVideoFailedEmail(
  toEmail: string,
  propertyAddress: string,
  dashboardUrl: string,
) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email notification");
    return;
  }

  const subject = `Video generation failed for ${propertyAddress}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="margin: 0 0 8px;">Video generation failed</h2>
      <p style="color: #555; margin: 0 0 24px; font-size: 15px;">
        Unfortunately, the video for <strong>${propertyAddress}</strong> could not be generated. You can try creating a new video from your dashboard.
      </p>
      <a href="${dashboardUrl}" style="display: inline-block; background: #18181b; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 15px;">
        Go to Dashboard
      </a>
      <p style="color: #999; font-size: 13px; margin-top: 32px;">
        You're receiving this because a video you created on Property Motion failed to process.
      </p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "no body");
      console.error(`Resend API error (${res.status}):`, errBody);
    } else {
      console.log(`Failure email sent to ${toEmail} for ${propertyAddress}`);
    }
  } catch (err) {
    console.error("Failed to send failure email:", err);
  }
}
