import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, X, ImageIcon, GripVertical, Star, Info } from "lucide-react";
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

export type CameraAngle = "auto" | "wide-shot" | "push-in" | "pull-out" | "tracking" | "orbit" | "orbit-right" | "orbit-left" | "static" | "crane-up" | "drone-up";

const CLIP_DURATION = 3.5; // seconds — fixed for Ken Burns mode; Runway uses 5s

// ── Camera Actions (user-facing dropdown — 9 cinematic motions) ────────────
export type CameraAction =
  | "push-in"
  | "pull-out"
  | "tracking"
  | "orbit"
  | "orbit-right"
  | "orbit-left"
  | "crane-up"
  | "drone-up"
  | "static";

export const CAMERA_ACTION_OPTIONS: { value: CameraAction; label: string; description: string }[] = [
  { value: "push-in",   label: "Push In",   description: "Dolly forward into the scene" },
  { value: "pull-out",  label: "Pull Out",   description: "Dolly backward revealing the space" },
  { value: "tracking",  label: "Tracking",   description: "Smooth lateral slide across the scene" },
  { value: "orbit",     label: "Orbit (Center)", description: "Cinematic arc around the subject" },
  { value: "orbit-right", label: "Orbit Right", description: "Clockwise arc around subject" },
  { value: "orbit-left",  label: "Orbit Left", description: "Counter-clockwise arc around subject" },
  { value: "crane-up",  label: "Crane Up",   description: "Camera rises vertically" },
  { value: "drone-up",  label: "Drone Up",   description: "Aerial rising reveal for exteriors" },
  { value: "static",    label: "Static",     description: "Locked tripod, zero movement" },
];

export interface ImageMetadata {
  file: File;
  cameraAction: CameraAction;          // user's chosen camera motion
  cameraAngle: CameraAngle;            // legacy compat
  duration: number;
  isLandscape: boolean;                 // true if image width > height
}

interface PhotoUploadProps {
  photos: File[];
  onChange: (photos: File[]) => void;
  imageMetadata?: ImageMetadata[];
  onMetadataChange?: (metadata: ImageMetadata[]) => void;
  minPhotos?: number;
  maxPhotos?: number;
}

// Detect image dimensions to determine landscape vs portrait
function detectImageOrientation(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth > img.naturalHeight);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(true); // default to landscape for real estate photos
    };
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
  const initRef = useRef<Set<string>>(new Set());

  // Initialize metadata for new photos — detect orientation only (no AI calls)
  const syncMetadata = useCallback((newPhotos: File[]) => {
    if (!onMetadataChange) return;

    // Keep existing metadata for photos we already processed
    const existingMetadata: ImageMetadata[] = newPhotos
      .map((file) => imageMetadata.find(m => m.file.name === file.name))
      .filter((m): m is ImageMetadata => !!m);

    // Find new files that need orientation detection
    const newFiles = newPhotos.filter(
      f => !imageMetadata.find(m => m.file.name === f.name) && !initRef.current.has(f.name)
    );

    // Set initial metadata immediately (default to landscape)
    const initialMetadata: ImageMetadata[] = newPhotos.map((file) => {
      const existing = imageMetadata.find(m => m.file.name === file.name);
      if (existing) return existing;
      return {
        file,
        cameraAction: "push-in" as CameraAction,
        cameraAngle: "auto" as CameraAngle,
        duration: CLIP_DURATION,
        isLandscape: true,
      };
    });
    onMetadataChange(initialMetadata);

    if (newFiles.length === 0) return;
    newFiles.forEach(f => initRef.current.add(f.name));

    // Detect orientation for new files
    (async () => {
      const orientations = await Promise.all(
        newFiles.map(async (file) => ({
          name: file.name,
          isLandscape: await detectImageOrientation(file),
        }))
      );

      onMetadataChange(
        newPhotos.map((file) => {
          const existing = imageMetadata.find(m => m.file.name === file.name);
          if (existing) return existing;
          const orientation = orientations.find(o => o.name === file.name);
          return {
            file,
            cameraAction: "push-in" as CameraAction,
            cameraAngle: "auto" as CameraAngle,
            duration: CLIP_DURATION,
            isLandscape: orientation?.isLandscape ?? true,
          };
        })
      );

      newFiles.forEach(f => initRef.current.delete(f.name));
    })();
  }, [imageMetadata, onMetadataChange]);

  // Re-sync if photos exist but metadata is empty
  useEffect(() => {
    if (!onMetadataChange || photos.length === 0) return;
    if (imageMetadata.length === 0) {
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
    newMetadata[index] = { ...newMetadata[index], cameraAction: action };
    onMetadataChange(newMetadata);
  };

  const setAllCameraActions = (action: CameraAction) => {
    if (!onMetadataChange) return;
    const newMetadata = imageMetadata.map(meta => ({ ...meta, cameraAction: action }));
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

                    {/* Orientation badge — bottom-left of image */}
                    {metadata && (
                      <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] font-medium rounded-full leading-tight shadow-sm backdrop-blur-sm">
                        {metadata.isLandscape ? "Landscape" : "Portrait"}
                      </span>
                    )}
                  </div>

                  {/* Camera Action Controls */}
                  {onMetadataChange && metadata && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Camera Motion</label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="w-3 h-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="text-xs">
                                {CAMERA_ACTION_OPTIONS.find(o => o.value === metadata.cameraAction)?.description ?? "Choose how the camera moves for this shot"}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <Select
                        value={metadata.cameraAction ?? "push-in"}
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
        Upload your photos, choose a camera motion for each, then click generate.
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
