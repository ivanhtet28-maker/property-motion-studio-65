import { useState } from "react";
import { Camera, Crop, Smartphone, Monitor } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type CameraAction,
  CAMERA_ACTION_OPTIONS,
} from "./PhotoUpload";

interface StepEditProps {
  photos: File[];
  selectedIndices: number[];
  cameraActions: Record<number, CameraAction>;
  onCameraActionChange: (index: number, action: CameraAction) => void;
  orientation: "portrait" | "landscape";
  onOrientationChange: (orientation: "portrait" | "landscape") => void;
}

export function StepEdit({
  photos,
  selectedIndices,
  cameraActions,
  onCameraActionChange,
  orientation,
  onOrientationChange,
}: StepEditProps) {
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

          return (
            <div key={photoIndex} className="relative group">
              {/* Thumbnail */}
              <div className="aspect-[4/3] rounded-lg overflow-hidden border border-border bg-secondary">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Scene ${pos + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Scene number */}
                <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[11px] font-bold text-primary-foreground shadow">
                  {pos + 1}
                </div>
              </div>

              {/* Controls */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5">
                {/* Camera action picker */}
                <CameraActionPicker
                  value={action}
                  onChange={(a) => onCameraActionChange(photoIndex, a)}
                  label={actionLabel}
                />
                {/* Crop button (placeholder) */}
                <button className="flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur rounded text-xs font-medium text-foreground hover:bg-white transition-colors shadow-sm">
                  <Crop className="w-3 h-3" />
                  Crop
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
          { value: "pull-out" as CameraAction, label: "Push Out" },
          { value: "orbit" as CameraAction, label: "Orbit Right" },
          { value: "tracking" as CameraAction, label: "Orbit Left" },
          { value: "crane-up" as CameraAction, label: "Crane Up" },
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
