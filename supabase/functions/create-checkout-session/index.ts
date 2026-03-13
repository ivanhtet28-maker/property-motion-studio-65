/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";


const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

// Stripe price IDs from Stripe Dashboard (all prices AUD)
const PRICE_IDS: Record<string, string> = {
  // Monthly subscription plans
  starter:          "price_1TA346PbrXEZ5GmRT8CxvJ9X",       // A$49/month  - 3 videos
  growth:           "price_1TA3BuPbrXEZ5GmR70K1NLJy",       // A$99/month  - 10 videos
  pro:              "price_1TA3DWPbrXEZ5GmRP9tE0OD4",       // A$179/month - 20 videos
  // Yearly subscription plans
  starter_yearly:   "price_1TA38IPbrXEZ5GmRuVuadZQy",       // A$39/month (A$468/year) - 25 videos
  growth_yearly:    "price_1TA3CwPbrXEZ5GmRdKh2NUJi",       // A$79/month (A$948/year) - 100 videos
  pro_yearly:       "price_1TA3ElPbrXEZ5GmRjQfWCEjb",       // A$149/month (A$1788/year) - 200 videos
  // One-time video top-up packs
  topup_1:          "price_1TA3G8PbrXEZ5GmRBRxiKkfs",       // A$8  - 1 extra video
  topup_5:          "price_1TA3GdPbrXEZ5GmRmaaoxoP2",       // A$35 - 5 extra videos
};

// Map plan IDs to their base tier name (for storing in DB)
const PLAN_TO_TIER: Record<string, string> = {
  starter: "starter",
  growth: "growth",
  pro: "pro",
  starter_yearly: "starter",
  growth_yearly: "growth",
  pro_yearly: "pro",
};

// Video limits per subscription plan
const VIDEO_LIMITS: Record<string, number> = {
  starter: 3,
  growth: 10,
  pro: 20,
  starter_yearly: 25,
  growth_yearly: 100,
  pro_yearly: 200,
};

// Top-up packs: plan key → number of extra videos
const TOPUP_VIDEOS: Record<string, number> = {
  topup_1: 1,
  topup_5: 5,
};

interface CheckoutRequest {
  priceId?: string;
  plan: string;
  userId: string;
  email: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth guard — verify a valid Supabase JWT is present
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const jwt = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user: authUser }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { plan, userId, email }: CheckoutRequest = body;

    // Ensure the authenticated user matches the requested userId
    if (authUser.id !== userId) {
      return new Response(
        JSON.stringify({ error: "User ID mismatch" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("=== CREATE CHECKOUT SESSION ===");
    console.log("Plan:", plan);
    console.log("User ID:", userId);
    console.log("Email:", email);

    if (!userId || !email || !plan) {
      throw new Error(`Missing required fields: userId=${!!userId}, email=${!!email}, plan=${!!plan}`);
    }

    if (!STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    // Validate plan
    if (!PRICE_IDS[plan]) {
      return new Response(
        JSON.stringify({ error: `Invalid plan: ${plan}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create Stripe customer
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user has a Stripe customer ID in user_preferences
    let { data: userPrefs } = await supabase
      .from("users")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    // If user row doesn't exist, the handle_new_user trigger didn't fire — surface a clear error
    if (!userPrefs) {
      console.error("User profile not found for userId:", userId);
      throw new Error("User profile not found. Please sign out and sign back in.");
    }

    let customerId = userPrefs?.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      console.log("Creating new Stripe customer...");
      const customerResponse = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: email,
          "metadata[supabase_user_id]": userId,
        }).toString(),
      });

      if (!customerResponse.ok) {
        const error = await customerResponse.text();
        throw new Error(`Stripe customer creation failed: ${error}`);
      }

      const customer = await customerResponse.json();
      customerId = customer.id;

      // Save customer ID to user_preferences (same table stripe-webhook reads from)
      await supabase
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);

      console.log("Stripe customer created:", customerId);
    }

    // Get the price ID for the plan
    const priceId = PRICE_IDS[plan];
    const isTopup = plan in TOPUP_VIDEOS;
    const origin = req.headers.get("origin") || "http://localhost:5173";

    let sessionResponse: Response;

    if (isTopup) {
      // One-time payment for video top-up packs
      const extraVideos = TOPUP_VIDEOS[plan];
      sessionResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: customerId,
          mode: "payment",
          "payment_method_types[0]": "card",
          "line_items[0][price]": priceId,
          "line_items[0][quantity]": "1",
          success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}&topup=true`,
          cancel_url: `${origin}/settings?tab=plan`,
          "metadata[supabase_user_id]": userId,
          "metadata[plan]": plan,
          "metadata[type]": "topup",
          "metadata[extra_videos]": String(extraVideos),
        }).toString(),
      });
    } else {
      // Recurring subscription
      const tier = PLAN_TO_TIER[plan] || plan;
      const videosLimit = VIDEO_LIMITS[plan] || 2;

      sessionResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          customer: customerId,
          mode: "subscription",
          "payment_method_types[0]": "card",
          billing_address_collection: "auto",
          "line_items[0][price]": priceId,
          "line_items[0][quantity]": "1",
          success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/#pricing`,
          "metadata[supabase_user_id]": userId,
          "metadata[plan]": plan,
          "metadata[tier]": tier,
          "metadata[videos_limit]": String(videosLimit),
          "subscription_data[trial_period_days]": "7",
          "subscription_data[metadata][supabase_user_id]": userId,
          "subscription_data[metadata][plan]": plan,
          "subscription_data[metadata][tier]": tier,
          "subscription_data[metadata][videos_limit]": String(videosLimit),
        }).toString(),
      });
    }

    if (!sessionResponse.ok) {
      const error = await sessionResponse.text();
      throw new Error(`Stripe session creation failed: ${error}`);
    }

    const session = await sessionResponse.json();

    console.log("Checkout session created:", session.id);

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating checkout session:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to create checkout session",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
