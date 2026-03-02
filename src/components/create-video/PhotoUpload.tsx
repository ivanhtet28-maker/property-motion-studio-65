import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X, ImageIcon, GripVertical, Star, Info, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

export type CameraAngle = "auto" | "wide-shot" | "push-in" | "push-out" | "orbit-left" | "orbit-right";

// Room types — still used for AI detection and backend prompt anchors.
export type RoomType =
  | "exterior-arrival"
  | "front-door"
  | "entry-foyer"
  | "living-room-wide"
  | "living-room-orbit"
  | "kitchen-orbit"
  | "kitchen-push"
  | "master-bedroom"
  | "bedroom"
  | "bathroom"
  | "outdoor-entertaining"
  | "backyard-pool"
  | "view-balcony";

const CLIP_DURATION = 3.5; // seconds — fixed for Ken Burns mode; Runway uses 5s

// ── Core 5 Camera Actions (the user-facing "How" dropdown) ──────────────────
export type CameraAction =
  | "parallax-glide"
  | "space-sweep"
  | "kitchen-sweep"
  | "feature-push"
  | "aerial-float";

export const CAMERA_ACTION_OPTIONS: { value: CameraAction; label: string; description: string }[] = [
  { value: "parallax-glide", label: "Side Slide",   description: "Clean, horizontal movement" },
  { value: "space-sweep",    label: "Wide Orbit",   description: "A large, sweeping circular move" },
  { value: "kitchen-sweep",  label: "Tight Orbit",  description: "A closer, faster circular move" },
  { value: "feature-push",   label: "Push In",      description: "Direct movement toward the center" },
  { value: "aerial-float",   label: "Pull Out",     description: "Direct movement away from the center" },
];

// Smart Default: AI-detected room → best Core 5 Camera Action
export const ROOM_TO_DEFAULT_ACTION: Record<string, CameraAction> = {
  "exterior-arrival": "parallax-glide",   // Side Slide
  "front-door":       "parallax-glide",   // Side Slide
  "entry-foyer":      "parallax-glide",   // Side Slide
  "living-room-wide": "space-sweep",      // Wide Orbit
  "living-room-orbit":"space-sweep",      // Wide Orbit
  "kitchen-orbit":    "kitchen-sweep",    // Tight Orbit
  "kitchen-push":     "kitchen-sweep",    // Tight Orbit
  "master-bedroom":   "space-sweep",      // Wide Orbit — showcase the room/space
  "bedroom":          "space-sweep",      // Wide Orbit — showcase the room/space
  "bathroom":         "feature-push",     // Push In
  "outdoor-entertaining": "aerial-float", // Pull Out
  "backyard-pool":    "aerial-float",     // Pull Out
  "view-balcony":     "aerial-float",     // Pull Out
};

// Human-readable labels for AI camera intent (the "Shot" tag)
export const CAMERA_INTENT_TO_LABEL: Record<string, string> = {
  "orbit-right":           "Orbit Right",
  "orbit-left":            "Orbit Left",
  "pullback-wide":         "Pull Back Wide",
  "pullback-reveal-right": "Pull Back → Right",
  "pullback-reveal-left":  "Pull Back → Left",
  "gentle-push":           "Gentle Push",
  "drift-through":         "Drift Through",
  "crane-up":              "Crane Up",
  "crane-up-drift-right":  "Crane Up → Right",
  "crane-up-drift-left":   "Crane Up → Left",
  "approach-gentle":       "Gentle Approach",
  "parallax-exterior":     "Parallax Slide",
  "float-back":            "Float Back",
};

// AI detection display label (the "What" tag)
const ROOM_TYPE_TO_LABEL: Record<string, string> = {
  "exterior-arrival": "Exterior",
  "front-door":       "Exterior",
  "entry-foyer":      "Entry / Foyer",
  "living-room-wide": "Living Room",
  "living-room-orbit":"Living Room",
  "kitchen-orbit":    "Kitchen",
  "kitchen-push":     "Kitchen",
  "master-bedroom":   "Master Bedroom",
  "bedroom":          "Bedroom",
  "bathroom":         "Bathroom",
  "outdoor-entertaining": "Outdoor",
  "backyard-pool":    "Pool / Backyard",
  "view-balcony":     "Balcony / View",
};

export interface ImageMetadata {
  file: File;
  cameraAction: CameraAction;          // dropdown value (the "How")
  detectedRoomLabel: string | null;     // AI tag display (the "What")
  room_type: RoomType;                  // raw AI detection — sent to backend for prompt anchors
  camera_intent?: string;              // AI-decided camera move (e.g., "orbit-right")
  hero_feature?: string;               // what the camera reveals (e.g., "marble kitchen island")
  hazards?: string;                    // comma-separated hazards or "none"
  cameraAngle: CameraAngle;            // legacy compat
  duration: number;
  isDetecting?: boolean;               // true while Claude Vision is classifying
  autoDetected?: boolean;              // true after AI has set the camera action
  userOverridden?: boolean;            // true ONLY when user manually changed the dropdown
}

interface PhotoUploadProps {
  photos: File[];
  onChange: (photos: File[]) => void;
  imageMetadata?: ImageMetadata[];
  onMetadataChange?: (metadata: ImageMetadata[]) => void;
  minPhotos?: number;
  maxPhotos?: number;
}

// Default intent fallback when AI detection doesn't return one
function getDefaultIntent(roomType: string): string {
  if (roomType.startsWith("exterior") || roomType === "front-door") return "crane-up";
  if (roomType === "entry-foyer") return "drift-through";
  if (roomType.startsWith("living-room")) return "orbit-right";
  if (roomType.startsWith("kitchen")) return "orbit-right";
  if (roomType === "master-bedroom" || roomType === "bedroom") return "pullback-wide";
  if (roomType === "bathroom") return "gentle-push";
  return "float-back";
}

// Resize an image File to a small JPEG base64 string suitable for Claude Vision.
// Keeps payload well under the Supabase Edge Function ~2MB limit.
function resizeImageForDetection(file: File, maxWidth = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) { reject(new Error("No canvas context")); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, 1);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8).split(",")[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
}

export function PhotoUpload({
  photos,
  onChange,
  imageMetadata = [],
  onMetadataChange,
  minPhotos = 3,
  maxPhotos = 10,
}: PhotoUploadProps) {
  const { toast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  // Tracks which file names are currently being detected to avoid duplicate calls
  const detectingRef = useRef<Set<string>>(new Set());

  // Initialize metadata when photos change, then trigger AI detection for new images
  const syncMetadata = useCallback((newPhotos: File[]) => {
    if (!onMetadataChange) {
      console.warn("[PhotoUpload] syncMetadata called but onMetadataChange is null/undefined — detection skipped!");
      return;
    }

    console.log("[PhotoUpload] syncMetadata called", {
      photoCount: newPhotos.length,
      existingMetadata: imageMetadata.length,
      detectingRefSize: detectingRef.current.size,
    });

    const newMetadata: ImageMetadata[] = newPhotos.map((file) => {
      const existing = imageMetadata.find(m => m.file.name === file.name);
      if (existing) return existing;
      // New file — mark as detecting so UI shows spinner immediately
      return {
        file,
        cameraAction: "space-sweep" as CameraAction,
        detectedRoomLabel: null,
        room_type: "living-room-wide" as RoomType,
        cameraAngle: "auto" as CameraAngle,
        duration: CLIP_DURATION,
        isDetecting: true,
        autoDetected: false,
        userOverridden: false,
      };
    });

    onMetadataChange(newMetadata);

    // Detect room types for newly added files only
    const newFiles = newPhotos.filter(
      f => !imageMetadata.find(m => m.file.name === f.name) && !detectingRef.current.has(f.name)
    );
    if (newFiles.length === 0) return;

    newFiles.forEach(f => detectingRef.current.add(f.name));

    (async () => {
      try {
        const images = await Promise.all(
          newFiles.map(async (file) => ({
            id: file.name,
            base64: await resizeImageForDetection(file),
            mimeType: "image/jpeg",
          }))
        );

        console.log("[PhotoUpload] CALLING detect-room-types", {
          count: images.length,
          ids: images.map(i => i.id),
          base64Lengths: images.map(i => `${i.id}=${i.base64.length}`),
        });
        const invokeStart = performance.now();
        const { data, error } = await supabase.functions.invoke("detect-room-types", {
          body: { images },
        });
        const invokeMs = Math.round(performance.now() - invokeStart);
        console.log(`[PhotoUpload] detect-room-types responded in ${invokeMs}ms`, { data, error });

        if (error) {
          console.error("[PhotoUpload] detect-room-types FAILED:", {
            error,
            message: error?.message,
            context: error?.context,
            status: error?.status,
          });
          throw error;
        }

        const results: Array<{ id: string; room_type: string; camera_intent?: string; hero_feature?: string; hazards?: string }> = data?.results ?? [];
        console.log("[PhotoUpload] Detection results received:", JSON.stringify(results, null, 2));

        onMetadataChange(
          newPhotos.map((file) => {
            const existing = imageMetadata.find(m => m.file.name === file.name);
            if (existing) return existing;
            const detected = results.find(r => r.id === file.name);
            const roomType = (detected?.room_type ?? "living-room-wide") as RoomType;
            const detectedIntent = detected?.camera_intent ?? getDefaultIntent(roomType);
            const detectedHero = detected?.hero_feature ?? "none";
            const detectedHazards = detected?.hazards ?? "none";
            return {
              file,
              cameraAction: ROOM_TO_DEFAULT_ACTION[roomType] ?? ("space-sweep" as CameraAction),
              detectedRoomLabel: ROOM_TYPE_TO_LABEL[roomType] ?? null,
              room_type: roomType,
              camera_intent: detectedIntent,
              hero_feature: detectedHero,
              hazards: detectedHazards,
              cameraAngle: "auto" as CameraAngle,
              duration: CLIP_DURATION,
              isDetecting: false,
              autoDetected: !!detected,
              userOverridden: false,
            };
          })
        );
      } catch (err) {
        console.error("Room type detection FAILED:", err);
        toast({
          title: "AI Detection Failed",
          description: "Could not analyze photos. Using defaults. Check console for details.",
          variant: "destructive",
        });
        // Set defaults with visible label so user sees SOMETHING (not blank)
        onMetadataChange(
          newPhotos.map((file) => {
            const existing = imageMetadata.find(m => m.file.name === file.name);
            if (existing) return existing;
            const fallbackRoom = "living-room-wide" as RoomType;
            return {
              file,
              cameraAction: "space-sweep" as CameraAction,
              detectedRoomLabel: ROOM_TYPE_TO_LABEL[fallbackRoom] + " (default)",
              room_type: fallbackRoom,
              camera_intent: getDefaultIntent(fallbackRoom),
              hero_feature: "none",
              hazards: "none",
              cameraAngle: "auto" as CameraAngle,
              duration: CLIP_DURATION,
              isDetecting: false,
              autoDetected: false,
              userOverridden: false,
            };
          })
        );
      } finally {
        newFiles.forEach(f => detectingRef.current.delete(f.name));
      }
    })();
  }, [imageMetadata, onMetadataChange, toast]);

  // Re-sync: if photos exist but metadata is empty/mismatched, re-trigger detection.
  // This catches cases where metadata was wiped (tab switching, state resets, etc.)
  useEffect(() => {
    if (!onMetadataChange || photos.length === 0) return;
    if (imageMetadata.length === 0) {
      console.log("[PhotoUpload] metadata empty but photos exist — re-syncing", { photoCount: photos.length });
      syncMetadata(photos);
    }
  }, [photos, imageMetadata.length, syncMetadata, onMetadataChange]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );
      const newPhotos = [...photos, ...files].slice(0, maxPhotos);
      onChange(newPhotos);
      syncMetadata(newPhotos);
    },
    [photos, maxPhotos, onChange, syncMetadata]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newPhotos = [...photos, ...files].slice(0, maxPhotos);
      onChange(newPhotos);
      syncMetadata(newPhotos);
    }
  };

  const removePhoto = (index: number) => {
    const newPhotos = photos.filter((_, i) => i !== index);
    onChange(newPhotos);
    if (onMetadataChange) {
      onMetadataChange(imageMetadata.filter((_, i) => i !== index));
    }
  };

  const handlePhotoReorder = (fromIndex: number, toIndex: number) => {
    const newPhotos = [...photos];
    const [removed] = newPhotos.splice(fromIndex, 1);
    newPhotos.splice(toIndex, 0, removed);
    onChange(newPhotos);

    if (onMetadataChange) {
      const newMetadata = [...imageMetadata];
      const [removedMeta] = newMetadata.splice(fromIndex, 1);
      newMetadata.splice(toIndex, 0, removedMeta);
      onMetadataChange(newMetadata);
    }
  };

  const updateImageCameraAction = (index: number, action: CameraAction) => {
    if (!onMetadataChange) return;
    const newMetadata = [...imageMetadata];
    newMetadata[index] = { ...newMetadata[index], cameraAction: action, autoDetected: false, userOverridden: true };
    onMetadataChange(newMetadata);
  };

  const setAllCameraActions = (action: CameraAction) => {
    if (!onMetadataChange) return;
    const newMetadata = imageMetadata.map(meta => ({ ...meta, cameraAction: action, autoDetected: false, userOverridden: true }));
    onMetadataChange(newMetadata);
  };

  const photoPreviews = photos.map((file) => URL.createObjectURL(file));

  const progressPercent = Math.min((photos.length / minPhotos) * 100, 100);

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Property Photos</h2>
            <p className="text-sm text-muted-foreground">
              Upload {minPhotos}-{maxPhotos} high-quality images
            </p>
          </div>
        </div>

        {/* Progress Ring */}
        <div className="relative w-12 h-12">
          <svg className="w-12 h-12 transform -rotate-90">
            <circle
              cx="24"
              cy="24"
              r="20"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              className="text-secondary"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              stroke="currentColor"
              strokeWidth="3"
              fill="none"
              strokeDasharray={125.6}
              strokeDashoffset={125.6 - (125.6 * progressPercent) / 100}
              className={photos.length >= minPhotos ? "text-success" : "text-primary"}
              strokeLinecap="round"
            />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${
            photos.length >= minPhotos ? "text-success" : "text-foreground"
          }`}>
            {photos.length}
          </span>
        </div>
      </div>

      {/* Drop Zone */}
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 overflow-hidden ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-border hover:border-primary/50 hover:bg-secondary/30"
        }`}
      >
        {/* Animated Background */}
        {isDragging && (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 animate-pulse" />
        )}

        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="relative z-10">
          <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-all ${
            isDragging ? "bg-primary/20 scale-110" : "bg-secondary"
          }`}>
            <Upload className={`w-7 h-7 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <p className="font-semibold text-foreground text-lg">
            {isDragging ? "Drop photos here" : "Drag & drop your photos"}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            or <span className="text-primary font-medium hover:underline">browse files</span>
          </p>
          <p className="text-xs text-muted-foreground mt-3 bg-secondary/50 inline-block px-3 py-1 rounded-full">
            JPG, PNG, HEIC • Max 10MB each
          </p>
        </div>
      </label>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <GripVertical className="w-3 h-3" />
              Drag to reorder • First image is the cover
            </p>
            {onMetadataChange && imageMetadata.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{(photos.length * CLIP_DURATION).toFixed(1)}s total</span>
                <Select value="" onValueChange={(value) => setAllCameraActions(value as CameraAction)}>
                  <SelectTrigger className="h-7 text-xs w-[160px]">
                    <SelectValue placeholder="Set all to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMERA_ACTION_OPTIONS.map(({ value, label }) => (
                      <SelectItem key={value} value={value} className="text-xs">
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {photoPreviews.map((preview, index) => {
              const metadata = imageMetadata[index];
              return (
                <div
                  key={index}
                  className={`border border-border rounded-xl p-3 space-y-3 transition-all duration-200 ${
                    draggedIndex === index ? "opacity-50 scale-95" : ""
                  }`}
                >
                  {/* Image Preview */}
                  <div
                    draggable
                    onDragStart={() => setDraggedIndex(index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedIndex !== null && draggedIndex !== index) {
                        handlePhotoReorder(draggedIndex, index);
                        setDraggedIndex(index);
                      }
                    }}
                    onDragEnd={() => setDraggedIndex(null)}
                    className="relative aspect-square group cursor-grab active:cursor-grabbing"
                  >
                    <img
                      src={preview}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover rounded-lg shadow-sm"
                    />

                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Remove button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removePhoto(index);
                      }}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110"
                      aria-label="Remove photo"
                    >
                      <X className="w-4 h-4" />
                    </button>

                    {/* Cover badge */}
                    {index === 0 && (
                      <span className="absolute top-2 left-2 px-2.5 py-1 bg-primary text-primary-foreground text-xs rounded-full font-semibold flex items-center gap-1 shadow-lg">
                        <Star className="w-3 h-3" fill="currentColor" />
                        Cover
                      </span>
                    )}

                    {/* Photo number */}
                    {index !== 0 && (
                      <span className="absolute top-2 left-2 w-6 h-6 bg-black/60 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {index + 1}
                      </span>
                    )}

                    {/* AI room detection tag — bottom-left of image */}
                    {metadata && !metadata.isDetecting && metadata.detectedRoomLabel && (
                      <div className="absolute bottom-2 left-2 flex flex-col gap-0.5">
                        <span className="px-2 py-0.5 bg-purple-600/80 text-white text-[10px] font-medium rounded-full leading-tight shadow-sm backdrop-blur-sm">
                          AI: {metadata.detectedRoomLabel}
                        </span>
                        {metadata.camera_intent && (
                          <span className="px-2 py-0.5 bg-blue-600/80 text-white text-[10px] font-medium rounded-full leading-tight shadow-sm backdrop-blur-sm">
                            Shot: {CAMERA_INTENT_TO_LABEL[metadata.camera_intent] ?? metadata.camera_intent}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Camera Action Controls */}
                  {onMetadataChange && metadata && (
                    <div className="space-y-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <label className="text-xs font-medium text-muted-foreground">Camera Action</label>
                          {metadata.autoDetected && !metadata.isDetecting && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-medium rounded-full leading-none">
                              AI
                            </span>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="w-3 h-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">
                                  {metadata.isDetecting
                                    ? "Detecting room and selecting best camera action..."
                                    : CAMERA_ACTION_OPTIONS.find(o => o.value === metadata.cameraAction)?.description ?? "Choose how the camera moves for this shot"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        {metadata.isDetecting ? (
                          <div className="h-8 flex items-center gap-2 px-3 border border-border rounded-md bg-secondary/30">
                            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Detecting...</span>
                          </div>
                        ) : (
                          <Select
                            value={metadata.cameraAction ?? "space-sweep"}
                            onValueChange={(value) => updateImageCameraAction(index, value as CameraAction)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CAMERA_ACTION_OPTIONS.map(({ value, label, description }) => (
                                <SelectItem key={value} value={value} className="text-xs">
                                  <span>{label}</span>
                                  <span className="ml-1 text-muted-foreground">— {description}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* AI Shot Details — camera_intent + hero_feature */}
                      {!metadata.isDetecting && metadata.autoDetected && metadata.camera_intent && (
                        <div className="px-2 py-1.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-md space-y-0.5">
                          <p className="text-[10px] font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                            AI Shot: {CAMERA_INTENT_TO_LABEL[metadata.camera_intent] ?? metadata.camera_intent}
                          </p>
                          {metadata.hero_feature && metadata.hero_feature !== "none" && (
                            <p className="text-[10px] text-blue-600/80 dark:text-blue-400/70">
                              Reveals: {metadata.hero_feature}
                            </p>
                          )}
                          {metadata.hazards && metadata.hazards !== "none" && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400">
                              Hazards: {metadata.hazards}
                            </p>
                          )}
                        </div>
                      )}

                    </div>
                  )}
                </div>
              );
            })}

            {/* Add More Button */}
            {photos.length < maxPhotos && (
              <label className="border-2 border-dashed border-border rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group min-h-[200px]">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="w-12 h-12 rounded-full bg-secondary group-hover:bg-primary/10 flex items-center justify-center transition-colors mb-2">
                  <span className="text-3xl text-muted-foreground group-hover:text-primary transition-colors">+</span>
                </div>
                <p className="text-sm text-muted-foreground group-hover:text-primary transition-colors font-medium">
                  Add More
                </p>
              </label>
            )}
          </div>
        </div>
      )}

      {/* Helper text — directly above status bar */}
      <p className="text-sm text-muted-foreground/80 text-center py-2">
        Upload your photos and we&apos;ll handle the rest. Just click generate when ready.
      </p>

      {/* Status Bar */}
      <div className="flex items-center justify-between p-3 bg-secondary/50 rounded-xl">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${photos.length >= minPhotos ? "bg-success" : "bg-warning"} animate-pulse`} />
          <span className={`text-sm font-medium ${photos.length >= minPhotos ? "text-success" : "text-foreground"}`}>
            {photos.length >= minPhotos
              ? `${photos.length} photos ready`
              : `${photos.length} of ${minPhotos} minimum`
            }
          </span>
        </div>
        {photos.length < minPhotos && (
          <span className="text-sm text-warning font-medium">
            Add {minPhotos - photos.length} more
          </span>
        )}
        {photos.length >= minPhotos && photos.length < maxPhotos && (
          <span className="text-xs text-muted-foreground">
            {maxPhotos - photos.length} slots available
          </span>
        )}
      </div>
    </section>
  );
}
