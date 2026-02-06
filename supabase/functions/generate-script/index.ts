/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

interface GenerateScriptRequest {
  address: string;
  price: string;
  bedrooms: string;
  bathrooms: string;
  size: string;
  features: string[];
  description: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: GenerateScriptRequest = await req.json();

    console.log("=== GENERATE AI SCRIPT (Claude Sonnet) ===");
    console.log("- Address:", body.address);
    console.log("- Price:", body.price);
    console.log("- Bedrooms:", body.bedrooms);
    console.log("- Bathrooms:", body.bathrooms);
    console.log("- Size:", body.size);
    console.log("- Features:", body.features);

    const { address, price, bedrooms, bathrooms, size, features, description } = body;

    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI script generation service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build property details for AI prompt
    const featuresList = features && features.length > 0
      ? features.join(", ")
      : "modern amenities";

    const priceFormatted = price
      ? `$${parseInt(price).toLocaleString()}`
      : "contact for price";

    const sizeText = size ? `${size} square meters` : "generous living space";

    // Create AI prompt
    const prompt = `You are a professional real estate copywriter. Write a compelling 30-second video script for a property listing.

Property Details:
- Address: ${address || "this stunning property"}
- Price: ${priceFormatted}
- Bedrooms: ${bedrooms}
- Bathrooms: ${bathrooms}
- Size: ${sizeText}
- Features: ${featuresList}
${description ? `- Additional Info: ${description}` : ''}

Requirements:
- Write in a warm, enthusiastic tone
- Highlight key selling points
- Keep it concise (30 seconds when read aloud, approximately 75-90 words)
- End with a strong call-to-action
- Use vivid, descriptive language
- Format: 3 short paragraphs
- Focus on lifestyle benefits and emotional appeal

Write only the script, no preamble or explanations.`;

    console.log("Calling Anthropic Claude API...");

    // Call Anthropic API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-sonnet-20240229",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.8,
        system: "You are a professional real estate copywriter specializing in video scripts for property listings. Write compelling, concise scripts that highlight property features and create emotional appeal.",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const script = data.content[0]?.text?.trim();

    if (!script) {
      throw new Error("No script generated from Claude");
    }

    console.log("AI script generated successfully with Claude");
    console.log("Script length:", script.length, "characters");

    return new Response(
      JSON.stringify({
        success: true,
        script: script,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating script:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate script",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
