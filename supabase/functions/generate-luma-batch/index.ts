/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  const LUMA_API_KEY = Deno.env.get("LUMA_API_KEY");

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { imageUrls, propertyAddress } = await req.json();

      if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
        throw new Error("imageUrls array is required");
      }

      if (!LUMA_API_KEY) {
        throw new Error("LUMA_API_KEY not configured");
      }

      console.log(`Starting batch generation for ${imageUrls.length} images...`);

      const generationPromises = imageUrls.map(async (imageUrl, index) => {
        try {
          console.log(`Creating generation ${index + 1}/${imageUrls.length} for image:`, imageUrl);

          // Luma API v1
          const response = await fetch("https://api.lumalabs.ai/dream-machine/v1/generations", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LUMA_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "ray-2",
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
              generationId: null,
              status: "error" as const,
              error: `Luma API error: ${errorText}`,
            };
          }

          const data = await response.json();
          console.log(`Generation ${index + 1} started:`, data.id);

          return {
            imageUrl,
            generationId: data.id,
            status: "queued" as const,
          };
        } catch (error) {
          console.error(`Error creating generation for image ${index + 1}:`, error);
          return {
            imageUrl,
            generationId: null,
            status: "error" as const,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      });

      const results = await Promise.all(generationPromises);

      const successful = results.filter((r) => r.status === "queued");
      const failed = results.filter((r) => r.status === "error");

      console.log(`Batch generation complete: ${successful.length} queued, ${failed.length} failed`);

      if (successful.length === 0) {
        throw new Error("All generations failed");
      }

      return new Response(
        JSON.stringify({
          success: true,
          generations: results,
          totalRequested: imageUrls.length,
          successful: successful.length,
          failed: failed.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error in batch generation:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  });