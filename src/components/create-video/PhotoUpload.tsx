import { useCallback, useState } from "react";
import { Upload, X, ImageIcon } from "lucide-react";

interface PhotoUploadProps {
  photos: File[];
  onChange: (photos: File[]) => void;
  minPhotos?: number;
  maxPhotos?: number;
}

export function PhotoUpload({
  photos,
  onChange,
  minPhotos = 10,
  maxPhotos = 20,
}: PhotoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
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

  const photoPreviews = photos.map((file) => URL.createObjectURL(file));

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <ImageIcon className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Upload Photos</h2>
        <span className="text-sm text-muted-foreground">({minPhotos}-{maxPhotos} required)</span>
      </div>

      {/* Drop Zone */}
      <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`block border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-secondary/30"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
        <p className="font-medium text-foreground">
          Drag photos here or click to browse
        </p>
        <p className="text-sm text-muted-foreground mt-1">JPG, PNG, HEIC accepted</p>
      </label>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
          {photoPreviews.map((preview, index) => (
            <div key={index} className="relative aspect-square group">
              <img
                src={preview}
                alt={`Photo ${index + 1}`}
                className="w-full h-full object-cover rounded-lg"
              />
              <button
                onClick={() => removePhoto(index)}
                className="absolute top-1 right-1 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                <X className="w-4 h-4" />
              </button>
              {index === 0 && (
                <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-foreground/80 text-background text-xs rounded font-medium">
                  Cover
                </span>
              )}
            </div>
          ))}

          {/* Add More Button */}
          {photos.length < maxPhotos && (
            <label className="aspect-square border-2 border-dashed border-border rounded-lg flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-secondary/30 transition-all">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              <div className="text-center">
                <span className="text-2xl text-muted-foreground">+</span>
                <p className="text-xs text-muted-foreground">Add More</p>
              </div>
            </label>
          )}
        </div>
      )}

      {/* Photo Count */}
      <div className="flex items-center justify-between text-sm">
        <span className={`${photos.length < minPhotos ? "text-warning" : "text-muted-foreground"}`}>
          {photos.length}/{maxPhotos} photos uploaded
        </span>
        {photos.length < minPhotos && (
          <span className="text-warning">
            Need {minPhotos - photos.length} more
          </span>
        )}
      </div>
    </section>
  );
}
