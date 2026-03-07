import { useCallback, useState } from "react";
import { Upload, ImageIcon, X } from "lucide-react";

interface StepUploadProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
}

export function StepUpload({ photos, onPhotosChange }: StepUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length > 0) {
        onPhotosChange([...photos, ...files].slice(0, 20));
      }
    },
    [photos, onPhotosChange]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onPhotosChange([...photos, ...files].slice(0, 20));
      }
      e.target.value = "";
    },
    [photos, onPhotosChange]
  );

  const removePhoto = (index: number) => {
    onPhotosChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">Upload photos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Add property photos to create your video. You can upload up to 20 images.
        </p>
      </div>

      {/* Drop zone */}
      <label
        className={`block border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">
          Drag & drop photos here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          JPG, PNG, WebP — up to 20 images
        </p>
      </label>

      {/* Uploaded thumbnails */}
      {photos.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-medium text-muted-foreground mb-3">
            {photos.length} photo{photos.length !== 1 ? "s" : ""} uploaded
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
            {photos.map((photo, i) => (
              <div key={i} className="relative group aspect-[4/3] rounded-lg overflow-hidden border border-border bg-secondary">
                <img
                  src={URL.createObjectURL(photo)}
                  alt={`Photo ${i + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {/* Add more button */}
            <label className="aspect-[4/3] rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center cursor-pointer transition-colors">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <ImageIcon className="w-6 h-6 text-muted-foreground" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
