/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");

interface StudioEditRequest {
  videoId: string;
  changes: {
    agent_name?: string;
    agent_phone?: string;
    agent_email?: string;
    agent_company?: string;
    property_address?: string;
    custom_title?: string;
    music_volume?: number; // 0-100
    voiceover_volume?: number; // 0-100
    music_fade_in?: number; // seconds
    music_fade_out?: number; // seconds
    video_speed?: number; // 0.8-1.5
    clip_duration?: number; // 2-5 seconds
    logo_url?: string;
    logo_position?: string;
    color_scheme?: string;
    font_family?: string;
    output_format?: string; // mp4 | webm
    resolution?: string; // hd | 4k
    aspect_ratio?: string; // 9:16 | 16:9 | 1:1
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { user, error: authErr } = await requireAuth(req);
    if (authErr) return authErr;

    if (!SHOTSTACK_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Shotstack API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: StudioEditRequest = await req.json();
    const { videoId, changes } = body;

    if (!videoId || !changes) {
      return new Response(
        JSON.stringify({ error: "videoId and changes are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the video record (must belong to user)
    const { data: video, error: fetchErr } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .eq("user_id", user!.id)
      .single();

    if (fetchErr || !video) {
      return new Response(
        JSON.stringify({ error: "Video not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (video.is_editing) {
      return new Response(
        JSON.stringify({ error: "Video is currently being re-rendered. Please wait." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get the existing composition or build one from video data
    let composition = video.shotstack_composition;

    if (!composition) {
      // Build a basic composition from the video's current data
      // This handles videos created before studio edit was available
      composition = buildCompositionFromVideo(video, changes);
    } else {
      // Apply changes to the existing composition
      composition = applyChangesToComposition(composition, changes, video);
    }

    // Apply output settings
    const outputFormat = changes.output_format || "mp4";
    const resolution = changes.resolution === "4k" ? "4096x2160" : "1920x1080";
    let aspectSize: { width: number; height: number };

    switch (changes.aspect_ratio || video.aspect_ratio || "9:16") {
      case "16:9":
        aspectSize = { width: 1920, height: 1080 };
        break;
      case "1:1":
        aspectSize = { width: 1080, height: 1080 };
        break;
      default: // 9:16
        aspectSize = { width: 1080, height: 1920 };
        break;
    }

    if (changes.resolution === "4k") {
      aspectSize.width *= 2;
      aspectSize.height *= 2;
    }

    const edit = {
      timeline: composition.timeline || composition,
      output: {
        format: outputFormat,
        size: aspectSize,
        fps: 30,
      },
    };

    // Mark video as editing
    await supabase
      .from("videos")
      .update({
        is_editing: true,
        status: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", videoId);

    // Submit to Shotstack Edit API
    console.log("Submitting studio edit to Shotstack...");
    const response = await fetch("https://api.shotstack.io/v1/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SHOTSTACK_API_KEY,
      },
      body: JSON.stringify(edit),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Shotstack API error:", errText);

      // Reset editing flag on failure
      await supabase
        .from("videos")
        .update({ is_editing: false, status: "completed" })
        .eq("id", videoId);

      return new Response(
        JSON.stringify({ error: `Shotstack API error: ${errText}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const newRenderId = data.response?.id;

    if (!newRenderId) {
      await supabase
        .from("videos")
        .update({ is_editing: false, status: "completed" })
        .eq("id", videoId);

      return new Response(
        JSON.stringify({ error: "No render ID returned from Shotstack" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Update video record with new render info
    const editRecord = {
      edited_at: new Date().toISOString(),
      changes,
      render_id: newRenderId,
    };

    const existingHistory = video.edit_history || [];

    // Update DB fields that were changed
    const updateFields: Record<string, unknown> = {
      current_render_id: newRenderId,
      render_id: newRenderId,
      edit_history: [...existingHistory, editRecord],
      shotstack_composition: composition,
      updated_at: new Date().toISOString(),
    };

    if (changes.agent_name !== undefined) updateFields.agent_name = changes.agent_name;
    if (changes.agent_phone !== undefined) updateFields.agent_phone = changes.agent_phone;
    if (changes.agent_email !== undefined) updateFields.agent_email = changes.agent_email;
    if (changes.agent_company !== undefined) updateFields.agent_company = changes.agent_company;
    if (changes.aspect_ratio !== undefined) updateFields.aspect_ratio = changes.aspect_ratio;

    await supabase
      .from("videos")
      .update(updateFields)
      .eq("id", videoId);

    console.log("Studio edit submitted, render ID:", newRenderId);

    return new Response(
      JSON.stringify({
        success: true,
        renderId: newRenderId,
        estimatedTime: 45,
        message: "Re-rendering started",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Studio edit error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to process studio edit",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildCompositionFromVideo(
  video: Record<string, unknown>,
  changes: StudioEditRequest["changes"],
): Record<string, unknown> {
  // Build a minimal Shotstack timeline from stored video data
  const tracks: unknown[] = [];
  const clipDuration = changes.clip_duration || 3.5;
  const speed = changes.video_speed || 1.0;

  // Parse photos/imageUrls from the video record
  let imageUrls: string[] = [];
  if (video.photos) {
    try {
      const parsed = typeof video.photos === "string" ? JSON.parse(video.photos as string) : video.photos;
      if (parsed.imageUrls) imageUrls = parsed.imageUrls;
    } catch { /* ignore */ }
  }

  // Video clips track
  if (video.video_url) {
    tracks.push({
      clips: [{
        asset: {
          type: "video",
          src: video.video_url as string,
        },
        start: 0,
        length: (video.duration as number) || 30,
        effect: speed !== 1.0 ? `speed${speed}x` : undefined,
      }],
    });
  } else if (imageUrls.length > 0) {
    tracks.push({
      clips: imageUrls.map((url, i) => ({
        asset: {
          type: "image",
          src: url,
        },
        start: i * clipDuration,
        length: clipDuration,
        effect: "zoomInSlow",
      })),
    });
  }

  // Text overlay track
  const agentName = changes.agent_name || (video.agent_name as string) || "";
  const agentPhone = changes.agent_phone || (video.agent_phone as string) || "";
  const totalDuration = imageUrls.length > 0
    ? imageUrls.length * clipDuration
    : (video.duration as number) || 30;

  if (agentName || agentPhone) {
    tracks.push({
      clips: [{
        asset: {
          type: "html",
          html: `<div style="font-family: Arial, sans-serif; color: white; text-align: center; padding: 20px;">
            <p style="font-size: 32px; font-weight: bold; margin: 0;">${agentName}</p>
            ${agentPhone ? `<p style="font-size: 20px; margin-top: 8px;">${agentPhone}</p>` : ""}
          </div>`,
          width: 400,
          height: 120,
        },
        start: totalDuration - 5,
        length: 5,
        position: "bottom",
        offset: { y: -0.1 },
      }],
    });
  }

  return {
    timeline: {
      tracks,
      background: "#000000",
    },
  };
}

function applyChangesToComposition(
  composition: Record<string, unknown>,
  changes: StudioEditRequest["changes"],
  video: Record<string, unknown>,
): Record<string, unknown> {
  const updated = JSON.parse(JSON.stringify(composition));
  const timeline = updated.timeline || updated;

  if (!timeline.tracks) return updated;

  // Apply speed changes to video clips
  if (changes.video_speed && changes.video_speed !== 1.0) {
    for (const track of timeline.tracks) {
      if (!track.clips) continue;
      for (const clip of track.clips) {
        if (clip.asset?.type === "video") {
          clip.fit = "none";
          // Shotstack speed via playbackRate
          clip.asset.playbackRate = changes.video_speed;
        }
      }
    }
  }

  // Apply clip duration changes to image clips
  if (changes.clip_duration) {
    let offset = 0;
    for (const track of timeline.tracks) {
      if (!track.clips) continue;
      for (const clip of track.clips) {
        if (clip.asset?.type === "image") {
          clip.start = offset;
          clip.length = changes.clip_duration;
          offset += changes.clip_duration;
        }
      }
    }
  }

  // Apply audio volume changes
  if (changes.music_volume !== undefined || changes.music_fade_in !== undefined || changes.music_fade_out !== undefined) {
    for (const track of timeline.tracks) {
      if (!track.clips) continue;
      for (const clip of track.clips) {
        if (clip.asset?.type === "audio") {
          if (changes.music_volume !== undefined) {
            clip.asset.volume = changes.music_volume / 100;
          }
          if (changes.music_fade_in !== undefined) {
            clip.transition = clip.transition || {};
            clip.transition.in = { effect: "fadeIn", duration: changes.music_fade_in };
          }
          if (changes.music_fade_out !== undefined) {
            clip.transition = clip.transition || {};
            clip.transition.out = { effect: "fadeOut", duration: changes.music_fade_out };
          }
        }
      }
    }
  }

  // Apply voiceover volume
  if (changes.voiceover_volume !== undefined) {
    for (const track of timeline.tracks) {
      if (!track.clips) continue;
      for (const clip of track.clips) {
        if (clip.asset?.type === "audio" && clip.asset?.src?.includes("voiceover")) {
          clip.asset.volume = changes.voiceover_volume / 100;
        }
      }
    }
  }

  // Update text overlays with new agent info
  const agentName = changes.agent_name || (video.agent_name as string);
  const agentPhone = changes.agent_phone || (video.agent_phone as string);
  const agentEmail = changes.agent_email || (video.agent_email as string);

  if (agentName || agentPhone || agentEmail) {
    for (const track of timeline.tracks) {
      if (!track.clips) continue;
      for (const clip of track.clips) {
        if (clip.asset?.type === "html" && typeof clip.asset.html === "string") {
          let html = clip.asset.html;
          // Replace template variables
          if (agentName) html = html.replace(/\{\{agent_name\}\}/g, agentName);
          if (agentPhone) html = html.replace(/\{\{agent_phone\}\}/g, agentPhone);
          if (agentEmail) html = html.replace(/\{\{agent_email\}\}/g, agentEmail);
          clip.asset.html = html;
        }
      }
    }
  }

  return updated;
}
