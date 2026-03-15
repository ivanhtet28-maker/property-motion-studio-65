/// <reference types="https://esm.sh/@supabase/functions-js/src/edge-runtime.d.ts" />
import { corsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SHOTSTACK_API_KEY = Deno.env.get("SHOTSTACK_API_KEY");

interface TextOverlay {
  id: string;
  content: string;
  fontSize?: number;
  color?: string;
  startTime?: number;
  duration?: number;
  position?: string;
}

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
    musicVolume?: number; // 0-100 (camelCase alias)
    voiceover_volume?: number; // 0-100
    voiceoverVolume?: number; // 0-100 (camelCase alias)
    music_fade_in?: number; // seconds
    music_fade_out?: number; // seconds
    video_speed?: number; // 0.8-1.5
    clip_duration?: number; // 2-5 seconds (uniform for all clips)
    clipDurations?: number[]; // per-clip durations
    cameraAngles?: string[]; // per-clip camera angles
    selectedTemplate?: string; // template override
    textOverlays?: TextOverlay[]; // custom text overlay layers
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
  const defaultClipDuration = changes.clip_duration || 3.5;
  const speed = changes.video_speed || 1.0;
  const clipDurations = changes.clipDurations || [];
  const cameraAngles = changes.cameraAngles || [];

  // Parse photos/imageUrls and existing clip video URLs from the video record
  let imageUrls: string[] = [];
  let clipVideoUrls: string[] = [];
  if (video.photos) {
    try {
      const parsed = typeof video.photos === "string" ? JSON.parse(video.photos as string) : video.photos;
      if (parsed.imageUrls) imageUrls = parsed.imageUrls;
    } catch { /* ignore */ }
  }

  // Check clips column for individual clip video URLs
  if (Array.isArray(video.clips)) {
    clipVideoUrls = (video.clips as Array<{ url?: string }>)
      .map((c) => c.url || "")
      .filter(Boolean);
  }

  // Video clips track — prefer individual clip URLs, then full video, then images
  if (clipVideoUrls.length > 0) {
    // Per-clip video URLs (from regenerate-clip results)
    let offset = 0;
    tracks.push({
      clips: clipVideoUrls.map((url, i) => {
        const dur = clipDurations[i] || defaultClipDuration;
        const clip = {
          asset: {
            type: "video" as const,
            src: url,
            ...(speed !== 1.0 ? { playbackRate: speed } : {}),
          },
          start: offset,
          length: dur,
          transition: { in: "fade", out: "fade" },
        };
        offset += dur;
        return clip;
      }),
    });
  } else if (video.video_url) {
    tracks.push({
      clips: [{
        asset: {
          type: "video",
          src: video.video_url as string,
          ...(speed !== 1.0 ? { playbackRate: speed } : {}),
        },
        start: 0,
        length: (video.duration as number) || 30,
      }],
    });
  } else if (imageUrls.length > 0) {
    let offset = 0;
    tracks.push({
      clips: imageUrls.map((url, i) => {
        const dur = clipDurations[i] || defaultClipDuration;
        const clip = {
          asset: {
            type: "image" as const,
            src: url,
          },
          start: offset,
          length: dur,
          effect: "zoomInSlow",
        };
        offset += dur;
        return clip;
      }),
    });
  }

  // Calculate total duration
  const clipCount = clipVideoUrls.length || imageUrls.length || 1;
  let totalDuration = 0;
  for (let i = 0; i < clipCount; i++) {
    totalDuration += clipDurations[i] || defaultClipDuration;
  }
  if (!clipVideoUrls.length && !imageUrls.length && video.duration) {
    totalDuration = video.duration as number;
  }

  // Text overlay track — agent info
  const agentName = changes.agent_name || (video.agent_name as string) || "";
  const agentPhone = changes.agent_phone || (video.agent_phone as string) || "";

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
        start: Math.max(0, totalDuration - 5),
        length: Math.min(5, totalDuration),
        position: "bottom",
        offset: { y: -0.1 },
      }],
    });
  }

  // Custom text overlays from the editor
  if (changes.textOverlays && changes.textOverlays.length > 0) {
    for (const overlay of changes.textOverlays) {
      tracks.push({
        clips: [{
          asset: {
            type: "html",
            html: `<div style="font-family: Arial, sans-serif; color: ${overlay.color || "#ffffff"}; text-align: center; padding: 16px;">
              <p style="font-size: ${overlay.fontSize || 48}px; font-weight: bold; margin: 0;">${overlay.content}</p>
            </div>`,
            width: 600,
            height: 200,
          },
          start: overlay.startTime || 0,
          length: overlay.duration || 5,
          position: overlay.position || "center",
        }],
      });
    }
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

  // Apply per-clip duration and camera angle changes
  if (changes.clipDurations || changes.clip_duration) {
    let offset = 0;
    let clipIdx = 0;
    for (const track of timeline.tracks) {
      if (!track.clips) continue;
      for (const clip of track.clips) {
        if (clip.asset?.type === "image" || clip.asset?.type === "video") {
          const dur = changes.clipDurations?.[clipIdx] || changes.clip_duration || clip.length;
          clip.start = offset;
          clip.length = dur;
          offset += dur;
          clipIdx++;
        }
      }
    }
  }

  // Apply audio volume changes (accept both snake_case and camelCase)
  const musicVol = changes.music_volume ?? changes.musicVolume;
  const voiceoverVol = changes.voiceover_volume ?? changes.voiceoverVolume;

  if (musicVol !== undefined || changes.music_fade_in !== undefined || changes.music_fade_out !== undefined) {
    for (const track of timeline.tracks) {
      if (!track.clips) continue;
      for (const clip of track.clips) {
        if (clip.asset?.type === "audio") {
          if (musicVol !== undefined) {
            clip.asset.volume = musicVol / 100;
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
  if (voiceoverVol !== undefined) {
    for (const track of timeline.tracks) {
      if (!track.clips) continue;
      for (const clip of track.clips) {
        if (clip.asset?.type === "audio" && clip.asset?.src?.includes("voiceover")) {
          clip.asset.volume = voiceoverVol / 100;
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

  // Add/replace custom text overlays
  if (changes.textOverlays && changes.textOverlays.length > 0) {
    // Remove any existing custom text overlay tracks (tagged with _studio_overlay)
    timeline.tracks = timeline.tracks.filter(
      (t: Record<string, unknown>) => !t._studio_overlay,
    );

    // Add new text overlay tracks
    for (const overlay of changes.textOverlays) {
      timeline.tracks.push({
        _studio_overlay: true,
        clips: [{
          asset: {
            type: "html",
            html: `<div style="font-family: Arial, sans-serif; color: ${overlay.color || "#ffffff"}; text-align: center; padding: 16px;">
              <p style="font-size: ${overlay.fontSize || 48}px; font-weight: bold; margin: 0;">${overlay.content}</p>
            </div>`,
            width: 600,
            height: 200,
          },
          start: overlay.startTime || 0,
          length: overlay.duration || 5,
          position: overlay.position || "center",
        }],
      });
    }
  }

  return updated;
}
