/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

// No CORS headers for webhooks (Stripe doesn't need them)

Deno.serve(async (req) => {
  try {
    console.log("=== STRIPE WEBHOOK RECEIVED ===");

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
      throw new Error("Stripe keys not configured");
    }

    // Get the signature from headers
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("No signature found");
    }

    // Get raw body
    const body = await req.text();

    // Verify webhook signature
    const event = await verifyStripeWebhook(body, signature, STRIPE_WEBHOOK_SECRET);

    console.log("Webhook event type:", event.type);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log("Checkout session completed:", session.id);

        const userId = session.metadata?.supabase_user_id;
        const plan = session.metadata?.plan;

        if (userId && plan) {
          await supabase
            .from("user_preferences")
            .update({
              subscription_plan: plan,
              subscription_tier: plan,
            })
            .eq("user_id", userId);

          console.log(`Updated user ${userId} to plan ${plan}`);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        console.log("Subscription event:", subscription.id);

        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) {
          console.warn("No user ID in subscription metadata");
          break;
        }

        // Get payment method details if available
        let paymentMethodLast4 = null;
        let paymentMethodBrand = null;

        if (subscription.default_payment_method) {
          const pmResponse = await fetch(
            `https://api.stripe.com/v1/payment_methods/${subscription.default_payment_method}`,
            {
              headers: {
                "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
              },
            }
          );

          if (pmResponse.ok) {
            const pm = await pmResponse.json();
            paymentMethodLast4 = pm.card?.last4;
            paymentMethodBrand = pm.card?.brand;
          }
        }

        // Update subscription in database
        await supabase
          .from("user_preferences")
          .update({
            stripe_subscription_id: subscription.id,
            subscription_status: subscription.status,
            subscription_plan: subscription.metadata?.plan || "starter",
            subscription_tier: subscription.metadata?.plan || "starter",
            subscription_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            subscription_cancel_at_period_end: subscription.cancel_at_period_end,
            period_reset_date: new Date(subscription.current_period_end * 1000).toISOString(),
            videos_used_this_period: 0, // Reset on new period
            payment_method_last4: paymentMethodLast4,
            payment_method_brand: paymentMethodBrand,
          })
          .eq("user_id", userId);

        console.log(`Updated subscription for user ${userId}`);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log("Subscription canceled:", subscription.id);

        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) {
          console.warn("No user ID in subscription metadata");
          break;
        }

        // Downgrade to free tier
        await supabase
          .from("user_preferences")
          .update({
            stripe_subscription_id: null,
            subscription_status: "canceled",
            subscription_plan: null,
            subscription_tier: "starter",
            subscription_cancel_at_period_end: false,
          })
          .eq("user_id", userId);

        console.log(`Canceled subscription for user ${userId}`);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;
        console.log("Payment succeeded:", invoice.id);

        // Reset video count at the start of new billing period
        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
          await supabase
            .from("user_preferences")
            .update({
              videos_used_this_period: 0,
              period_reset_date: new Date().toISOString(),
            })
            .eq("stripe_subscription_id", subscriptionId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.log("Payment failed:", invoice.id);

        const subscriptionId = invoice.subscription;
        if (subscriptionId) {
          await supabase
            .from("user_preferences")
            .update({
              subscription_status: "past_due",
            })
            .eq("stripe_subscription_id", subscriptionId);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Webhook processing failed",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Verify Stripe webhook signature
async function verifyStripeWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<any> {
  const encoder = new TextEncoder();
  const parts = signature.split(",");

  let timestamp = "";
  let v1Signature = "";

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = value;
    if (key === "v1") v1Signature = value;
  }

  if (!timestamp || !v1Signature) {
    throw new Error("Invalid signature format");
  }

  // Create the signed payload
  const signedPayload = `${timestamp}.${payload}`;

  // Create HMAC SHA256 signature
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload)
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Compare signatures
  if (expectedSignature !== v1Signature) {
    throw new Error("Signature verification failed");
  }

  // Check timestamp (prevent replay attacks)
  const currentTime = Math.floor(Date.now() / 1000);
  const timestampAge = currentTime - parseInt(timestamp);

  if (timestampAge > 300) {
    // 5 minutes
    throw new Error("Webhook timestamp too old");
  }

  // Parse and return the event
  return JSON.parse(payload);
}
