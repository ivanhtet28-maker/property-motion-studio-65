import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Play, Check, Loader2, Save } from "lucide-react";
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

      // Update camera actions in the stored metadata
      const updatedCameraAngles = scenes.map((s) => s.cameraAction);
      photosJson.cameraAngles = updatedCameraAngles;

      // Also update imageMetadata if it exists
      if (Array.isArray(photosJson.imageMetadata)) {
        photosJson.imageMetadata = (photosJson.imageMetadata as Record<string, unknown>[]).map(
          (meta, i) => ({
            ...meta,
            cameraAction: scenes[i]?.cameraAction || meta.cameraAction,
          })
        );
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
              onClick={() => setSelectedScene(i)}
              className={`relative w-16 mx-auto mb-2 rounded-md overflow-hidden border-2 transition-all block ${
                selectedScene === i
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-transparent hover:border-border"
              }`}
            >
              <div className="aspect-[9/16] bg-secondary">
                {scene.imageUrl && (
                  <img
                    src={scene.imageUrl}
                    alt={`Scene ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-black/50 flex items-center justify-center text-[9px] font-bold text-white">
                {i + 1}
              </div>
            </button>
          ))}
        </div>

        {/* Center: Preview + Controls */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          {/* Preview */}
          <div className="aspect-[9/16] w-[300px] bg-secondary rounded-xl overflow-hidden border border-border relative mb-6">
            {currentScene?.imageUrl ? (
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
                <Play className="w-4 h-4 text-white" />
                <span className="text-xs text-white/80">0:00 / 0:15</span>
              </div>
              <div className="h-1 bg-white/30 rounded-full mt-1.5">
                <div className="h-full w-0 bg-white rounded-full" />
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
