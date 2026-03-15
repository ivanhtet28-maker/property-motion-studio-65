import { useState, useCallback } from "react";
import {
  X,
  Loader2,
  RotateCcw,
  Play,
  Camera,
  Clock,
  Sparkles,
  Check,
  Film,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Clip {
  index: number;
  url: string;
  duration: number;
  camera_angle: string;
  image_url: string;
  generation_id?: string;
}

interface ClipEditorProps {
  videoId: string;
  clips: Clip[];
  onClipRegenerated: (clipIndex: number, newClip: Clip) => void;
  disabled?: boolean;
}

// ── Camera angle options ──────────────────────────────────────────────────

const CAMERA_ANGLES = [
  { value: "push-in", label: "Push In", description: "Dolly forward toward subject" },
  { value: "pull-out", label: "Pull Out", description: "Dolly backward revealing space" },
  { value: "orbit", label: "Orbit", description: "Arc around the scene center" },
  { value: "glide-left", label: "Glide Left", description: "Lateral slide to the left" },
  { value: "glide-right", label: "Glide Right", description: "Lateral slide to the right" },
  { value: "drone-up", label: "Drone Up", description: "Aerial ascending reveal" },
  { value: "static", label: "Static", description: "Locked tripod, no movement" },
] as const;

// ── Component ─────────────────────────────────────────────────────────────

export default function ClipEditor({ videoId, clips, onClipRegenerated, disabled }: ClipEditorProps) {
  const { toast } = useToast();

  // Which clip is selected for editing (null = none, show timeline only)
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Edit state for the selected clip
  const [selectedAngle, setSelectedAngle] = useState<string>("push-in");
  const [selectedDuration, setSelectedDuration] = useState<number>(3.5);

  // Regeneration state
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenProgress, setRegenProgress] = useState<string | null>(null);

  // Preview state
  const [previewClipIndex, setPreviewClipIndex] = useState<number | null>(null);

  // ── Select a clip for editing ─────────────────────────────────────────

  const handleSelectClip = useCallback((clip: Clip) => {
    setEditingIndex(clip.index);
    setSelectedAngle(clip.camera_angle || "push-in");
    setSelectedDuration(clip.duration || 3.5);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditingIndex(null);
    setPreviewClipIndex(null);
  }, []);

  // ── Regenerate clip ───────────────────────────────────────────────────

  const handleRegenerate = useCallback(async () => {
    if (editingIndex === null) return;

    const clip = clips.find((c) => c.index === editingIndex);
    if (!clip) return;

    setIsRegenerating(true);
    setRegenProgress("Submitting to Runway Gen4 Turbo...");

    try {
      const result = await invokeEdgeFunction<{
        success: boolean;
        clipIndex: number;
        clipUrl: string;
        cameraAngle: string;
        duration: number;
        generationId: string;
        error?: string;
      }>("regenerate-clip", {
        body: {
          videoId,
          clipIndex: editingIndex,
          imageUrl: clip.image_url,
          cameraAngle: selectedAngle,
          duration: selectedDuration,
        },
      });

      if (!result.success) {
        throw new Error(result.error || "Regeneration failed");
      }

      // Update parent with new clip data
      onClipRegenerated(editingIndex, {
        index: result.clipIndex,
        url: result.clipUrl,
        duration: result.duration,
        camera_angle: result.cameraAngle,
        image_url: clip.image_url,
        generation_id: result.generationId,
      });

      toast({ title: "Clip regenerated!", description: `Clip ${editingIndex + 1} updated with ${result.cameraAngle} motion.` });
    } catch (err) {
      console.error("Clip regeneration failed:", err);
      toast({
        title: "Regeneration failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
      setRegenProgress(null);
    }
  }, [editingIndex, clips, videoId, selectedAngle, selectedDuration, onClipRegenerated, toast]);

  // ── Navigate clips ────────────────────────────────────────────────────

  const handlePrevClip = useCallback(() => {
    if (editingIndex === null || editingIndex <= 0) return;
    const prevClip = clips.find((c) => c.index === editingIndex - 1);
    if (prevClip) handleSelectClip(prevClip);
  }, [editingIndex, clips, handleSelectClip]);

  const handleNextClip = useCallback(() => {
    if (editingIndex === null) return;
    const nextClip = clips.find((c) => c.index === editingIndex + 1);
    if (nextClip) handleSelectClip(nextClip);
  }, [editingIndex, clips, handleSelectClip]);

  const editingClip = editingIndex !== null ? clips.find((c) => c.index === editingIndex) : null;

  if (clips.length === 0) return null;

  return (
    <div className="flex flex-col">
      {/* ── Clip Timeline ──────────────────────────────────────────── */}
      <div className="bg-card border-t border-border">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Film className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              Clips ({clips.length})
            </span>
          </div>
          {editingIndex !== null && (
            <span className="text-[10px] text-primary font-medium">
              Editing clip {editingIndex + 1}
            </span>
          )}
        </div>

        {/* Clip cards row */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
          {clips.map((clip) => (
            <div
              key={clip.index}
              className="group relative flex-shrink-0 cursor-pointer"
              onClick={() => handleSelectClip(clip)}
              onMouseEnter={() => setPreviewClipIndex(clip.index)}
              onMouseLeave={() => setPreviewClipIndex(null)}
            >
              {/* Clip card */}
              <div
                className={`w-24 h-16 rounded-md overflow-hidden border-2 transition-all ${
                  editingIndex === clip.index
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {/* Thumbnail: use source image */}
                <div className="relative w-full h-full bg-muted">
                  <img
                    src={clip.image_url}
                    alt={`Clip ${clip.index + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-medium flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      Edit
                    </span>
                  </div>

                  {/* Regenerating spinner */}
                  {isRegenerating && editingIndex === clip.index && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Clip info */}
              <div className="mt-1 flex items-center justify-between px-0.5">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {clip.index + 1}
                </span>
                <Badge variant="secondary" className="text-[8px] h-3.5 px-1">
                  {clip.camera_angle}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Clip Editor Panel (shown when a clip is selected) ─────── */}
      {editingClip && (
        <div className="bg-card border-t border-border">
          {/* Editor header */}
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handlePrevClip}
                  disabled={editingIndex === 0 || isRegenerating}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs font-semibold text-foreground min-w-[60px] text-center">
                  Clip {editingIndex! + 1} of {clips.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleNextClip}
                  disabled={editingIndex === clips.length - 1 || isRegenerating}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleCloseEditor}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Editor content */}
          <div className="p-4 space-y-4">
            {/* Source image preview */}
            <div className="flex gap-3">
              <div className="w-20 h-14 rounded-md overflow-hidden border border-border flex-shrink-0">
                <img
                  src={editingClip.image_url}
                  alt="Source"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">Source Photo</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Current: {editingClip.camera_angle} · {editingClip.duration}s
                </p>
                {/* Preview button */}
                {editingClip.url && (
                  <button
                    className="mt-1 text-[10px] text-primary hover:underline flex items-center gap-1"
                    onClick={() =>
                      setPreviewClipIndex(
                        previewClipIndex === editingClip.index ? null : editingClip.index,
                      )
                    }
                  >
                    <Play className="w-2.5 h-2.5" />
                    {previewClipIndex === editingClip.index ? "Hide preview" : "Preview clip"}
                  </button>
                )}
              </div>
            </div>

            {/* Inline clip preview */}
            {previewClipIndex === editingClip.index && editingClip.url && (
              <div className="rounded-lg overflow-hidden border border-border bg-black">
                <video
                  src={editingClip.url}
                  controls
                  autoPlay
                  muted
                  loop
                  className="w-full"
                  style={{ maxHeight: 180 }}
                />
              </div>
            )}

            {/* Camera angle selector */}
            <div>
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-2">
                <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                Camera Angle
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {CAMERA_ANGLES.map((angle) => (
                  <button
                    key={angle.value}
                    onClick={() => setSelectedAngle(angle.value)}
                    disabled={isRegenerating}
                    className={`text-left px-2.5 py-1.5 rounded-md border text-xs transition-all ${
                      selectedAngle === angle.value
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    } ${isRegenerating ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <span className="font-medium">{angle.label}</span>
                    {selectedAngle === angle.value && (
                      <Check className="w-3 h-3 text-primary inline ml-1" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Duration slider */}
            <div>
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5 mb-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Clip Duration
                <span className="ml-auto text-muted-foreground tabular-nums">
                  {selectedDuration.toFixed(1)}s
                </span>
              </label>
              <Slider
                value={[selectedDuration]}
                onValueChange={([v]) => setSelectedDuration(v)}
                min={2}
                max={5}
                step={0.5}
                disabled={isRegenerating}
              />
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">2s</span>
                <span className="text-[10px] text-muted-foreground">5s</span>
              </div>
            </div>

            {/* Change indicator */}
            {(selectedAngle !== editingClip.camera_angle ||
              selectedDuration !== editingClip.duration) && (
              <div className="text-[10px] text-amber-600 bg-amber-500/10 rounded-md px-2.5 py-1.5 flex items-center gap-1.5">
                <RotateCcw className="w-3 h-3" />
                <span>
                  {selectedAngle !== editingClip.camera_angle && (
                    <>Angle: {editingClip.camera_angle} → {selectedAngle}</>
                  )}
                  {selectedAngle !== editingClip.camera_angle &&
                    selectedDuration !== editingClip.duration && " · "}
                  {selectedDuration !== editingClip.duration && (
                    <>Duration: {editingClip.duration}s → {selectedDuration}s</>
                  )}
                </span>
              </div>
            )}

            {/* Regeneration progress */}
            {regenProgress && (
              <div className="text-[10px] text-primary bg-primary/5 rounded-md px-2.5 py-1.5 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {regenProgress}
              </div>
            )}

            {/* Regenerate button */}
            <Button
              variant="hero"
              className="w-full"
              onClick={handleRegenerate}
              disabled={isRegenerating || disabled}
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Regenerate This Clip
                </>
              )}
            </Button>

            {!isRegenerating && (
              <p className="text-[10px] text-muted-foreground text-center">
                Takes ~10-20 seconds via Runway Gen4 Turbo
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
