import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Play, Pause, Check, Loader2, Save, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  type CameraAction,
  CAMERA_ACTION_OPTIONS,
} from "@/components/create-video/PhotoUpload";

interface SceneData {
  id: string;
  imageUrl: string;
  cameraAction: CameraAction;
  duration: number;
}

export default function QuickEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [selectedScene, setSelectedScene] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("Untitled video");
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

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
        setVideoUrl(data.video_url);

        // Parse scene data from the video's photos/metadata
        const photos: string[] = [];
        let cameraAngles: string[] = [];
        let clipDurations: number[] = [];
        if (data.photos) {
          try {
            const parsed = typeof data.photos === "string"
              ? JSON.parse(data.photos)
              : data.photos;
            if (parsed.imageUrls) photos.push(...parsed.imageUrls);
            if (Array.isArray(parsed.cameraAngles)) cameraAngles = parsed.cameraAngles;
            if (Array.isArray(parsed.clipDurations)) clipDurations = parsed.clipDurations;
          } catch {
            // photos field might be array of URLs directly
          }
        }

        // Create scene data — if no photo URLs, create placeholder scenes
        if (photos.length > 0) {
          setScenes(
            photos.map((url, i) => ({
              id: `scene-${i}`,
              imageUrl: url,
              cameraAction: (cameraAngles[i] || "push-in") as CameraAction,
              duration: clipDurations[i] || 3.5,
            }))
          );
        } else {
          // Fallback: show 5 placeholder scenes
          setScenes(
            Array.from({ length: 5 }, (_, i) => ({
              id: `scene-${i}`,
              imageUrl: data.thumbnail_url || "",
              cameraAction: "push-in" as CameraAction,
              duration: 3.5,
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

  const updateSceneMotion = (index: number, action: CameraAction) => {
    setScenes((prev) =>
      prev.map((s, i) => (i === index ? { ...s, cameraAction: action } : s))
    );
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

  const handleSave = async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      // Load existing photos JSON so we can merge updated camera actions
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
          photosJson = typeof videoData.photos === "string"
            ? JSON.parse(videoData.photos)
            : videoData.photos;
        } catch {
          photosJson = {};
        }
      }

      // Persist the current scene order (imageUrls, cameraAngles, clipDurations)
      photosJson.imageUrls = scenes.map((s) => s.imageUrl);
      photosJson.cameraAngles = scenes.map((s) => s.cameraAction);
      photosJson.clipDurations = scenes.map((s) => s.duration);

      // Also update imageMetadata if it exists — rebuild in scene order
      if (Array.isArray(photosJson.imageMetadata)) {
        const oldMeta = photosJson.imageMetadata as Record<string, unknown>[];
        // Match metadata by imageUrl to handle reordering
        const metaByUrl = new Map(oldMeta.map((m) => [m.url as string, m]));
        photosJson.imageMetadata = scenes.map((s, i) => {
          const existing = metaByUrl.get(s.imageUrl) || oldMeta[i] || {};
          return { ...existing, cameraAction: s.cameraAction, url: s.imageUrl };
        });
      }

      const { error: updateErr } = await supabase
        .from("videos")
        .update({ photos: JSON.stringify(photosJson) })
        .eq("id", id)
        .eq("user_id", user.id);

      if (updateErr) throw updateErr;

      toast({ title: "Changes saved", description: "Your video has been updated." });
    } catch (err) {
      console.error("Failed to save changes:", err);
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 flex-shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to project
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{videoTitle}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            Quick Edit
          </span>
        </div>
        <Button
          variant="hero"
          size="sm"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Scene filmstrip */}
        <div className="w-20 bg-card border-r border-border overflow-y-auto py-3 flex-shrink-0">
          {scenes.map((scene, i) => (
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
              className={`relative w-16 mx-auto mb-2 rounded-md overflow-hidden border-2 transition-all block ${
                selectedScene === i
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-transparent hover:border-border"
              } ${draggedIndex === i ? "opacity-50 scale-95" : ""}`}
            >
              <div className="aspect-[9/16] bg-secondary">
                {scene.imageUrl && (
                  <img
                    src={scene.imageUrl}
                    alt={`Scene ${i + 1}`}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                )}
              </div>
              <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center text-[9px] font-bold text-white">
                {i + 1}
              </div>
              <div className="absolute bottom-0 left-0 right-0 flex justify-center py-0.5 bg-black/40">
                <GripVertical className="w-3 h-3 text-white/70" />
              </div>
            </button>
          ))}
        </div>

        {/* Center: Preview + Controls */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {/* Preview */}
          <div className="aspect-[9/16] w-[300px] bg-secondary rounded-xl overflow-hidden border border-border relative mb-6">
            {videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  poster={currentScene?.imageUrl}
                  onTimeUpdate={() => {
                    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                  }}
                  onLoadedMetadata={() => {
                    if (videoRef.current) setDuration(videoRef.current.duration);
                  }}
                  onEnded={() => setIsPlaying(false)}
                  playsInline
                />
                {/* Play overlay when paused */}
                {!isPlaying && (
                  <button
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity hover:bg-black/30"
                  >
                    <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-6 h-6 text-black ml-0.5" />
                    </div>
                  </button>
                )}
              </>
            ) : currentScene?.imageUrl ? (
              <img
                src={currentScene.imageUrl}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                No preview
              </div>
            )}
            {/* Playback bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <div className="flex items-center gap-2">
                <button onClick={togglePlay} className="hover:opacity-80 transition-opacity">
                  {isPlaying ? (
                    <Pause className="w-4 h-4 text-white" />
                  ) : (
                    <Play className="w-4 h-4 text-white" />
                  )}
                </button>
                <span className="text-xs text-white/80">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>
              <div
                className="h-1 bg-white/30 rounded-full mt-1.5 cursor-pointer"
                onClick={(e) => {
                  if (!videoRef.current || !duration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  videoRef.current.currentTime = pct * duration;
                }}
              >
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
                />
              </div>
            </div>
          </div>

          {/* Camera motion control */}
          <div className="bg-card rounded-xl border border-border p-5 w-full max-w-md">
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Scene {selectedScene + 1} — Camera motion
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Change the motion for this scene only. Other scenes won't be affected.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {CAMERA_ACTION_OPTIONS.map((option) => {
                const isSelected = currentScene?.cameraAction === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => updateSceneMotion(selectedScene, option.value)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground hover:bg-accent"
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {option.label}
                    {isSelected && <Check className="w-3 h-3 ml-auto" />}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground mt-3">
              {CAMERA_ACTION_OPTIONS.find((o) => o.value === currentScene?.cameraAction)?.description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
