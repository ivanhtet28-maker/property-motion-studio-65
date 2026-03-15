import { useRef, useState } from "react";
import { ImageIcon, ArrowRight, Check, GripVertical } from "lucide-react";

interface StepSelectProps {
  photos: File[];
  selectedIndices: number[];
  onSelectionChange: (indices: number[]) => void;
}

export function StepSelect({
  photos,
  selectedIndices,
  onSelectionChange,
}: StepSelectProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLElement | null>(null);

  const toggleSelect = (index: number) => {
    if (selectedIndices.includes(index)) {
      onSelectionChange(selectedIndices.filter((i) => i !== index));
    } else {
      onSelectionChange([...selectedIndices, index]);
    }
  };

  const removeSelected = (index: number) => {
    onSelectionChange(selectedIndices.filter((i) => i !== index));
  };

  // --- Drag & drop handlers ---
  const handleDragStart = (e: React.DragEvent, pos: number) => {
    setDragIndex(pos);
    dragNodeRef.current = e.currentTarget as HTMLElement;
    e.dataTransfer.effectAllowed = "move";
    // Delay so the dragged element isn't instantly styled
    requestAnimationFrame(() => {
      dragNodeRef.current?.classList.add("opacity-40");
    });
  };

  const handleDragOver = (e: React.DragEvent, pos: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex === null || dragIndex === pos) return;
    setDragOverIndex(pos);
  };

  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const reordered = [...selectedIndices];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dragOverIndex, 0, moved);
      onSelectionChange(reordered);
    }
    dragNodeRef.current?.classList.remove("opacity-40");
    setDragIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  };

  const selectedPhotos = selectedIndices.map((i) => ({ index: i, file: photos[i] }));

  return (
    <div className="flex gap-6 h-full">
      {/* Available images */}
      <div className="flex-1 border border-border rounded-xl p-5 min-h-[500px]">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Available images{" "}
            <span className="text-muted-foreground font-normal">{photos.length}</span>
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Click on an image to select it for use in the video.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo, i) => {
            const isSelected = selectedIndices.includes(i);
            return (
              <button
                key={i}
                onClick={() => toggleSelect(i)}
                className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <img
                  src={URL.createObjectURL(photo)}
                  alt={`Photo ${i + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {isSelected && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Arrow */}
      <div className="flex items-center">
        <ArrowRight className="w-5 h-5 text-primary" />
      </div>

      {/* Selected images — drag to reorder */}
      <div className="flex-1 border border-border rounded-xl p-5 min-h-[500px]">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Selected images{" "}
            <span className="text-muted-foreground font-normal">
              {selectedIndices.length} / {photos.length}
            </span>
          </h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Drag to reorder, click to remove. Scenes will appear in this order in the video.
        </p>

        {selectedPhotos.length === 0 ? (
          <div className="flex items-center justify-center h-60 text-muted-foreground text-sm">
            Select images from the left panel
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {selectedPhotos.map(({ index, file }, pos) => (
              <div
                key={index}
                draggable
                onDragStart={(e) => handleDragStart(e, pos)}
                onDragOver={(e) => handleDragOver(e, pos)}
                onDragEnd={handleDragEnd}
                onDragLeave={() => { if (dragOverIndex === pos) setDragOverIndex(null); }}
                className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all cursor-grab active:cursor-grabbing select-none ${
                  dragOverIndex === pos && dragIndex !== pos
                    ? "border-primary ring-2 ring-primary/40 scale-[1.03]"
                    : "border-primary"
                } group`}
              >
                <img
                  src={URL.createObjectURL(file)}
                  alt={`Selected ${pos + 1}`}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />
                {/* Position badge */}
                <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                  {pos + 1}
                </div>
                {/* Drag handle hint */}
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="w-3 h-3 text-white" />
                </div>
                {/* Click overlay to remove */}
                <button
                  onClick={() => removeSelected(index)}
                  className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center"
                  aria-label={`Remove image ${pos + 1}`}
                >
                  <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-medium bg-black/60 px-2 py-1 rounded transition-opacity">
                    Click to remove
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
