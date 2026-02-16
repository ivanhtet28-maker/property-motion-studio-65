/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");

// ElevenLabs Voice ID mapping
// You can find more voices at: https://elevenlabs.io/voice-library
const VOICE_IDS: Record<string, string> = {
    "australian-male": "TxGEqnHWrfWFTfGW9XjX",
    "australian-female": "EXAVITQu4vr4xnSDxMaL",  // Added - using American Female as placeholder
    "british-male": "VR6AewLTigWG4xSOukaG",       // Added - using American Male as placeholder
    "british-female": "21m00Tcm4TlvDq8ikWAM",
    "american-male": "VR6AewLTigWG4xSOukaG",
    "american-female": "EXAVITQu4vr4xnSDxMaL",
  };

interface GenerateAudioRequest {
  script: string;
  voiceId: string;
  videoId?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { script, voiceId, videoId }: GenerateAudioRequest = await req.json();

    console.log("=== GENERATE AUDIO (ElevenLabs TTS) ===");
    console.log("Voice ID:", voiceId);
    console.log("Script length:", script?.length || 0, "characters");
    console.log("Video ID:", videoId || "none");

    // Validate input
    if (!script || !voiceId) {
      return new Response(
        JSON.stringify({ error: "Script and voiceId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ELEVENLABS_API_KEY) {
      console.error("ELEVENLABS_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Voice synthesis service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get ElevenLabs voice ID from mapping
    const elevenLabsVoiceId = VOICE_IDS[voiceId] || VOICE_IDS["australian-male"];
    console.log("Using ElevenLabs voice:", elevenLabsVoiceId);

    // Call ElevenLabs Text-to-Speech API
    console.log("Calling ElevenLabs TTS API...");
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`,
      {
        method: "POST",
        headers: {
          "Accept": "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: script,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error("ElevenLabs API error:", ttsResponse.status, errorText);
      throw new Error(`ElevenLabs API error: ${ttsResponse.status} - ${errorText}`);
    }

    // Get audio buffer
    const audioBuffer = await ttsResponse.arrayBuffer();
    console.log("Audio generated, size:", audioBuffer.byteLength, "bytes");

    // Upload to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const fileName = `voiceover-${videoId || Date.now()}.mp3`;
    console.log("Uploading to Supabase Storage:", fileName);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("video-assets")
      .upload(`audio/${fileName}`, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload audio: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("video-assets")
      .getPublicUrl(`audio/${fileName}`);

    const audioUrl = urlData.publicUrl;
    console.log("Audio uploaded successfully:", audioUrl);

    return new Response(
      JSON.stringify({
        success: true,
        audioUrl: audioUrl,
        fileName: fileName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error generating audio:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to generate audio",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
