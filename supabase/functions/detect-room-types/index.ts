/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const VALID_ROOM_TYPES = [
  "hero-push",
  "room-flow",
  "luxury-slide",
  "detail-orbit",
  "wide-reveal",
] as const;

type RoomType = typeof VALID_ROOM_TYPES[number];

const DETECTION_PROMPT = `Classify this real estate photo into one of 5 shot presets. Reply with ONLY one exact value from this list (no other text, no punctuation):
hero-push
room-flow
luxury-slide
detail-orbit
wide-reveal

Guidelines:
- hero-push: exterior of the property, driveway, facade, street view, front door, entrance
- room-flow: living room, lounge, open plan living area, bedroom, hallway, foyer, entry
- luxury-slide: kitchen, island, countertops, appliances, dining area, patio, alfresco, pergola
- detail-orbit: bathroom, ensuite, powder room, toilet, fixtures, vanity, spa bath
- wide-reveal: backyard, swimming pool, garden, balcony, terrace, scenic view, outdoor space

Reply with only the preset value.`;

async function detectSingleRoomType(
  base64: string,
  mimeType: string
): Promise<RoomType> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 20,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: base64,
              },
            },
            {
              type: "text",
              text: DETECTION_PROMPT,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const detected = data.content[0]?.text?.trim().toLowerCase() as RoomType;

  return (VALID_ROOM_TYPES as readonly string[]).includes(detected)
    ? (detected as RoomType)
    : "living-room-wide";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json() as {
      images: Array<{ id: string; base64: string; mimeType: string }>;
    };

    if (!body.images || body.images.length === 0) {
      return new Response(
        JSON.stringify({ error: "No images provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`=== DETECT ROOM TYPES (Claude Vision) ===`);
    console.log(`Classifying ${body.images.length} image(s)...`);

    const results = await Promise.all(
      body.images.map(async ({ id, base64, mimeType }) => {
        try {
          const room_type = await detectSingleRoomType(base64, mimeType || "image/jpeg");
          console.log(`Image ${id}: detected → ${room_type}`);
          return { id, room_type };
        } catch (err) {
          console.error(`Image ${id}: detection failed, defaulting to living-room-wide`, err);
          return { id, room_type: "room-flow" as RoomType };
        }
      })
    );

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in detect-room-types:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Detection failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
