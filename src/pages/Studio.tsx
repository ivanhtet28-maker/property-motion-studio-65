import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Download,
  AlertCircle,
  Check,
  RotateCcw,
  Clock,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import VideoPlayer from "@/components/VideoPlayer";
import EditControls, { type StudioChanges } from "@/components/EditControls";

// ── Types ──────────────────────────────────────────────────────────────────

interface VideoRecord {
  id: string;
  user_id: string;
  video_url: string | null;
  thumbnail_url: string | null;
  status: string;
  duration: number | null;
  template: string | null;
  style: string | null;
  music_id: string | null;
  voice_id: string | null;
  aspect_ratio: string | null;
  agent_name: string | null;
  agent_company: string | null;
  agent_phone: string | null;
  agent_email: string | null;
  property_address?: string | null;
  render_id: string | null;
  original_render_id: string | null;
  current_render_id: string | null;
  is_editing: boolean | null;
  edit_history: unknown[] | null;
  shotstack_composition: unknown | null;
  photos: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function Studio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // Video data
  const [video, setVideo] = useState<VideoRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [changes, setChanges] = useState<StudioChanges>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);

  // Track the latest video URL (may change after re-render)
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null);

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load video data ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!id || !user?.id) return;

    (async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from("videos")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();

        if (fetchErr) throw fetchErr;
        if (!data) throw new Error("Video not found");

        setVideo(data as VideoRecord);
        setCurrentVideoUrl(data.video_url);

        // Pre-populate changes from existing data
        setChanges({
          agent_name: data.agent_name || undefined,
          agent_phone: data.agent_phone || undefined,
          agent_email: data.agent_email || undefined,
          agent_company: data.agent_company || undefined,
          music_volume: 80,
          voiceover_volume: 100,
          music_fade_in: 1,
          music_fade_out: 2,
          video_speed: 1.0,
          clip_duration: 3.5,
          output_format: "mp4",
          resolution: "hd",
          aspect_ratio: data.aspect_ratio || "9:16",
        });

        // If video is currently editing, start polling
        if (data.is_editing && data.current_render_id) {
          startPolling(data.current_render_id, data.id);
        }
      } catch (err) {
        console.error("Failed to load video:", err);
        setError(err instanceof Error ? err.message : "Failed to load video");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [id, user]);

  // ── Warn on unsaved changes ──────────────────────────────────────────────

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  // ── Handle changes ───────────────────────────────────────────────────────

  const handleChange = useCallback((newChanges: StudioChanges) => {
    setChanges(newChanges);
    setHasUnsavedChanges(true);
  }, []);

  // ── Poll for render completion ───────────────────────────────────────────

  const startPolling = useCallback((renderId: string, videoId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setRenderStatus("Re-rendering video...");
    setIsApplying(true);

    let pollCount = 0;
    const MAX_POLLS = 90; // ~4.5 minutes at 3s intervals

    pollRef.current = setInterval(async () => {
      pollCount++;

      if (pollCount > MAX_POLLS) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setRenderStatus(null);
        setIsApplying(false);
        toast({
          title: "Render timeout",
          description: "The re-render is taking longer than expected. Please check back later.",
          variant: "destructive",
        });
        return;
      }

      try {
        // Check Shotstack render status
        const statusRes = await fetch(`https://api.shotstack.io/v1/render/${renderId}`, {
          headers: { "x-api-key": "" }, // Will be handled server-side
        }).catch(() => null);

        // Fallback: poll the video record
        const { data } = await supabase
          .from("videos")
          .select("video_url, status, is_editing, current_render_id")
          .eq("id", videoId)
          .single();

        if (data) {
          if (data.status === "completed" && !data.is_editing) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setRenderStatus(null);
            setIsApplying(false);

            if (data.video_url) {
              setCurrentVideoUrl(data.video_url);
              setVideo((prev) => prev ? { ...prev, video_url: data.video_url, is_editing: false, status: "completed" } : prev);
            }

            toast({ title: "Video re-rendered!", description: "Your changes have been applied." });
            setHasUnsavedChanges(false);
            return;
          }

          if (data.status === "failed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setRenderStatus(null);
            setIsApplying(false);
            setVideo((prev) => prev ? { ...prev, is_editing: false, status: "failed" } : prev);
            toast({ title: "Render failed", description: "Please try again.", variant: "destructive" });
            return;
          }

          // Update progress message
          if (pollCount < 10) {
            setRenderStatus("Submitting to render engine...");
          } else if (pollCount < 30) {
            setRenderStatus("Rendering video clips...");
          } else {
            setRenderStatus("Finalizing video...");
          }
        }
      } catch (err) {
        console.warn("Poll error:", err);
      }
    }, 3000);
  }, [toast]);

  // ── Apply Changes ────────────────────────────────────────────────────────

  const handleApplyChanges = useCallback(async () => {
    if (!video || !id) return;

    setIsApplying(true);
    setRenderStatus("Submitting changes...");

    try {
      const result = await invokeEdgeFunction<{
        success: boolean;
        renderId: string;
        estimatedTime: number;
        error?: string;
      }>("studio-edit", {
        body: {
          videoId: id,
          changes,
        },
      });

      if (result.renderId) {
        toast({
          title: "Re-rendering started",
          description: `Estimated time: ~${result.estimatedTime || 45} seconds`,
        });

        // Update local state
        setVideo((prev) => prev ? { ...prev, is_editing: true, status: "processing" } : prev);

        // Start polling for completion
        startPolling(result.renderId, id);
      }
    } catch (err) {
      console.error("Apply changes error:", err);
      setIsApplying(false);
      setRenderStatus(null);
      toast({
        title: "Failed to apply changes",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    }
  }, [video, id, changes, toast, startPolling]);

  // ── Download ─────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async () => {
    const url = currentVideoUrl;
    if (!url) return;

    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `propertymotion-${video?.id?.slice(0, 8) || "video"}.${changes.output_format || "mp4"}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      toast({ title: "Download failed", description: "Please try again.", variant: "destructive" });
    }
  }, [currentVideoUrl, video, changes.output_format, toast]);

  // ── Loading State ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background gap-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-foreground font-medium">{error || "Video not found"}</p>
        <Button variant="outline" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  // ── Main Layout ──────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ── Top Bar ───────────────────────────────────────────────── */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 flex-shrink-0 bg-card">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Leave anyway?")) return;
              navigate("/dashboard");
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Studio</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Unsaved changes indicator */}
          {hasUnsavedChanges && !isApplying && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 text-amber-600 text-xs font-medium rounded-full">
              <Clock className="w-3 h-3" />
              Unsaved changes
            </span>
          )}

          {/* Edit history count */}
          {video.edit_history && video.edit_history.length > 0 && (
            <span className="px-2.5 py-1 bg-secondary text-muted-foreground text-xs font-medium rounded-full">
              {video.edit_history.length} edit{video.edit_history.length !== 1 ? "s" : ""}
            </span>
          )}

          {/* Download button */}
          {currentVideoUrl && !isApplying && (
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4" />
              Download
            </Button>
          )}

          {/* Apply Changes button */}
          <Button
            variant="hero"
            size="sm"
            onClick={handleApplyChanges}
            disabled={isApplying || !hasUnsavedChanges}
          >
            {isApplying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Rendering...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Apply Changes
              </>
            )}
          </Button>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Panel: Video Preview ──────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 flex items-center justify-center bg-[#1a1a2e] p-6">
            <div className="w-full max-w-sm">
              <VideoPlayer
                src={currentVideoUrl}
                thumbnailUrl={video.thumbnail_url}
                isRendering={isApplying}
                renderProgress={renderStatus || undefined}
              />
            </div>
          </div>

          {/* Video Info Bar */}
          <div className="h-12 bg-card border-t border-border flex items-center justify-between px-4">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Info className="w-3 h-3" />
                {video.template || "Custom"} template
              </span>
              {video.music_id && (
                <span>Music: {video.music_id}</span>
              )}
              {video.voice_id && (
                <span>Voice: {video.voice_id}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {video.duration && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, "0")} duration
                </span>
              )}
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                video.status === "completed"
                  ? "bg-success/10 text-success"
                  : video.status === "processing"
                    ? "bg-primary/10 text-primary"
                    : video.status === "failed"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-muted-foreground"
              }`}>
                {video.status === "completed" ? "Ready" : video.status}
              </span>
            </div>
          </div>
        </div>

        {/* ── Right Panel: Edit Controls ─────────────────────────── */}
        <div className="w-[360px] border-l border-border bg-card flex flex-col flex-shrink-0 overflow-hidden">
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Edit Video</h2>
            {hasUnsavedChanges && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7 px-2"
                onClick={() => {
                  setChanges({
                    agent_name: video.agent_name || undefined,
                    agent_phone: video.agent_phone || undefined,
                    agent_email: video.agent_email || undefined,
                    agent_company: video.agent_company || undefined,
                    music_volume: 80,
                    voiceover_volume: 100,
                    music_fade_in: 1,
                    music_fade_out: 2,
                    video_speed: 1.0,
                    clip_duration: 3.5,
                    output_format: "mp4",
                    resolution: "hd",
                    aspect_ratio: video.aspect_ratio || "9:16",
                  });
                  setHasUnsavedChanges(false);
                }}
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </Button>
            )}
          </div>

          {/* Edit controls */}
          <EditControls
            changes={changes}
            onChange={handleChange}
            videoData={{
              agent_name: video.agent_name || undefined,
              agent_phone: video.agent_phone || undefined,
              agent_email: video.agent_email || undefined,
              agent_company: video.agent_company || undefined,
              template: video.template || undefined,
              music_id: video.music_id || undefined,
              voice_id: video.voice_id || undefined,
              duration: video.duration || undefined,
              aspect_ratio: video.aspect_ratio || undefined,
            }}
            disabled={isApplying}
          />

          {/* Bottom action bar */}
          <div className="p-4 border-t border-border space-y-2">
            <Button
              variant="hero"
              className="w-full"
              onClick={handleApplyChanges}
              disabled={isApplying || !hasUnsavedChanges}
            >
              {isApplying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Re-rendering...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Apply Changes
                </>
              )}
            </Button>
            {hasUnsavedChanges && !isApplying && (
              <p className="text-[10px] text-muted-foreground text-center">
                Re-rendering takes ~30-60 seconds via Shotstack
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
