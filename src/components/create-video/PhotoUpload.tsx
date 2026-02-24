import { useCallback, useRef, useState } from "react";
import { Upload, X, ImageIcon, GripVertical, Star, Info, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type CameraAngle = "auto" | "wide-shot" | "push-in" | "push-out" | "orbit-left" | "orbit-right";

// Super 7 Organic Engine — strict preset system.
// Each room_type maps to a cinematic preset in generate-runway-batch.
// Directional variants (room-slide-right/left) are set by AI spatial intelligence
// but display as "The Room Slide" in the UI.
export type RoomType =
  | "foyer-glide"
  | "room-slide"
  | "room-slide-right"
  | "room-slide-left"
  | "bedside-arc"
  | "detail-push"
  | "hero-arrival"
  | "view-reveal"
  | "vista-pan";

// Maps directional AI variants back to their base type for dropdown display.
// The user sees "The Room Slide" regardless of whether the AI picked left/right.
function getDisplayRoomType(roomType: RoomType): RoomType {
  if (roomType === "room-slide-right" || roomType === "room-slide-left") return "room-slide";
  return roomType;
}

const CLIP_DURATION = 3.5; // seconds — fixed for Ken Burns mode; Runway uses 5s

export interface ImageMetadata {
  file: File;
  room_type: RoomType;
  cameraAngle: CameraAngle; // kept for backwards compatibility
  duration: number;
  isDetecting?: boolean;   // true while Claude Vision is classifying
  autoDetected?: boolean;  // true after AI has set the room type
}

interface PhotoUploadProps {
  photos: File[];
  onChange: (photos: File[]) => void;
  imageMetadata?: ImageMetadata[];
  onMetadataChange?: (metadata: ImageMetadata[]) => void;
  minPhotos?: number;
  maxPhotos?: number;
}

// Super 7 Organic Engine — user-friendly shot labels.
export const ROOM_TYPE_OPTIONS: { value: RoomType; label: string; description: string }[] = [
  { value: "foyer-glide",   label: "The Foyer Glide",   description: "Slow welcoming entry glide" },
  { value: "room-slide",    label: "The Room Slide",     description: "Lateral parallax for living spaces" },
  { value: "bedside-arc",   label: "The Bedside Arc",    description: "Gentle wrap-around for bedrooms" },
  { value: "detail-push",   label: "The Detail Push",    description: "Slow inhale for kitchen & bath" },
  { value: "hero-arrival",  label: "The Hero Arrival",   description: "Grounded walk-up for exteriors" },
  { value: "view-reveal",   label: "The View Reveal",    description: "Pull-back and rise for outdoors" },
  { value: "vista-pan",     label: "The Vista Pan",      description: "Sweeping pan for scenic views" },
];

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
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  // Tracks which file names are currently being detected to avoid duplicate calls
  const detectingRef = useRef<Set<string>>(new Set());

  // Initialize metadata when photos change, then trigger AI detection for new images
  const syncMetadata = useCallback((newPhotos: File[]) => {
    if (!onMetadataChange) return;

    const newMetadata: ImageMetadata[] = newPhotos.map((file) => {
      const existing = imageMetadata.find(m => m.file.name === file.name);
      if (existing) return existing;
      // New file — mark as detecting so UI shows spinner immediately
      return {
        file,
        room_type: "room-slide" as RoomType,
        cameraAngle: "auto" as CameraAngle,
        duration: CLIP_DURATION,
        isDetecting: true,
        autoDetected: false,
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

        const { data, error } = await supabase.functions.invoke("detect-room-types", {
          body: { images },
        });

        if (error) throw error;

        const results: Array<{ id: string; room_type: string }> = data.results ?? [];

        onMetadataChange(
          newPhotos.map((file) => {
            const existing = imageMetadata.find(m => m.file.name === file.name);
            if (existing) return existing;
            const detected = results.find(r => r.id === file.name);
            return {
              file,
              room_type: (detected?.room_type ?? "room-slide") as RoomType,
              cameraAngle: "auto" as CameraAngle,
              duration: CLIP_DURATION,
              isDetecting: false,
              autoDetected: !!detected,
            };
          })
        );
      } catch (err) {
        console.error("Room type detection failed:", err);
        // Clear detecting state on failure — leave default room type
        onMetadataChange(
          newPhotos.map((file) => {
            const existing = imageMetadata.find(m => m.file.name === file.name);
            if (existing) return existing;
            return {
              file,
              room_type: "room-slide" as RoomType,
              cameraAngle: "auto" as CameraAngle,
              duration: CLIP_DURATION,
              isDetecting: false,
              autoDetected: false,
            };
          })
        );
      } finally {
        newFiles.forEach(f => detectingRef.current.delete(f.name));
      }
    })();
  }, [imageMetadata, onMetadataChange]);

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

  const updateImageRoomType = (index: number, roomType: RoomType) => {
    if (!onMetadataChange) return;
    const newMetadata = [...imageMetadata];
    newMetadata[index] = { ...newMetadata[index], room_type: roomType, autoDetected: false };
    onMetadataChange(newMetadata);
  };

  const setAllRoomTypes = (roomType: RoomType) => {
    if (!onMetadataChange) return;
    const newMetadata = imageMetadata.map(meta => ({ ...meta, room_type: roomType }));
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
                <Select value="" onValueChange={(value) => setAllRoomTypes(value as RoomType)}>
                  <SelectTrigger className="h-7 text-xs w-[160px]">
                    <SelectValue placeholder="Set all to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_TYPE_OPTIONS.map(({ value, label }) => (
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
                  </div>

                  {/* Shot Type Controls */}
                  {onMetadataChange && metadata && (
                    <div className="space-y-2">
                      {/* Shot Type */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <label className="text-xs font-medium text-muted-foreground">Shot Type</label>
                          {metadata.autoDetected && !metadata.isDetecting && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded-full leading-none">
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
                                    ? "Detecting room type with AI..."
                                    : ROOM_TYPE_OPTIONS.find(o => o.value === getDisplayRoomType(metadata.room_type))?.description ?? "Select the room type for cinematic motion"}
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
                            value={getDisplayRoomType(metadata.room_type ?? "room-slide")}
                            onValueChange={(value) => updateImageRoomType(index, value as RoomType)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROOM_TYPE_OPTIONS.map(({ value, label }) => (
                                <SelectItem key={value} value={value} className="text-xs">
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

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
