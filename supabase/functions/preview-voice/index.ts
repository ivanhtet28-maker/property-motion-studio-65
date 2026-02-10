/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

// Voice ID mapping
const VOICE_IDS: Record<string, string> = {
  "Australian Male": "TxGEqnHWrfWFTfGW9XjX",
  "Australian Female": "21m00Tcm4TlvDq8ikWAM",
  "British Male": "VR6AewLTigWG4xSOukaG",
  "British Female": "EXAVITQu4vr4xnSDxMaL",
  "American Male": "VR6AewLTigWG4xSOukaG",
  "American Female": "EXAVITQu4vr4xnSDxMaL",
};

const SAMPLE_TEXT = "Welcome to this stunning property. This beautifully designed home offers modern living at its finest.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { voiceType } = await req.json();

    if (!voiceType) {
      throw new Error("voiceType is required");
    }

    const elevenLabsVoiceId = VOICE_IDS[voiceType] || VOICE_IDS["Australian Male"];

    console.log(`Generating voice preview with ElevenLabs voice: ${elevenLabsVoiceId}`);

    // Call ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY!,
        },
        body: JSON.stringify({
          text: SAMPLE_TEXT,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs API error: ${error}`);
    }

    // Stream the audio back to the client
    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("Error generating voice preview:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate voice preview",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
