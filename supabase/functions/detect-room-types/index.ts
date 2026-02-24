/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

// Super 7 Organic Engine — room detection categories
// Includes directional variants for spatial intelligence (room-slide-left/right)
const VALID_ROOM_TYPES = [
  "foyer-glide",
  "room-slide",
  "room-slide-right",
  "room-slide-left",
  "bedside-arc",
  "detail-push",
  "hero-arrival",
  "view-reveal",
  "vista-pan",
] as const;

type RoomType = typeof VALID_ROOM_TYPES[number];

const DETECTION_PROMPT = `Classify this real estate photo into one of the cinematic categories below. Reply with ONLY one exact value from this list (no other text, no punctuation):
foyer-glide
room-slide
room-slide-right
room-slide-left
bedside-arc
detail-push
hero-arrival
view-reveal
vista-pan

Guidelines:
- foyer-glide: foyer, entry, hallway, corridor, entrance interior, mudroom, stairway
- room-slide / room-slide-right / room-slide-left: living room, lounge, dining room, open plan living area, family room, sitting room, den
  SPATIAL RULE FOR LIVING ROOMS: Identify if there is a primary light source or window wall.
  If windows are on the LEFT side of the image, return "room-slide-right".
  If windows are on the RIGHT side of the image, return "room-slide-left".
  If windows are centered, on both sides, or there are no visible windows, return "room-slide".
- bedside-arc: bedroom, master suite, guest bedroom, nursery, any sleeping quarters
- detail-push: kitchen, bathroom, ensuite, powder room, laundry, pantry, utility room
- hero-arrival: exterior, facade, street view, driveway, front door, porch, property front
- view-reveal: backyard, pool, spa, terrace, deck, patio, alfresco, pergola, outdoor entertaining, garden
- vista-pan: balcony, scenic view from inside, panoramic window, skyline, ocean/water view, mountain view

Reply with only the room type value.`;

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
    : "room-slide";
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
          console.error(`Image ${id}: detection failed, defaulting to room-slide`, err);
          return { id, room_type: "room-slide" as RoomType };
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
