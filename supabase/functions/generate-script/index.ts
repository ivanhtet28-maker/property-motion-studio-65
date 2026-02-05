/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

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

    console.log("=== GENERATE AI SCRIPT (OpenAI GPT-4) ===");
    console.log("- Address:", body.address);
    console.log("- Price:", body.price);
    console.log("- Bedrooms:", body.bedrooms);
    console.log("- Bathrooms:", body.bathrooms);
    console.log("- Size:", body.size);
    console.log("- Features:", body.features);

    const { address, price, bedrooms, bathrooms, size, features, description } = body;

    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
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

Script:`;

    console.log("Calling OpenAI API...");

    // Call OpenAI API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a professional real estate copywriter specializing in video scripts for property listings. Write compelling, concise scripts that highlight property features and create emotional appeal.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const script = data.choices[0]?.message?.content?.trim();

    if (!script) {
      throw new Error("No script generated from OpenAI");
    }

    console.log("AI script generated successfully");
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
