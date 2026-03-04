import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Link2,
  Upload,
  Loader2,
  AlertCircle,
  Check,
  ImageIcon,
} from "lucide-react";
import {
  PhotoUpload,
  ImageMetadata,
  CameraAction,
} from "./PhotoUpload";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useToast } from "@/hooks/use-toast";
import { PropertyDetails } from "./index";

const MAX_SELECTIONS = 10;

interface PropertySourceSelectorProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  imageMetadata?: ImageMetadata[];
  onMetadataChange?: (metadata: ImageMetadata[]) => void;
  propertyDetails: PropertyDetails;
  onPropertyDetailsChange: (details: PropertyDetails) => void;
  onScrapedImagesChange?: (imageUrls: string[]) => void;
  onScrapedMetadataChange?: (metadata: ImageMetadata[]) => void;
  userId?: string;
}

export function PropertySourceSelector({
  photos,
  onPhotosChange,
  imageMetadata,
  onMetadataChange,
  propertyDetails,
  onPropertyDetailsChange,
  onScrapedImagesChange,
  onScrapedMetadataChange,
  userId,
}: PropertySourceSelectorProps) {
  const { toast } = useToast();
  const [propertyUrl, setPropertyUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // All images returned from the scraper
  const [allScrapedImages, setAllScrapedImages] = useState<string[]>([]);

  // Images the user has selected (up to 10)
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  // Build ImageMetadata for selected scraped images — no AI detection
  const buildMetadataForSelection = useCallback(
    (selected: string[]) => {
      if (!onScrapedMetadataChange) return;

      const metadata: ImageMetadata[] = selected.map((url) => ({
        file: new File([], url.split("/").pop() || "scraped.jpg"),
        cameraAction: "push-in" as CameraAction,
        cameraAngle: "auto" as const,
        duration: 3.5,
        isLandscape: true, // scraped listing photos are almost always landscape
      }));

      onScrapedMetadataChange(metadata);
    },
    [onScrapedMetadataChange]
  );

  // Toggle image selection
  const toggleImageSelection = useCallback(
    (imageUrl: string) => {
      setSelectedImages((prev) => {
        const isSelected = prev.includes(imageUrl);

        let next: string[];
        if (isSelected) {
          next = prev.filter((url) => url !== imageUrl);
        } else {
          if (prev.length >= MAX_SELECTIONS) {
            toast({
              title: "Maximum reached",
              description: `You can select up to ${MAX_SELECTIONS} photos`,
              variant: "destructive",
            });
            return prev;
          }
          next = [...prev, imageUrl];
        }

        if (onScrapedImagesChange) {
          onScrapedImagesChange(next);
        }
        if (next.length > 0) {
          onPhotosChange([]);
        }
        setTimeout(() => buildMetadataForSelection(next), 0);

        return next;
      });
    },
    [
      onScrapedImagesChange,
      onPhotosChange,
      buildMetadataForSelection,
      toast,
    ]
  );

  // Scrape listing images
  const handleScrapeImages = async () => {
    if (!propertyUrl.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a property listing URL",
        variant: "destructive",
      });
      return;
    }

    try {
      new URL(propertyUrl);
    } catch {
      toast({
        title: "Invalid URL",
        description:
          "Please enter a valid URL (e.g., https://www.realestate.com.au/...)",
        variant: "destructive",
      });
      return;
    }

    if (
      !propertyUrl.includes("realestate.com.au") &&
      !propertyUrl.includes("domain.com.au")
    ) {
      toast({
        title: "Unsupported Website",
        description:
          "Please use a link from realestate.com.au or domain.com.au",
        variant: "destructive",
      });
      return;
    }

    setIsScraping(true);
    setScrapeError(null);
    setAllScrapedImages([]);
    setSelectedImages([]);
    if (onScrapedImagesChange) onScrapedImagesChange([]);
    if (onScrapedMetadataChange) onScrapedMetadataChange([]);

    try {
      console.log("Scraping listing images from:", propertyUrl);

      const data = await invokeEdgeFunction<{ success?: boolean; error?: string; images: string[] }>(
        "scrape-property",
        {
          body: { url: propertyUrl, mode: "images-only" },
          requireAuth: false,
        }
      );

      if (!data.success) {
        throw new Error(
          data.error ||
            "Listing could not be reached. Please check the URL or upload photos manually."
        );
      }

      const images: string[] = data.images;
      console.log("Scraped images:", images.length);

      if (images.length === 0) {
        throw new Error(
          "Listing could not be reached. Please check the URL or upload photos manually."
        );
      }

      setAllScrapedImages(images);

      toast({
        title: "Images Found!",
        description: `Found ${images.length} images. Select up to ${MAX_SELECTIONS} for your video.`,
      });
    } catch (err) {
      console.error("Scraping error:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Listing could not be reached. Please check the URL or upload photos manually.";
      setScrapeError(message);
      toast({
        title: "Scraping Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isScraping) {
      handleScrapeImages();
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Property Source</h3>

      <Tabs
        defaultValue="upload"
        className="w-full"
        onValueChange={(value) => {
          if (value === "upload") {
            setAllScrapedImages([]);
            setSelectedImages([]);
            setScrapeError(null);
            if (onScrapedImagesChange) onScrapedImagesChange([]);
          }
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Manual Upload
          </TabsTrigger>
          <TabsTrigger value="scrape" className="flex items-center gap-2">
            <Link2 className="w-4 h-4" />
            Import from Link
          </TabsTrigger>
        </TabsList>

        {/* Manual Upload Tab */}
        <TabsContent value="upload" className="mt-6">
          <PhotoUpload
            photos={photos}
            onChange={onPhotosChange}
            imageMetadata={imageMetadata}
            onMetadataChange={onMetadataChange}
            minPhotos={3}
            maxPhotos={10}
          />
        </TabsContent>

        {/* Import from Link Tab */}
        <TabsContent value="scrape" className="mt-6 space-y-4">
          {/* URL Input */}
          <div className="space-y-2">
            <Label htmlFor="property-url">Property Listing URL</Label>
            <div className="flex gap-2">
              <Input
                id="property-url"
                type="url"
                placeholder="https://www.realestate.com.au/property/..."
                value={propertyUrl}
                onChange={(e) => setPropertyUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isScraping}
                className="flex-1"
              />
              <Button
                onClick={handleScrapeImages}
                disabled={isScraping || !propertyUrl.trim()}
                className="min-w-[140px]"
              >
                {isScraping ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  "Fetch Images"
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Supported: realestate.com.au, domain.com.au
            </p>
          </div>

          {/* Error State */}
          {scrapeError && (
            <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">
                  {scrapeError}
                </p>
              </div>
            </div>
          )}

          {/* Selection Counter */}
          {allScrapedImages.length > 0 && (
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                {allScrapedImages.length} images found
              </Label>
              <div
                className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  selectedImages.length >= 3
                    ? "bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30"
                    : "bg-secondary text-foreground border border-border"
                }`}
              >
                Selected: {selectedImages.length}/{MAX_SELECTIONS}
              </div>
            </div>
          )}

          {/* Image Selection Grid */}
          {allScrapedImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Click images to select them for your video. You can set camera motion after selecting.
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-80 overflow-y-auto p-2 bg-secondary/20 rounded-lg">
                {allScrapedImages.map((url, index) => {
                  const isSelected = selectedImages.includes(url);
                  const selectionIndex = selectedImages.indexOf(url);

                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => toggleImageSelection(url)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-200 group ${
                        isSelected
                          ? "border-primary ring-2 ring-primary/30 scale-[0.97]"
                          : "border-transparent hover:border-primary/40"
                      }`}
                    >
                      <img
                        src={url}
                        alt={`Property image ${index + 1}`}
                        className={`w-full h-full object-cover transition-all ${
                          isSelected ? "brightness-90" : "group-hover:brightness-95"
                        }`}
                        loading="lazy"
                      />

                      {/* Selected overlay with order number */}
                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20">
                          <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg">
                            <span className="text-xs font-bold">
                              {selectionIndex + 1}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Unselected hover indicator */}
                      {!isSelected && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Images Queue Preview */}
          {selectedImages.length > 0 && (
            <div className="space-y-2">
              <Label>Your Upload Queue ({selectedImages.length} photos)</Label>
              <div className="flex gap-2 overflow-x-auto p-2 bg-card rounded-lg border border-border/50">
                {selectedImages.map((url, index) => (
                  <div
                    key={url}
                    className="relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border border-border/50"
                  >
                    <img
                      src={url}
                      alt={`Selected ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1 left-1 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[10px] font-bold shadow">
                      {index + 1}
                    </span>
                  </div>
                ))}
              </div>
              {selectedImages.length < 3 && (
                <p className="text-xs text-warning font-medium">
                  Select at least {3 - selectedImages.length} more (minimum 3
                  photos)
                </p>
              )}
            </div>
          )}

          {/* How it works */}
          {allScrapedImages.length === 0 && !isScraping && !scrapeError && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <h4 className="text-sm font-medium text-foreground mb-2">
                How it works
              </h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>
                  1. Paste a listing URL from realestate.com.au or
                  domain.com.au
                </li>
                <li>
                  2. We scan the gallery and show all available property images
                </li>
                <li>
                  3. Click to select up to {MAX_SELECTIONS} photos for your
                  video
                </li>
                <li>
                  4. Choose your preferred camera motion for each shot
                </li>
              </ul>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
