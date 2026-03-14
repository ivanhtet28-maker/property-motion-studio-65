/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { userId, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    if (!STRIPE_SECRET_KEY) {
      throw new Error("Stripe not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get stripe_customer_id for this user
    const { data: userData, error: dbError } = await supabase
      .from("users")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (dbError || !userData?.stripe_customer_id) {
      // No Stripe customer yet — return empty list
      return new Response(
        JSON.stringify({ invoices: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerId = userData.stripe_customer_id;

    // Fetch up to 24 invoices from Stripe
    const params = new URLSearchParams({
      customer: customerId,
      limit: "24",
      expand: ["data.charge"],
    });

    const stripeRes = await fetch(
      `https://api.stripe.com/v1/invoices?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );

    if (!stripeRes.ok) {
      const errText = await stripeRes.text();
      throw new Error(`Stripe API error: ${stripeRes.status} — ${errText}`);
    }

    const stripeData = await stripeRes.json();

    // Shape invoices for the frontend
    const invoices = (stripeData.data || []).map((inv: Record<string, unknown>) => {
      const periodStart = inv.period_start as number | null;
      const created = inv.created as number;
      const amountPaid = inv.amount_paid as number;
      const currency = (inv.currency as string) || "aud";
      const status = inv.status as string;
      const lines = (inv.lines as { data: Array<{ description: string }> })?.data || [];
      const description =
        lines[0]?.description ||
        (inv.description as string) ||
        "Subscription";
      const hostedUrl = inv.hosted_invoice_url as string | null;
      const pdfUrl = inv.invoice_pdf as string | null;

      return {
        id: inv.id as string,
        date: new Date((periodStart || created) * 1000).toLocaleDateString("en-AU", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        description,
        amount: new Intl.NumberFormat("en-AU", {
          style: "currency",
          currency: currency.toUpperCase(),
        }).format(amountPaid / 100),
        status,
        hostedUrl,
        pdfUrl,
      };
    });

    return new Response(
      JSON.stringify({ invoices }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("get-invoices error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to fetch invoices",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
