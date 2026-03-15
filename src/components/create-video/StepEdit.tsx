import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Camera, Crop, Smartphone, Monitor, X, Move, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  type CameraAction,
  CAMERA_ACTION_OPTIONS,
} from "./PhotoUpload";

export interface CropData {
  x: number; // 0-1 offset from left
  y: number; // 0-1 offset from top
}

interface StepEditProps {
  photos: File[];
  selectedIndices: number[];
  cameraActions: Record<number, CameraAction>;
  onCameraActionChange: (index: number, action: CameraAction) => void;
  orientation: "portrait" | "landscape";
  onOrientationChange: (orientation: "portrait" | "landscape") => void;
  cropData?: Record<number, CropData>;
  onCropChange?: (index: number, crop: CropData) => void;
}

export function StepEdit({
  photos,
  selectedIndices,
  cameraActions,
  onCameraActionChange,
  orientation,
  onOrientationChange,
  cropData = {},
  onCropChange,
}: StepEditProps) {
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [croppingIndex, setCroppingIndex] = useState<number | null>(null);

  // Stable blob URLs — created once per file, cleaned up on unmount
  const blobUrls = useMemo(() => {
    return photos.map((file) => URL.createObjectURL(file));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  useEffect(() => {
    return () => blobUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [blobUrls]);

  const openCrop = (photoIndex: number) => {
    setCroppingIndex(photoIndex);
    setCropDialogOpen(true);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            Configure images
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-medium text-primary">Drag</span> to reorder images.
            Select <span className="font-medium">Video Orientation</span>,
            and customize <span className="font-medium">Camera motions</span>.
          </p>
        </div>

        {/* Orientation toggle */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 text-right">
            Video orientation
          </p>
          <div className="inline-flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => onOrientationChange("portrait")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                orientation === "portrait"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Portrait
            </button>
            <button
              onClick={() => onOrientationChange("landscape")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                orientation === "landscape"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              Landscape
            </button>
          </div>
        </div>
      </div>

      {/* Image grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {selectedIndices.map((photoIndex, pos) => {
          const file = photos[photoIndex];
          const action = cameraActions[photoIndex] || "push-in";
          const actionLabel =
            CAMERA_ACTION_OPTIONS.find((o) => o.value === action)?.label || "Auto";
          const crop = cropData[photoIndex];
          const isCropped = !!crop && (crop.x !== 0.5 || crop.y !== 0.5);
          // background-position: percentage maps focal point to container
          const bgPosition = crop
            ? `${(crop.x * 100).toFixed(1)}% ${(crop.y * 100).toFixed(1)}%`
            : "center";
          const thumbUrl = blobUrls[photoIndex] || "";

          return (
            <div key={photoIndex} className="relative group">
              {/* Thumbnail — using background-image for reliable crop positioning */}
              <div
                className={`rounded-lg overflow-hidden border bg-secondary ${
                  orientation === "portrait" ? "aspect-[9/16]" : "aspect-[16/9]"
                } ${isCropped ? "border-primary" : "border-border"}`}
                style={{
                  backgroundImage: `url(${thumbUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: bgPosition,
                  backgroundRepeat: "no-repeat",
                }}
              >
                {/* Scene number */}
                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[11px] font-bold text-primary-foreground shadow">
                  {pos + 1}
                </div>
                {/* Cropped badge */}
                {isCropped && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 bg-primary text-primary-foreground rounded text-[10px] font-semibold shadow">
                    <Check className="w-3 h-3" />
                    Cropped
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5">
                {/* Camera action picker */}
                <CameraActionPicker
                  value={action}
                  onChange={(a) => onCameraActionChange(photoIndex, a)}
                  label={actionLabel}
                />
                {/* Crop button */}
                <button
                  onClick={() => openCrop(photoIndex)}
                  className="flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur rounded text-xs font-medium text-foreground hover:bg-white transition-colors shadow-sm"
                >
                  <Crop className="w-3 h-3" />
                  Crop
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Crop dialog */}
      {croppingIndex !== null && (
        <CropDialog
          open={cropDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCropDialogOpen(false);
              setCroppingIndex(null);
            }
          }}
          file={photos[croppingIndex]}
          orientation={orientation}
          initialCrop={cropData[croppingIndex]}
          onSave={(crop) => {
            // Save crop first, then close dialog
            const idx = croppingIndex;
            if (idx !== null && onCropChange) {
              onCropChange(idx, crop);
            }
            setCropDialogOpen(false);
            // Delay unmount so state propagates
            setTimeout(() => setCroppingIndex(null), 50);
          }}
        />
      )}
    </div>
  );
}

// ─── Crop Dialog ────────────────────────────────────────

function CropDialog({
  open,
  onOpenChange,
  file,
  orientation,
  initialCrop,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File;
  orientation: "portrait" | "landscape";
  initialCrop?: CropData;
  onSave: (crop: CropData) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [imageDims, setImageDims] = useState({ w: 0, h: 0 });
  const [offset, setOffset] = useState<CropData>(initialCrop || { x: 0.5, y: 0.5 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => setImageDims({ w: img.width, h: img.height });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (initialCrop) setOffset(initialCrop);
    else setOffset({ x: 0.5, y: 0.5 });
  }, [initialCrop, open]);

  // Target aspect ratio
  const targetAspect = orientation === "portrait" ? 9 / 16 : 16 / 9;

  // Compute crop rect dimensions relative to image
  const getCropRect = useCallback(() => {
    if (!imageDims.w || !imageDims.h) return { cw: 1, ch: 1 };
    const imgAspect = imageDims.w / imageDims.h;
    let cw: number, ch: number;
    if (imgAspect > targetAspect) {
      // Image is wider than target — crop width
      ch = 1;
      cw = targetAspect / imgAspect;
    } else {
      // Image is taller — crop height
      cw = 1;
      ch = imgAspect / targetAspect;
    }
    return { cw, ch };
  }, [imageDims, targetAspect]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setOffset({ x, y });
    },
    [dragging]
  );

  const { cw, ch } = getCropRect();

  // Clamp offset so crop rect stays inside image
  const clampedX = Math.max(cw / 2, Math.min(1 - cw / 2, offset.x));
  const clampedY = Math.max(ch / 2, Math.min(1 - ch / 2, offset.y));

  // Crop rect in percent
  const cropLeft = (clampedX - cw / 2) * 100;
  const cropTop = (clampedY - ch / 2) * 100;
  const cropWidth = cw * 100;
  const cropHeight = ch * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crop className="w-4 h-4" />
            Adjust crop area
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2 mb-3">
          Drag the highlighted area to choose which part of the image to show in the{" "}
          {orientation === "portrait" ? "9:16 portrait" : "16:9 landscape"} video.
        </p>

        {/* Crop canvas */}
        <div
          ref={containerRef}
          className="relative w-full bg-black rounded-lg overflow-hidden cursor-crosshair select-none"
          style={{ aspectRatio: `${imageDims.w || 4} / ${imageDims.h || 3}` }}
          onPointerDown={() => setDragging(true)}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragging(false)}
          onPointerLeave={() => setDragging(false)}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Crop preview"
              className="w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          )}

          {/* Dim overlay — outside crop */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Top dim */}
            <div
              className="absolute left-0 right-0 top-0 bg-black/50"
              style={{ height: `${cropTop}%` }}
            />
            {/* Bottom dim */}
            <div
              className="absolute left-0 right-0 bottom-0 bg-black/50"
              style={{ height: `${100 - cropTop - cropHeight}%` }}
            />
            {/* Left dim */}
            <div
              className="absolute left-0 bg-black/50"
              style={{
                top: `${cropTop}%`,
                height: `${cropHeight}%`,
                width: `${cropLeft}%`,
              }}
            />
            {/* Right dim */}
            <div
              className="absolute right-0 bg-black/50"
              style={{
                top: `${cropTop}%`,
                height: `${cropHeight}%`,
                width: `${100 - cropLeft - cropWidth}%`,
              }}
            />
          </div>

          {/* Crop rect border */}
          <div
            className="absolute border-2 border-white/80 rounded pointer-events-none"
            style={{
              left: `${cropLeft}%`,
              top: `${cropTop}%`,
              width: `${cropWidth}%`,
              height: `${cropHeight}%`,
            }}
          >
            {/* Center crosshair */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Move className="w-5 h-5 text-white/60" />
            </div>
            {/* Grid lines */}
            <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
            <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
            <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
            <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <Button variant="outline" onClick={() => {
            setOffset({ x: 0.5, y: 0.5 });
          }}>
            Reset to center
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="hero"
              onClick={() => onSave({ x: clampedX, y: clampedY })}
            >
              Apply crop
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Camera Action Picker ───────────────────────────────

function CameraActionPicker({
  value,
  onChange,
  label,
}: {
  value: CameraAction;
  onChange: (action: CameraAction) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur rounded text-xs font-medium text-foreground hover:bg-white transition-colors shadow-sm">
          <Camera className="w-3 h-3" />
          {label}
          <svg className="w-2.5 h-2.5 ml-0.5" viewBox="0 0 10 6" fill="none">
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        <div className="text-xs text-muted-foreground px-2 py-1.5">
          Choose camera motion...
        </div>
        {[
          { value: "push-in" as CameraAction, label: "Auto", recommended: true },
          { value: "push-in" as CameraAction, label: "Push In" },
          { value: "pull-out" as CameraAction, label: "Pull Out" },
          { value: "orbit" as CameraAction, label: "Orbit (Center)" },
          { value: "orbit-right" as CameraAction, label: "Orbit Right" },
          { value: "orbit-left" as CameraAction, label: "Orbit Left" },
          { value: "tracking" as CameraAction, label: "Tracking" },
          { value: "drone-up" as CameraAction, label: "Drone Up" },
          { value: "static" as CameraAction, label: "Static" },
        ].map((option, i) => (
          <button
            key={`${option.value}-${i}`}
            onClick={() => {
              onChange(option.value);
              setOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-2 py-2 rounded text-sm hover:bg-accent transition-colors ${
              (i === 0 && value === "push-in") ||
              option.label.toLowerCase().replace(" ", "-") === value
                ? "text-primary font-medium"
                : "text-foreground"
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-muted-foreground" />
            {option.label}
            {option.recommended && (
              <span className="text-xs text-muted-foreground ml-auto">(Recommended)</span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
