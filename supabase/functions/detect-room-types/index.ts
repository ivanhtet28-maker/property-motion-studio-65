/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

const VALID_INTENTS = [
  "push-in",
  "pull-out",
  "truck-left",
  "truck-right",
  "pedestal-up",
  "pedestal-down",
  "orbit",
  "static",
  "drone-up",
] as const;

const DETECTION_PROMPT = `You are an elite real estate videographer scouting a property photo before filming a 9:16 portrait video. Analyze this image and choose the single best camera move.

Step 1 — ROOM TYPE: Classify this photo.
Valid types: exterior-arrival, front-door, entry-foyer, living-room-wide, living-room-orbit, kitchen-orbit, kitchen-push, master-bedroom, bedroom, bathroom, outdoor-entertaining, backyard-pool, view-balcony

Step 2 — READ THE SPACE: As a videographer standing at the camera position, assess:
- What is the hero feature that a buyer would notice first?
- Are there obstructions (fences, gates, walls) in the foreground?
- For exteriors: is the facade symmetrical? Is there a fence?
- For living rooms: is there a kitchen visible? Which side?
- For bedrooms: where is the bed?

Step 3 — IDENTIFY HAZARDS:
- window-glare, fence-obstruction, driveway-flat, bed-dominant, dead-wall
- List all that apply, comma-separated. Or "none".

Step 4 — CHOOSE YOUR SHOT from these standard videography moves:

- push-in: Dolly forward toward focal point. Use for bathrooms, hallways, front doors. NEVER for bedrooms.
- pull-out: Dolly backward revealing space. Use for bedrooms, tight rooms, any "look how spacious" shot.
- truck-left: Lateral slide left. Use when the best feature is on the left side of frame.
- truck-right: Lateral slide right. Use when the best feature is on the right side of frame.
- pedestal-up: Camera rises vertically. Use for exteriors with fences/obstructions to clear foreground.
- pedestal-down: Camera lowers vertically. Rarely used — only for dramatic high-to-low reveals.
- orbit: Circular arc around subject. Use for living rooms, kitchens, open-plan spaces with features to reveal.
- static: Locked tripod, no movement. Use sparingly — only when the composition is already perfect.
- drone-up: Rising aerial reveal. Use for pools, backyards, outdoor areas, large properties.

RULES:
- Bedrooms: ALWAYS pull-out. Never push-in toward a bed.
- Exteriors with fence: ALWAYS pedestal-up or drone-up. Never push-in through a fence.
- Living rooms with visible kitchen: orbit toward the kitchen side.
- Entries with staircase: truck toward the staircase.

Step 5 — JUSTIFY in one sentence.

OUTPUT FORMAT — exactly these 5 lines, no extra text:
ROOM_TYPE: [type from valid list]
CAMERA_INTENT: [intent from list above]
HERO_FEATURE: [2-5 word description]
HAZARDS: [comma-separated or "none"]
REASONING: [one sentence]`;

interface DetectionResult {
  room_type: RoomType;
  camera_intent: string;
  hero_feature: string;
  hazards: string;
}

function getDefaultIntent(roomType: string): string {
  if (roomType.startsWith("exterior") || roomType === "front-door") return "truck-right";
  if (roomType === "entry-foyer") return "push-in";
  if (roomType.startsWith("living-room")) return "orbit";
  if (roomType.startsWith("kitchen")) return "orbit";
  if (roomType === "master-bedroom" || roomType === "bedroom") return "pull-out";
  if (roomType === "bathroom") return "push-in";
  return "drone-up";
}

async function detectSingleRoomType(
  base64: string,
  mimeType: string
): Promise<DetectionResult> {
  console.log(`[detect-room-types] Calling Anthropic API for image (mimeType=${mimeType}, base64Length=${base64.length})`);
  const startTime = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
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

  const elapsed = Date.now() - startTime;
  console.log(`[detect-room-types] Anthropic API responded: status=${response.status} in ${elapsed}ms`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[detect-room-types] Anthropic API FAILED: ${response.status} - ${errorText}`);
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const responseText = data.content[0]?.text?.trim() || "";

  // Check if response was truncated by max_tokens
  if (data.stop_reason === "max_tokens") {
    console.warn(`WARNING: Claude Vision response was TRUNCATED (stop_reason=max_tokens). Increasing max_tokens may be needed.`);
  }

  // Parse the 5-line output — anchor to start of line to avoid matching chain-of-thought reasoning
  const roomMatch = responseText.match(/^ROOM_TYPE:\s*(.+)/im);
  const intentMatch = responseText.match(/^CAMERA_INTENT:\s*(.+)/im);
  const heroMatch = responseText.match(/^HERO_FEATURE:\s*(.+)/im);
  const hazardsMatch = responseText.match(/^HAZARDS:\s*(.+)/im);
  const reasoningMatch = responseText.match(/^REASONING:\s*(.+)/im);

  const detectedRoom = (roomMatch ? roomMatch[1].trim().toLowerCase() : "living-room-wide") as RoomType;
  const detectedIntent = intentMatch ? intentMatch[1].trim().toLowerCase() : "";
  const detectedHero = heroMatch ? heroMatch[1].trim() : "none";
  const detectedHazards = hazardsMatch ? hazardsMatch[1].trim().toLowerCase() : "none";

  console.log(`=== Claude Vision FULL response ===`);
  console.log(responseText);
  console.log(`=== End Claude Vision response ===`);
  console.log(`Extracted: room=${detectedRoom}, intent=${detectedIntent}, hero=${detectedHero}, hazards=${detectedHazards}`);
  if (reasoningMatch) {
    console.log(`Reasoning: ${reasoningMatch[1].trim()}`);
  }

  // Validate room type
  const validRoom = (VALID_ROOM_TYPES as readonly string[]).includes(detectedRoom)
    ? (detectedRoom as RoomType)
    : "living-room-wide" as RoomType;

  // Validate camera intent — if unrecognized, use getDefaultIntent for smarter fallback
  const validIntent = (VALID_INTENTS as readonly string[]).includes(detectedIntent)
    ? detectedIntent
    : getDefaultIntent(validRoom);

  if (!(VALID_INTENTS as readonly string[]).includes(detectedIntent)) {
    console.warn(`Camera intent "${detectedIntent}" not in VALID_INTENTS, falling back to "${validIntent}" for room "${validRoom}"`);
  }

  return {
    room_type: validRoom,
    camera_intent: validIntent,
    hero_feature: detectedHero,
    hazards: detectedHazards,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log(`[detect-room-types] ── REQUEST RECEIVED ──`);
    console.log(`[detect-room-types] Method: ${req.method}`);
    console.log(`[detect-room-types] URL: ${req.url}`);
    console.log(`[detect-room-types] Origin: ${req.headers.get("origin") ?? "(none)"}`);
    console.log(`[detect-room-types] Auth header present: ${!!req.headers.get("authorization")}`);
    console.log(`[detect-room-types] Content-Type: ${req.headers.get("content-type") ?? "(none)"}`);
    console.log(`[detect-room-types] ANTHROPIC_API_KEY set: ${!!ANTHROPIC_API_KEY}`);
    console.log(`[detect-room-types] CORS: wildcard origin`);

    if (!ANTHROPIC_API_KEY) {
      console.error(`[detect-room-types] FATAL: ANTHROPIC_API_KEY is not set in environment`);
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json() as {
      images: Array<{ id: string; base64: string; mimeType: string }>;
    };

    if (!body.images || body.images.length === 0) {
      console.error(`[detect-room-types] No images in request body`, JSON.stringify(Object.keys(body)));
      return new Response(
        JSON.stringify({ error: "No images provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`=== DETECT ROOM TYPES (Claude Vision — CAMERA_INTENT system) ===`);
    console.log(`Classifying ${body.images.length} image(s)...`);
    console.log(`[detect-room-types] Image IDs: ${body.images.map(i => i.id).join(", ")}`);
    console.log(`[detect-room-types] Image sizes (base64 chars): ${body.images.map(i => `${i.id}=${i.base64?.length ?? 0}`).join(", ")}`);

    const results = await Promise.all(
      body.images.map(async ({ id, base64, mimeType }) => {
        try {
          const detection = await detectSingleRoomType(base64, mimeType || "image/jpeg");
          console.log(`Image ${id}: detected → room=${detection.room_type}, intent=${detection.camera_intent}, hero=${detection.hero_feature}, hazards=${detection.hazards}`);
          return {
            id,
            room_type: detection.room_type,
            camera_intent: detection.camera_intent,
            hero_feature: detection.hero_feature,
            hazards: detection.hazards,
          };
        } catch (err) {
          console.error(`Image ${id}: detection failed, defaulting`, err);
          return {
            id,
            room_type: "living-room-wide" as RoomType,
            camera_intent: "pull-out",
            hero_feature: "none",
            hazards: "none",
          };
        }
      })
    );

    console.log(`[detect-room-types] ── SUCCESS: returning ${results.length} result(s) ──`);
    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[detect-room-types] ── UNHANDLED ERROR ──`, error);
    console.error(`[detect-room-types] Error type: ${error?.constructor?.name}, message: ${error instanceof Error ? error.message : String(error)}`);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Detection failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
