/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";

const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");

interface StudioEditRequest {
  videoId: string;
  changes: {
    clipDurations?: number[];
    cameraAngles?: string[];
    musicVolume?: number;
    voiceoverVolume?: number;
    selectedTemplate?: string;
    textOverlays?: Array<{
      id: string;
      content: string;
      fontSize: number;
      color: string;
      startTime: number;
      duration: number;
      position?: string;
    }>;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { user, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: StudioEditRequest = await req.json();
    const { videoId, changes } = body;

    if (!videoId || !changes) {
      throw new Error("videoId and changes are required");
    }

    if (!SHOTSTACK_API_KEY) {
      throw new Error("SHOTSTACK_API_KEY not configured");
    }

    console.log("studio-edit: Processing edits for video", videoId);

    // 1. Fetch original video record
    const { data: video, error: fetchError } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user!.id)
      .single();

    if (fetchError || !video) {
      throw new Error(`Video not found: ${fetchError?.message}`);
    }

    // 2. Mark as editing
    await supabase.from("videos").update({ is_editing: true }).eq("id", videoId);

    // 3. Build updated Shotstack composition
    let composition = video.photos || {};

    // Apply clip duration changes
    if (changes.clipDurations && Array.isArray(composition.clips)) {
      composition.clips = composition.clips.map((clip: any, idx: number) => ({
        ...clip,
        duration: changes.clipDurations![idx] || clip.duration,
      }));
    }

    // Apply camera angle changes
    if (changes.cameraAngles && Array.isArray(composition.clips)) {
      composition.clips = composition.clips.map((clip: any, idx: number) => ({
        ...clip,
        cameraAction: changes.cameraAngles![idx] || clip.cameraAction,
      }));
    }

    // Apply music/voiceover volume changes
    if (changes.musicVolume !== undefined) {
      if (composition.tracks) {
        composition.tracks = composition.tracks.map((track: any) => {
          if (track.type === "music") {
            return { ...track, volume: changes.musicVolume };
          }
          return track;
        });
      }
    }

    if (changes.voiceoverVolume !== undefined) {
      if (composition.tracks) {
        composition.tracks = composition.tracks.map((track: any) => {
          if (track.type === "voiceover" || track.type === "audio") {
            return { ...track, volume: changes.voiceoverVolume };
          }
          return track;
        });
      }
    }

    // Apply text overlay changes
    if (changes.textOverlays && Array.isArray(changes.textOverlays)) {
      if (!composition.tracks) composition.tracks = [];

      // Remove old studio overlays
      composition.tracks = composition.tracks.filter(
        (t: any) => !t._studio_overlay
      );

      // Add new overlays
      const newOverlayTracks = changes.textOverlays.map((overlay: any) => ({
        type: "text",
        _studio_overlay: true,
        id: overlay.id,
        text: {
          content: overlay.content,
          fontSize: overlay.fontSize,
          color: overlay.color,
          position: overlay.position || "center",
        },
        startTime: overlay.startTime,
        duration: overlay.duration,
      }));

      composition.tracks.push(...newOverlayTracks);
    }

    console.log("studio-edit: Updated composition, calling Shotstack Edit API");

    // 4. Call Shotstack Edit API
    const shotstackResponse = await fetch("https://api.shotstack.io/v1/edit", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SHOTSTACK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeline: composition,
        output: { format: "mp4", resolution: "1080p" },
      }),
    });

    if (!shotstackResponse.ok) {
      const errText = await shotstackResponse.text();
      throw new Error(`Shotstack Edit API failed (${shotstackResponse.status}): ${errText}`);
    }

    const shotstackData = await shotstackResponse.json();
    const newRenderId = shotstackData.response?.id;

    if (!newRenderId) {
      throw new Error("Shotstack did not return a render ID");
    }

    console.log("studio-edit: New render ID:", newRenderId);

    // 5. Update DB with new render ID and edit history
    const editRecord = {
      timestamp: new Date().toISOString(),
      changes: changes,
      renderId: newRenderId,
    };

    const { error: updateError } = await supabase
      .from("videos")
      .update({
        current_render_id: newRenderId,
        original_render_id: video.original_render_id || video.render_id,
        edit_history: (video.edit_history || []).concat([editRecord]),
        is_editing: false,
      })
      .eq("id", videoId);

    if (updateError) {
      throw new Error(`Failed to update video: ${updateError.message}`);
    }

    console.log("studio-edit: Complete for video", videoId);

    return new Response(
      JSON.stringify({
        success: true,
        renderId: newRenderId,
        estimatedSeconds: 45,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("studio-edit error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
