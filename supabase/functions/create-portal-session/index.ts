/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

interface PortalRequest {
  userId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId }: PortalRequest = await req.json();

    console.log("=== CREATE PORTAL SESSION ===");
    console.log("User ID:", userId);

    if (!STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    // Get Stripe customer ID from database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userPrefs, error: dbError } = await supabase
      .from("user_preferences")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .single();

    if (dbError || !userPrefs?.stripe_customer_id) {
      throw new Error("No Stripe customer found for this user");
    }

    const customerId = userPrefs.stripe_customer_id;

    // Create portal session
    const origin = req.headers.get("origin") || "http://localhost:5173";
    const portalResponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customerId,
        return_url: `${origin}/settings?tab=plan`,
      }).toString(),
    });

    if (!portalResponse.ok) {
      const error = await portalResponse.text();
      throw new Error(`Stripe portal creation failed: ${error}`);
    }

    const portal = await portalResponse.json();

    console.log("Portal session created:", portal.id);

    return new Response(
      JSON.stringify({
        url: portal.url,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error creating portal session:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to create portal session",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
