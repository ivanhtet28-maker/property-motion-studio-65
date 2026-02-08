/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

// Stripe price IDs from Stripe Dashboard (TEST MODE)
const PRICE_IDS = {
  starter: "price_1Syaj2GkPU4YhgKfafjlmn2s", // $299/month - 10 videos
  growth: "price_1SyajHGkPU4YhgKfesr95mxL",  // $499/month - 30 videos
  // Enterprise is custom - handled separately
};

interface CheckoutRequest {
  priceId?: string;
  plan: "starter" | "growth" | "enterprise";
  userId: string;
  email: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { plan, userId, email }: CheckoutRequest = body;

    console.log("=== CREATE CHECKOUT SESSION ===");
    console.log("Request body:", JSON.stringify(body));
    console.log("Plan:", plan);
    console.log("User ID:", userId);
    console.log("Email:", email);

    if (!userId || !email || !plan) {
      throw new Error(`Missing required fields: userId=${!!userId}, email=${!!email}, plan=${!!plan}`);
    }

    if (!STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    // Enterprise plan requires contact sales
    if (plan === "enterprise") {
      return new Response(
        JSON.stringify({
          error: "Enterprise plan requires contacting sales",
          contactSales: true,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get or create Stripe customer
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user exists in users table and has a Stripe customer ID
    let { data: user } = await supabase
      .from("users")
      .select("stripe_customer_id, email")
      .eq("id", userId)
      .single();

    // If user doesn't exist in users table, create them
    if (!user) {
      console.log("User not found in users table, creating...");
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          id: userId,
          email: email,
          plan: 'starter',
          videos_limit: 10,
        })
        .select("stripe_customer_id, email")
        .single();

      if (insertError) {
        console.error("Failed to create user:", insertError);
        throw new Error(`Failed to create user record: ${insertError.message}`);
      }

      user = newUser;
    }

    let customerId = user?.stripe_customer_id;

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

      // Save customer ID to database
      await supabase
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);

      console.log("Stripe customer created:", customerId);
    }

    // Get the price ID for the plan
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    // Create checkout session
    const origin = req.headers.get("origin") || "http://localhost:5173";
    const sessionResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
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
        "subscription_data[metadata][supabase_user_id]": userId,
        "subscription_data[metadata][plan]": plan,
      }).toString(),
    });

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
