/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

interface LumaGenerationRequest {
  imageUrls: string[];
  propertyAddress: string;
}

interface LumaGenerationResult {
  imageUrl: string;
  generationId: string;
  status: "queued" | "error";
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { imageUrls, propertyAddress }: LumaGenerationRequest = await req.json();

    console.log("Starting Luma batch generation for", imageUrls.length, "images");

    if (!LUMA_API_KEY) {
      throw new Error("LUMA_API_KEY not configured");
    }

    if (!imageUrls || imageUrls.length < 3 || imageUrls.length > 6) {
      throw new Error("Need 3-6 images for Luma batch generation");
    }

    // Generate Luma clips in parallel for all images
    const generationPromises = imageUrls.map(async (imageUrl, index) => {
      try {
        console.log(`Starting Luma generation ${index + 1}/${imageUrls.length} for image:`, imageUrl);

        // Create image-to-video generation with Luma AI
        const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LUMA_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: `High-end cinematic real estate video of ${propertyAddress}. Smooth, slow, stabilized camera motion with subtle parallax (no shaking). Camera performs a gentle dolly-in and slight lateral glide, maintaining architectural accuracy. Golden hour sunlight with warm natural tones, soft shadows, realistic reflections. Emphasis on clean lines, symmetry, textures, windows, façade, and premium materials. Luxury property cinematography, calm and elegant mood. Ultra-realistic lighting, consistent exposure, natural colors. Shallow cinematic depth of field where appropriate, sharp focus on the building. No people, no vehicles, no text overlays. Photorealistic, upscale, professional real estate marketing video. 4K quality, clean, stable, cohesive shot.`,
            keyframes: {
              frame0: {
                type: "image",
                url: imageUrl,
              },
            },
            aspect_ratio: "9:16",
            loop: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Luma API error for image ${index + 1}:`, errorText);
          return {
            imageUrl,
            generationId: "",
            status: "error" as const,
            error: `Luma API error: ${errorText}`,
          };
        }

        const data = await response.json();
        const generationId = data.id;

        console.log(`Luma generation ${index + 1}/${imageUrls.length} started:`, generationId);

        return {
          imageUrl,
          generationId,
          status: "queued" as const,
        };
      } catch (err) {
        console.error(`Error generating Luma clip for image ${index + 1}:`, err);
        return {
          imageUrl,
          generationId: "",
          status: "error" as const,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    });

    // Wait for all generations to start
    const results = await Promise.all(generationPromises);

    // Check for any errors
    const errors = results.filter(r => r.status === "error");
    const successful = results.filter(r => r.status === "queued");

    console.log(`Batch generation complete: ${successful.length} successful, ${errors.length} errors`);

    if (successful.length === 0) {
      throw new Error("All Luma generations failed");
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalRequested: imageUrls.length,
        successful: successful.length,
        failed: errors.length,
        generations: results,
        estimatedTime: successful.length * 45, // ~45 seconds per clip
        message: `Started ${successful.length} Luma generations. Each clip takes 30-60 seconds.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in Luma batch generation:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to start Luma batch generation",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
