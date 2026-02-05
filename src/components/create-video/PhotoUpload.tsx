import { useCallback, useState } from "react";
import { Upload, X, ImageIcon, GripVertical, Star } from "lucide-react";

interface PhotoUploadProps {
  photos: File[];
  onChange: (photos: File[]) => void;
  minPhotos?: number;
  maxPhotos?: number;
}

export function PhotoUpload({
  photos,
  onChange,
  minPhotos = 3,
  maxPhotos = 6,
}: PhotoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

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
    },
    [photos, maxPhotos, onChange]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newPhotos = [...photos, ...files].slice(0, maxPhotos);
      onChange(newPhotos);
    }
  };

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  const handlePhotoReorder = (fromIndex: number, toIndex: number) => {
    const newPhotos = [...photos];
    const [removed] = newPhotos.splice(fromIndex, 1);
    newPhotos.splice(toIndex, 0, removed);
    onChange(newPhotos);
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
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <GripVertical className="w-3 h-3" />
            Drag to reorder • First image is the cover
          </p>
          
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {photoPreviews.map((preview, index) => (
              <div
                key={index}
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
                className={`relative aspect-square group cursor-grab active:cursor-grabbing transition-all duration-200 ${
                  draggedIndex === index ? "opacity-50 scale-95" : "hover:scale-[1.02]"
                }`}
              >
                <img
                  src={preview}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-full object-cover rounded-xl shadow-sm"
                />
                
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                
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
                  <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-primary text-primary-foreground text-xs rounded-full font-semibold flex items-center gap-1 shadow-lg">
                    <Star className="w-3 h-3" fill="currentColor" />
                    Cover
                  </span>
                )}
                
                {/* Photo number */}
                {index !== 0 && (
                  <span className="absolute bottom-2 left-2 w-6 h-6 bg-black/60 text-white text-xs rounded-full flex items-center justify-center font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    {index + 1}
                  </span>
                )}
              </div>
            ))}

            {/* Add More Button */}
            {photos.length < maxPhotos && (
              <label className="aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all group">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="w-10 h-10 rounded-full bg-secondary group-hover:bg-primary/10 flex items-center justify-center transition-colors mb-2">
                  <span className="text-2xl text-muted-foreground group-hover:text-primary transition-colors">+</span>
                </div>
                <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors font-medium">
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
