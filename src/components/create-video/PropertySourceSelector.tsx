import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link2, Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { PhotoUpload } from "./PhotoUpload";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { PropertyDetails } from "./index";

interface PropertySourceSelectorProps {
  photos: File[];
  onPhotosChange: (photos: File[]) => void;
  propertyDetails: PropertyDetails;
  onPropertyDetailsChange: (details: PropertyDetails) => void;
  onScrapedImagesChange?: (imageUrls: string[]) => void;
  userId?: string;
}

interface ScrapedData {
  address: string;
  suburb?: string;
  state?: string;
  price?: string;
  bedrooms?: number;
  bathrooms?: number;
  parking?: number;
  landSize?: string;
  features?: string[];
  description?: string;
  imageUrls: string[];
  propertyId?: string;
}

export function PropertySourceSelector({
  photos,
  onPhotosChange,
  propertyDetails,
  onPropertyDetailsChange,
  onScrapedImagesChange,
  userId,
}: PropertySourceSelectorProps) {
  const { toast } = useToast();
  const [propertyUrl, setPropertyUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapingStatus, setScrapingStatus] = useState<"idle" | "success" | "error">("idle");
  const [scrapedImageUrls, setScrapedImageUrls] = useState<string[]>([]);

  const handleScrapeProperty = async () => {
    if (!propertyUrl.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a property listing URL",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      new URL(propertyUrl);
    } catch {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL (e.g., https://www.domain.com.au/...)",
        variant: "destructive",
      });
      return;
    }

    // Check if URL is from supported website
    if (!propertyUrl.includes("domain.com.au") && !propertyUrl.includes("realtor.com.au")) {
      toast({
        title: "Unsupported Website",
        description: "Currently only Domain.com.au and Realtor.com.au are supported",
        variant: "destructive",
      });
      return;
    }

    setIsScraping(true);
    setScrapingStatus("idle");

    try {
      console.log("Scraping property from:", propertyUrl);

      const { data, error } = await supabase.functions.invoke("scrape-property", {
        body: {
          url: propertyUrl,
          userId: userId || "anonymous",
        },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || "Scraping failed");
      }

      const scrapedData: ScrapedData = data.property;
      console.log("Scraped data:", scrapedData);

      // Update property details with scraped data
      onPropertyDetailsChange({
        streetAddress: scrapedData.address || "",
        suburb: scrapedData.suburb || "",
        state: scrapedData.state || "",
        price: scrapedData.price || "",
        bedrooms: scrapedData.bedrooms || propertyDetails.bedrooms,
        bathrooms: scrapedData.bathrooms || propertyDetails.bathrooms,
        carSpaces: scrapedData.parking || propertyDetails.carSpaces,
        landSize: scrapedData.landSize || "",
        features: scrapedData.features || [],
      });

      // Store scraped image URLs for video generation
      setScrapedImageUrls(scrapedData.imageUrls);
      setScrapingStatus("success");

      // Notify parent component of scraped images
      if (onScrapedImagesChange) {
        onScrapedImagesChange(scrapedData.imageUrls);
      }

      // Clear any uploaded photos since we're using scraped images
      onPhotosChange([]);

      toast({
        title: "Property Scraped Successfully!",
        description: `Found ${data.imagesScraped} images and property details`,
      });
    } catch (err) {
      console.error("Scraping error:", err);
      setScrapingStatus("error");

      toast({
        title: "Scraping Failed",
        description:
          err instanceof Error
            ? err.message
            : "Failed to scrape property. Please check the URL or try uploading photos manually.",
        variant: "destructive",
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isScraping) {
      handleScrapeProperty();
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Property Source</h3>

      <Tabs
        defaultValue="upload"
        className="w-full"
        onValueChange={(value) => {
          // Clear scraped images when switching to upload mode
          if (value === "upload" && onScrapedImagesChange) {
            setScrapedImageUrls([]);
            setScrapingStatus("idle");
            onScrapedImagesChange([]);
          }
        }}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload Photos
          </TabsTrigger>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex-1">
                  <TabsTrigger
                    value="scrape"
                    disabled
                    className="flex items-center gap-2 opacity-50 cursor-not-allowed w-full"
                  >
                    <Link2 className="w-4 h-4" />
                    Scrape from URL
                  </TabsTrigger>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Coming soon</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TabsList>

        <TabsContent value="upload" className="mt-6">
          <PhotoUpload photos={photos} onChange={onPhotosChange} minPhotos={3} maxPhotos={6} />
        </TabsContent>

        <TabsContent value="scrape" className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="property-url">Property Listing URL</Label>
            <div className="flex gap-2">
              <Input
                id="property-url"
                type="url"
                placeholder="https://www.domain.com.au/..."
                value={propertyUrl}
                onChange={(e) => setPropertyUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isScraping}
                className="flex-1"
              />
              <Button
                onClick={handleScrapeProperty}
                disabled={isScraping || !propertyUrl.trim()}
                className="min-w-[120px]"
              >
                {isScraping ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  "Scrape Property"
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Supported: Domain.com.au, Realtor.com.au
            </p>
          </div>

          {/* Scraping Status */}
          {scrapingStatus === "success" && (
            <div className="flex items-start gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">
                  Property scraped successfully!
                </p>
                <p className="text-xs text-muted-foreground">
                  Found {scrapedImageUrls.length} images. Property details have been auto-filled
                  below.
                </p>
              </div>
            </div>
          )}

          {scrapingStatus === "error" && (
            <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">Scraping failed</p>
                <p className="text-xs text-muted-foreground">
                  Please check the URL or try uploading photos manually.
                </p>
              </div>
            </div>
          )}

          {/* Scraped Images Preview */}
          {scrapedImageUrls.length > 0 && (
            <div className="space-y-2">
              <Label>Scraped Images ({scrapedImageUrls.length})</Label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-2 bg-secondary/20 rounded-lg">
                {scrapedImageUrls.map((url, index) => (
                  <div
                    key={index}
                    className="relative aspect-square rounded-lg overflow-hidden border border-border/50"
                  >
                    <img
                      src={url}
                      alt={`Property image ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <h4 className="text-sm font-medium text-foreground mb-2">How it works</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Paste a property listing URL from Domain.com.au or Realtor.com.au</li>
              <li>• We'll automatically extract images and property details</li>
              <li>• Property details below will be auto-filled</li>
              <li>• Review and edit details before generating your video</li>
            </ul>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
