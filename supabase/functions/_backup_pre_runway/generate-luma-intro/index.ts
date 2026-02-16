/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

interface GenerateLumaIntroRequest {
  propertyAddress: string;
  firstImageUrl: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { propertyAddress, firstImageUrl }: GenerateLumaIntroRequest = await req.json();

    console.log("=== GENERATE LUMA AI CINEMATIC INTRO ===");
    console.log("Property:", propertyAddress);
    console.log("Image URL:", firstImageUrl);

    // Validate input
    if (!firstImageUrl) {
      return new Response(
        JSON.stringify({ error: "firstImageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!LUMA_API_KEY) {
      console.error("LUMA_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Luma AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create cinematic intro prompt for Luma AI
    const cinematicPrompt = `High-end cinematic establishing shot of luxury property. Smooth, slow, stabilized camera motion with subtle parallax (no shaking). Camera performs a gentle wide-to-medium dolly-in revealing the architecture. Golden hour sunlight with warm natural tones, soft shadows, realistic reflections. Emphasis on grandeur, clean lines, symmetry, and premium materials. Luxury property cinematography, calm and elegant mood. Ultra-realistic lighting, consistent exposure, natural colors. Shallow cinematic depth of field where appropriate, sharp focus on the building. No people, no vehicles, no text overlays. Photorealistic, upscale, professional real estate marketing video. 4K quality, clean, stable, cohesive establishing shot.`;

    console.log("Calling Luma AI API...");

    // Call Luma AI Dream Machine API for image-to-video generation
    const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LUMA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "ray-2",
        prompt: cinematicPrompt,
        keyframes: {
          frame0: {
            type: "image",
            url: firstImageUrl,
          },
        },
        aspect_ratio: "9:16", // Vertical for mobile
        loop: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Luma API error:", response.status, errorText);
      throw new Error(`Luma API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const generationId = data.id;

    if (!generationId) {
      throw new Error("No generation ID returned from Luma API");
    }

    console.log("Luma generation started:", generationId);
    console.log("Estimated time: 30-60 seconds");

    return new Response(
      JSON.stringify({
        success: true,
        generationId: generationId,
        message: "Luma intro generation started (30-60 seconds)",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating Luma intro:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate Luma intro",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
