/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const ALLOWED_ORIGIN = (Deno.env.get("CORS_ALLOWED_ORIGIN") || "*").replace(/\/+$/, "");
const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
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
  "orbit-right",
  "orbit-left",
  "pullback-wide",
  "pullback-reveal-right",
  "pullback-reveal-left",
  "gentle-push",
  "drift-through",
  "crane-up",
  "crane-up-drift-right",
  "crane-up-drift-left",
  "approach-gentle",
  "parallax-exterior",
  "float-back",
] as const;

const DETECTION_PROMPT = `You are an elite real estate cinematographer scouting a property photo before filming a 9:16 portrait video for a luxury property listing. Your job: analyze this image and decide the single best camera move.

THINK THROUGH THESE STEPS:

Step 1 — ROOM TYPE: Classify this photo. Valid types: exterior-arrival, front-door, entry-foyer, living-room-wide, living-room-orbit, kitchen-orbit, kitchen-push, master-bedroom, bedroom, bathroom, outdoor-entertaining, backyard-pool, view-balcony

Step 2 — READ THE SPACE: As a videographer standing at the camera position, assess:
- What is the hero feature that a buyer would notice first?
- What is on the left side of the frame?
- What is on the right side of the frame?
- Are there any obstructions (fences, gates, walls) in the foreground?
- For exteriors: is the facade symmetrical? How many stories? Is there a fence?
- For living rooms: is there a kitchen visible in the frame? Which side?
- For bedrooms: where is the bed? What is more visually interesting — left or right side?

Step 3 — IDENTIFY HAZARDS that would ruin the shot:
- window-glare (bright sky through windows — camera should avoid)
- fence-obstruction (fence/gate/wall blocking foreground — camera must rise above)
- driveway-flat (pavement dominates bottom third — camera should ignore ground)
- bed-dominant (bed fills most of frame — camera must pull BACK, never push forward)
- dead-wall (one direction leads to blank wall — avoid that direction)
- List all that apply, comma-separated. Or "none".

Step 4 — CHOOSE YOUR SHOT: Pick the single best camera move.

Think like a real videographer. Where would you place the camera, and what would you reveal as it moves? Always move TOWARD the most impressive feature. Never move toward blank walls, fences, or empty space.

Available camera intents:

INTERIOR MOVES:
- orbit-right: Smooth lateral orbit revealing what is on the right. Use when the best feature (kitchen, fireplace, staircase, feature wall) is on the right side.
- orbit-left: Smooth lateral orbit revealing what is on the left. Use when the best feature is on the left side.
- pullback-wide: Slow pull backward revealing room scale. Use for bedrooms with centered beds, tight bathrooms, or any room where the story is "look how spacious this is."
- pullback-reveal-right: Pull back while subtly drifting right. Use for bedrooms where the bed is on the left — reveals floor space on the right while pulling back.
- pullback-reveal-left: Pull back while subtly drifting left. Use for bedrooms where the bed is on the right — reveals floor space on the left while pulling back.
- gentle-push: Very slow forward creep. ONLY for bathrooms approaching vanity/shower, or narrow hallways. NEVER for bedrooms. NEVER for living rooms with windows ahead.
- drift-through: Floating lateral glide with minimal zoom. For long spaces like entries, hallways, open-plan rooms showing flow between areas.

EXTERIOR MOVES:
- crane-up: Pure vertical rise, no lateral. For symmetrical facades WITH fences. Rises above the fence, reveals upper stories, keeps centered.
- crane-up-drift-right: Rising crane drifting right. For asymmetric facades with fence, entrance on right.
- crane-up-drift-left: Rising crane drifting left. For asymmetric facades with fence, entrance on left.
- approach-gentle: Slow forward with subtle rise. For homes WITHOUT fences where walking toward the front door works.
- parallax-exterior: Lateral glide past facade. For single-story homes without fences where width is the statement.

OUTDOOR MOVES:
- float-back: Rising pullback from above. For pools, backyards, entertaining areas.

BEDROOM RULES (critical):
- NEVER choose gentle-push for a bedroom. The camera must NEVER move forward into a bed.
- Always choose pullback-wide, pullback-reveal-left, or pullback-reveal-right.
- If the bed is centered: pullback-wide.
- If the bed is on the left: pullback-reveal-right (drift away from bed).
- If the bed is on the right: pullback-reveal-left (drift away from bed).
- If there is a standout feature (staircase, fireplace, feature wall, artwork) on one side, drift TOWARD it while pulling back.

EXTERIOR RULES (critical):
- If there is a fence, gate, or wall in the foreground: MUST choose crane-up or crane-up-drift. Never approach-gentle or parallax-exterior.
- If the facade is symmetrical: MUST choose crane-up (pure vertical, no lateral drift).
- If single story with no fence: parallax-exterior or approach-gentle are fine.

LIVING ROOM RULES (critical):
- If a kitchen is visible in the frame: ALWAYS orbit TOWARD the kitchen. The kitchen reveal is the payoff of an open-plan shot. This overrides everything else.
- If no kitchen but a standout feature exists: orbit toward it.
- If no kitchen and windows are causing glare: orbit AWAY from windows.

ENTRY/FOYER RULES (critical):
- If a staircase is visible: orbit TOWARD the staircase. The staircase reveal is the architectural highlight.
- If the staircase is on the left side of the frame: MUST choose orbit-left.
- If the staircase is on the right side of the frame: MUST choose orbit-right.
- Never choose an orbit direction that moves AWAY from a visible staircase.
- If no staircase but an open-plan flow to other rooms: drift-through.

FINAL VALIDATION — Before you commit to your answer, run this checklist:
1. Is this an exterior with a fence/gate/wall? → You MUST choose crane-up or crane-up-drift. If you chose orbit, approach, or parallax, CHANGE IT NOW.
2. Is this a bedroom? → You MUST choose pullback-wide, pullback-reveal-left, or pullback-reveal-right. If you chose gentle-push, CHANGE IT NOW.
3. Does your chosen direction move TOWARD the hero feature? → If not, flip the direction (orbit-left ↔ orbit-right).
4. Does your chosen direction move TOWARD a blank wall, fence, or empty space? → If so, flip the direction.

Step 5 — JUSTIFY in one sentence why this is the right shot.

OUTPUT FORMAT — exactly these 5 lines, no extra text:
ROOM_TYPE: [type from valid list]
CAMERA_INTENT: [intent from available list above]
HERO_FEATURE: [2-5 word description of what the camera reveals]
HAZARDS: [comma-separated list or "none"]
REASONING: [one sentence]`;

interface DetectionResult {
  room_type: RoomType;
  camera_intent: string;
  hero_feature: string;
  hazards: string;
}

function getDefaultIntent(roomType: string): string {
  if (roomType.startsWith("exterior") || roomType === "front-door") return "crane-up";
  if (roomType === "entry-foyer") return "drift-through";
  if (roomType.startsWith("living-room")) return "orbit-right";
  if (roomType.startsWith("kitchen")) return "orbit-right";
  if (roomType === "master-bedroom" || roomType === "bedroom") return "pullback-wide";
  if (roomType === "bathroom") return "gentle-push";
  return "float-back";
}

async function detectSingleRoomType(
  base64: string,
  mimeType: string
): Promise<DetectionResult> {
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

  if (!response.ok) {
    const errorText = await response.text();
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

    console.log(`=== DETECT ROOM TYPES (Claude Vision — CAMERA_INTENT system) ===`);
    console.log(`Classifying ${body.images.length} image(s)...`);

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
            camera_intent: "pullback-wide",
            hero_feature: "none",
            hazards: "none",
          };
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
