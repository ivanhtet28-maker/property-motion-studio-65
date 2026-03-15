import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Play,
  Pause,
  Check,
  Loader2,
  Save,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  GripVertical,
  Layout,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import {
  type CameraAction,
  CAMERA_ACTION_OPTIONS,
} from "@/components/create-video/PhotoUpload";

interface SceneData {
  id: string;
  imageUrl: string;
  clipUrl?: string;
  cameraAction: CameraAction;
  duration: number;
}

// Layout options (same as VideoTemplateSelector)
const LAYOUT_OPTIONS = [
  { id: "bold-banner", name: "Bold Banner", description: "Bottom banner with price and details" },
  { id: "warm-elegance", name: "Warm Elegance", description: "Elegant serif with dark vignette" },
] as const;

// Template options (same as VideoTemplateSelector)
const TEMPLATE_OPTIONS = [
  { id: "just-listed", name: "Just Listed" },
  { id: "minimalist", name: "Minimalist" },
  { id: "cinematic", name: "Cinematic" },
  { id: "luxury", name: "Luxury" },
  { id: "real-estate-pro", name: "Real Estate Pro" },
] as const;

export default function QuickEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [selectedScene, setSelectedScene] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [videoTitle, setVideoTitle] = useState("Untitled video");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Clip regeneration state
  const [selectedCameraAngle, setSelectedCameraAngle] = useState<CameraAction>("push-in");
  const [regenerating, setRegenerating] = useState(false);
  const [newClipUrl, setNewClipUrl] = useState<string | null>(null);
  const [regeneratedClips, setRegeneratedClips] = useState<Record<number, string>>({});

  // Template/layout state
  const [selectedTemplate, setSelectedTemplate] = useState("just-listed");
  const [selectedLayout, setSelectedLayout] = useState("bold-banner");

  // Video playback
  const [clipIsPlaying, setClipIsPlaying] = useState(false);
  const [clipError, setClipError] = useState(false);
  const clipVideoRef = useRef<HTMLVideoElement>(null);

  const timelineRef = useRef<HTMLDivElement>(null);

  // Load video data
  useEffect(() => {
    if (!id || !user?.id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();

        if (error) throw error;

        setVideoTitle(data.property_address || "Untitled video");

        // Load template/layout from DB
        if (data.template_used) setSelectedTemplate(data.template_used);

        const photos: string[] = [];
        let cameraAngles: string[] = [];
        let clipDurations: number[] = [];
        let clips: { url?: string; index?: number }[] = [];
        if (data.photos) {
          try {
            const parsed =
              typeof data.photos === "string"
                ? JSON.parse(data.photos)
                : data.photos;
            if (parsed.imageUrls) photos.push(...parsed.imageUrls);
            if (Array.isArray(parsed.cameraAngles))
              cameraAngles = parsed.cameraAngles;
            if (Array.isArray(parsed.clipDurations))
              clipDurations = parsed.clipDurations;
            if (parsed.layout) setSelectedLayout(parsed.layout);
          } catch {
            // photos field might be array of URLs directly
          }
        }

        // Clip URLs are stored in a separate `clips` column, not inside `photos`
        if (Array.isArray(data.clips)) {
          clips = data.clips;
        }

        // Recovery: if clips column is empty but we have generationIds in photos,
        // re-check Runway for completed clip URLs and save them to DB
        let parsedPhotos: Record<string, unknown> | null = null;
        if (data.photos) {
          try {
            parsedPhotos = typeof data.photos === "string" ? JSON.parse(data.photos) : data.photos;
          } catch { /* ignore */ }
        }

        if (
          clips.length === 0 &&
          parsedPhotos?.generationIds &&
          Array.isArray(parsedPhotos.generationIds) &&
          (parsedPhotos.generationIds as string[]).length > 0
        ) {
          try {
            console.log("Clips column empty — recovering clip URLs from generation IDs...");
            const statusResult = await invokeEdgeFunction<{
              status: string;
              finalVideoUrls?: string[];
            }>("video-status", {
              body: {
                generationIds: parsedPhotos.generationIds,
                videoId: id,
                clipDurations: parsedPhotos.clipDurations || [],
                provider: (parsedPhotos.provider as string) || "runway",
                imageUrls: parsedPhotos.imageUrls || [],
                cameraAngles: parsedPhotos.cameraAngles || [],
              },
            });
            // If clips were recovered and saved by video-status, re-fetch them
            if (statusResult.status === "ready_to_stitch" || statusResult.finalVideoUrls) {
              const { data: refreshed } = await supabase
                .from("videos")
                .select("clips")
                .eq("id", id)
                .single();
              if (Array.isArray(refreshed?.clips)) {
                clips = refreshed.clips;
                console.log(`Recovered ${clips.length} clips from generation IDs`);
              }
            }
          } catch (recoverErr) {
            console.error("Clip recovery failed:", recoverErr);
          }
        }

        if (photos.length > 0) {
          // Build a map of clip index -> url for quick lookup
          const clipMap = new Map<number, string>();
          clips.forEach((c) => {
            const idx = c.index ?? clips.indexOf(c);
            if (c.url) clipMap.set(idx, c.url);
          });

          setScenes(
            photos.map((url, i) => ({
              id: `scene-${i}`,
              imageUrl: url,
              clipUrl: clipMap.get(i) || undefined,
              cameraAction: (cameraAngles[i] || "push-in") as CameraAction,
              duration: clipDurations[i] || 5,
            }))
          );
          if (cameraAngles[0]) {
            setSelectedCameraAngle(cameraAngles[0] as CameraAction);
          }
        } else {
          setScenes(
            Array.from({ length: 5 }, (_, i) => ({
              id: `scene-${i}`,
              imageUrl: data.thumbnail_url || "",
              cameraAction: "push-in" as CameraAction,
              duration: 5,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load video:", err);
        toast({ title: "Error loading video", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user]);

  // When selected scene changes, sync camera angle selector and pause video
  useEffect(() => {
    const scene = scenes[selectedScene];
    if (scene) {
      setSelectedCameraAngle(scene.cameraAction);
      setNewClipUrl(regeneratedClips[selectedScene] || null);
    }
    // Reset playback when switching scenes
    setClipIsPlaying(false);
    setClipError(false);
    if (clipVideoRef.current) {
      clipVideoRef.current.pause();
      clipVideoRef.current.currentTime = 0;
    }
  }, [selectedScene, scenes, regeneratedClips]);

  const handleRegenerate = async () => {
    if (!id || selectedScene === null) return;
    const scene = scenes[selectedScene];
    if (!scene) return;

    setRegenerating(true);
    setNewClipUrl(null);

    try {
      const result = await invokeEdgeFunction<{
        success: boolean;
        clipUrl: string;
        clipIndex: number;
        cameraAngle: string;
        error?: string;
      }>("regenerate-clip", {
        body: {
          videoId: id,
          clipIndex: selectedScene,
          imageUrl: scene.imageUrl,
          cameraAngle: selectedCameraAngle,
          duration: 5,
        },
      });

      if (result.success && result.clipUrl) {
        setNewClipUrl(result.clipUrl);
        setRegeneratedClips((prev) => ({
          ...prev,
          [selectedScene]: result.clipUrl,
        }));
        // Also update the scene's clipUrl in state
        setScenes((prev) =>
          prev.map((s, i) =>
            i === selectedScene ? { ...s, clipUrl: result.clipUrl } : s
          )
        );
        toast({
          title: "Clip regenerated",
          description: `Scene ${selectedScene + 1} has a new clip ready to preview.`,
        });
      } else {
        throw new Error(result.error || "Clip generation failed");
      }
    } catch (err) {
      console.error("Failed to regenerate clip:", err);
      toast({
        title: "Regeneration failed",
        description:
          err instanceof Error ? err.message : "Could not regenerate clip",
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    setScenes((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
    setSelectedScene(toIndex);
  };

  const handleApplyChanges = async () => {
    if (!id || !user?.id) return;
    setSaving(true);

    try {
      const { data: videoData, error: fetchErr } = await supabase
        .from("videos")
        .select("photos")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (fetchErr) throw fetchErr;

      let photosJson: Record<string, unknown> = {};
      if (videoData?.photos) {
        try {
          photosJson =
            typeof videoData.photos === "string"
              ? JSON.parse(videoData.photos)
              : videoData.photos;
        } catch {
          photosJson = {};
        }
      }

      // Persist the current scene order
      photosJson.imageUrls = scenes.map((s) => s.imageUrl);
      photosJson.cameraAngles = scenes.map((s) => s.cameraAction);
      photosJson.clipDurations = scenes.map((s) => s.duration);
      photosJson.layout = selectedLayout;

      // Update imageMetadata if it exists
      if (Array.isArray(photosJson.imageMetadata)) {
        const oldMeta = photosJson.imageMetadata as Record<string, unknown>[];
        const metaByUrl = new Map(oldMeta.map((m) => [m.url as string, m]));
        photosJson.imageMetadata = scenes.map((s, i) => {
          const existing = metaByUrl.get(s.imageUrl) || oldMeta[i] || {};
          return { ...existing, cameraAction: s.cameraAction, url: s.imageUrl };
        });
      }

      const { error: updateErr } = await supabase
        .from("videos")
        .update({
          photos: JSON.stringify(photosJson),
          template_used: selectedTemplate,
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (updateErr) throw updateErr;

      setRegeneratedClips({});
      setNewClipUrl(null);

      toast({
        title: "Changes saved!",
        description: "Your video has been updated successfully.",
      });
    } catch (err) {
      console.error("Failed to save changes:", err);
      toast({
        title: "Save failed",
        description:
          err instanceof Error ? err.message : "Could not save changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSceneMotion = (index: number, action: CameraAction) => {
    setScenes((prev) =>
      prev.map((s, i) => (i === index ? { ...s, cameraAction: action } : s))
    );
    setSelectedCameraAngle(action);
  };

  const toggleClipPlay = () => {
    const video = clipVideoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => {
        setClipIsPlaying(true);
      }).catch((err) => {
        console.error("Play failed:", err);
        setClipIsPlaying(false);
      });
    } else {
      video.pause();
      setClipIsPlaying(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentScene = scenes[selectedScene];
  const hasRegeneratedClip = regeneratedClips[selectedScene] !== undefined;
  // The clip to show: regenerated > existing clip > null
  const activeClipUrl = regeneratedClips[selectedScene] || currentScene?.clipUrl || null;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Dashboard
          </span>
          <ChevronRight className="w-3 h-3 text-muted-foreground hidden sm:inline" />
          <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
            {videoTitle}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            Quick Edit
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/studio/${id}`)}
            className="hidden sm:flex"
          >
            Open Studio
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Timeline + Preview */}
        <div className="lg:flex-1 flex flex-col">
          {/* Clip Timeline */}
          <div className="border-b border-border bg-card/50 p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Timeline — {scenes.length} clips · Drag to reorder
            </h3>
            <div
              ref={timelineRef}
              className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory"
            >
              {scenes.map((scene, i) => {
                const isSelected = selectedScene === i;
                const wasRegenerated = regeneratedClips[i] !== undefined;
                return (
                  <button
                    key={scene.id}
                    draggable
                    onClick={() => setSelectedScene(i)}
                    onDragStart={() => setDraggedIndex(i)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedIndex !== null && draggedIndex !== i) {
                        handleReorder(draggedIndex, i);
                        setDraggedIndex(i);
                      }
                    }}
                    onDragEnd={() => setDraggedIndex(null)}
                    className={`relative flex-shrink-0 w-[100px] rounded-lg overflow-hidden border-2 transition-all snap-start ${
                      isSelected
                        ? "border-primary ring-2 ring-primary/20 scale-105"
                        : "border-transparent hover:border-border"
                    } ${draggedIndex === i ? "opacity-50 scale-95" : ""}`}
                  >
                    <div className="aspect-[9/16] bg-secondary">
                      {scene.imageUrl && (
                        <img
                          src={scene.imageUrl}
                          alt={`Clip ${i + 1}`}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      )}
                    </div>
                    <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center text-[10px] font-bold text-white">
                      {i + 1}
                    </div>
                    {wasRegenerated && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1 flex items-center gap-1">
                      <GripVertical className="w-3 h-3 text-white/50 flex-shrink-0" />
                      <span className="text-[9px] text-white/90 font-medium truncate">
                        {CAMERA_ACTION_OPTIONS.find(
                          (o) => o.value === scene.cameraAction
                        )?.label || scene.cameraAction}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Center preview — show clip video or original photo */}
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-6 items-center">
              {/* Main preview: Video clip if available, otherwise static image */}
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-2 font-medium">
                  {activeClipUrl ? "Generated Clip" : "Original Photo"}
                </p>
                <div className="aspect-[9/16] w-[200px] sm:w-[260px] bg-secondary rounded-xl overflow-hidden border border-border relative">
                  {activeClipUrl && !clipError ? (
                    <>
                      <video
                        ref={clipVideoRef}
                        key={activeClipUrl}
                        src={activeClipUrl}
                        className="w-full h-full object-cover"
                        poster={currentScene?.imageUrl}
                        loop
                        muted
                        playsInline
                        crossOrigin="anonymous"
                        onError={() => {
                          console.error("Clip failed to load:", activeClipUrl);
                          setClipError(true);
                        }}
                        onLoadedData={() => setClipError(false)}
                      />
                      {/* Play/pause overlay */}
                      <button
                        onClick={toggleClipPlay}
                        className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-opacity"
                      >
                        {!clipIsPlaying && (
                          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                            <Play className="w-5 h-5 text-black ml-0.5" />
                          </div>
                        )}
                      </button>
                      {clipIsPlaying && (
                        <button
                          onClick={toggleClipPlay}
                          className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"
                        >
                          <Pause className="w-3.5 h-3.5 text-white" />
                        </button>
                      )}
                    </>
                  ) : currentScene?.imageUrl ? (
                    <img
                      src={currentScene.imageUrl}
                      alt="Original"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                      No preview
                    </div>
                  )}
                </div>
              </div>

              {/* Regeneration spinner */}
              {regenerating && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-2 font-medium">
                    Generating...
                  </p>
                  <div className="aspect-[9/16] w-[200px] sm:w-[260px] bg-secondary rounded-xl overflow-hidden border border-border flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                      <p className="text-xs text-muted-foreground">
                        Re-generating clip...
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        This takes ~15-20 seconds
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel: Editor */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card overflow-y-auto p-5">
          <div className="flex items-center gap-2 mb-4">
            <Camera className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Scene {selectedScene + 1} Editor
            </h3>
          </div>

          {/* Current info */}
          <div className="bg-secondary/50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Current camera</span>
              <span className="text-xs font-medium text-foreground">
                {CAMERA_ACTION_OPTIONS.find(
                  (o) => o.value === currentScene?.cameraAction
                )?.label || "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Duration</span>
              <span className="text-xs font-medium text-foreground">5 seconds</span>
            </div>
          </div>

          {/* Camera angle selector */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-foreground block mb-2">
              Camera Motion
            </label>
            <p className="text-[11px] text-muted-foreground mb-3">
              Select a new camera motion for this clip.
            </p>
            <div className="grid grid-cols-1 gap-1.5">
              {CAMERA_ACTION_OPTIONS.map((option) => {
                const isSelected = selectedCameraAngle === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => updateSceneMotion(selectedScene, option.value)}
                    disabled={regenerating}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:bg-accent"
                    } ${regenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <Camera className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1">{option.label}</span>
                    {isSelected && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {CAMERA_ACTION_OPTIONS.find(
                (o) => o.value === selectedCameraAngle
              )?.description}
            </p>
          </div>

          {/* Template & Layout selector */}
          <div className="mb-4 border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Layout className="w-4 h-4 text-primary" />
              <label className="text-xs font-semibold text-foreground">
                Template & Layout
              </label>
            </div>

            {/* Template selector */}
            <div className="mb-3">
              <p className="text-[11px] text-muted-foreground mb-2">Template</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TEMPLATE_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all text-left ${
                      selectedTemplate === t.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:bg-accent"
                    }`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Layout selector */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-2">Layout</p>
              <div className="space-y-1.5">
                {LAYOUT_OPTIONS.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLayout(l.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all text-left ${
                      selectedLayout === l.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:bg-accent"
                    }`}
                  >
                    <div>
                      <span className="text-xs font-medium">{l.name}</span>
                      <p className={`text-[10px] mt-0.5 ${
                        selectedLayout === l.id ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}>
                        {l.description}
                      </p>
                    </div>
                    {selectedLayout === l.id && <Check className="w-3 h-3 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2 border-t border-border pt-4">
            <Button
              variant="hero"
              className="w-full"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {regenerating ? "Generating..." : "Re-Generate This Clip"}
            </Button>

            <Button
              variant="default"
              className="w-full"
              onClick={handleApplyChanges}
              disabled={saving || regenerating}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {saving ? "Saving..." : "Save All Changes"}
            </Button>
          </div>

          {/* Navigation */}
          <div className="mt-6 pt-4 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
