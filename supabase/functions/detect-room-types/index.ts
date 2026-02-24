/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const VALID_ROOM_TYPES = [
  "exterior-arrival",
  "front-door",
  "entry-foyer",
  "living-room-wide",
  "living-room-orbit",
  "kitchen-orbit",
  "kitchen-push",
  "master-bedroom",
  "bedroom",
  "bathroom",
  "outdoor-entertaining",
  "backyard-pool",
  "view-balcony",
] as const;

type RoomType = typeof VALID_ROOM_TYPES[number];

const DETECTION_PROMPT = `Classify this real estate photo into one of the room types below.

Step 1: List 3-5 key objects or features visible in the photo.
Step 2: Based on those objects, determine the room type.
Step 3: Output your answer on the FINAL line as: ROOM_TYPE: <value>

Valid room types:
- exterior-arrival: outside of the property, driveway, facade, street view
- front-door: close-up of the entrance door or porch
- entry-foyer: hallway or entrance interior
- living-room-wide: lounge, living room, open plan living area
- living-room-orbit: same but photo taken from an angle suggesting a sweep
- kitchen-orbit: full kitchen view from the side or angle
- kitchen-push: close-up of kitchen counter, island, appliances, or detail
- master-bedroom: largest/primary bedroom, usually has ensuite or larger size
- bedroom: any other bedroom
- bathroom: any bathroom, ensuite, powder room, toilet
- outdoor-entertaining: deck, patio, alfresco, pergola, outdoor dining
- backyard-pool: swimming pool, spa, backyard with grass/garden
- view-balcony: balcony, terrace, or scenic view from inside`;

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
      max_tokens: 150,
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
  const responseText = data.content[0]?.text?.trim() || "";

  // Parse chain-of-thought output: extract from "ROOM_TYPE: <value>" on final line.
  // Falls back to raw text matching if model returns a bare room type.
  const match = responseText.match(/ROOM_TYPE:\s*(.+)/i);
  const detected = (match ? match[1].trim().toLowerCase() : responseText.trim().toLowerCase()) as RoomType;

  console.log(`Detection reasoning: ${responseText.substring(0, 200)}`);
  console.log(`Extracted room type: ${detected}`);

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
          return { id, room_type: "living-room-wide" as RoomType };
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
