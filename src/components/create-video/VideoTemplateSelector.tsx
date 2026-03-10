import { Check, ChevronLeft, ChevronRight, BedDouble, Bath, Car, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface VideoTemplate {
  id: string;
  name: string;
  description: string;
  duration: string;
  image?: string;
}

const templates: VideoTemplate[] = [
  {
    id: "just-listed",
    name: "Just Listed",
    description: "3-4 sec intro",
    duration: "Cinematic opening",
  },
  {
    id: "minimalist",
    name: "Minimalist",
    description: "2-3 sec intro",
    duration: "Clean aesthetic",
  },
  {
    id: "cinematic",
    name: "Cinematic",
    description: "5-6 sec intro",
    duration: "Dynamic cameras",
  },
  {
    id: "luxury",
    name: "Luxury",
    description: "4-5 sec intro",
    duration: "Gold accents",
  },
  {
    id: "real-estate-pro",
    name: "Real Estate Pro",
    description: "3-4 sec intro",
    duration: "Professional",
  },
];

// Layout options for property details overlay
interface LayoutOption {
  id: string;
  name: string;
  description: string;
}

const layouts: LayoutOption[] = [
  {
    id: "bold-banner",
    name: "Bold Banner",
    description: "Bottom banner with price and details",
  },
  {
    id: "warm-elegance",
    name: "Warm Elegance",
    description: "Dark vignette overlay with elegant serif typography",
  },
];

interface PropertyPreviewData {
  streetAddress: string;
  suburb: string;
  state: string;
  price: string;
  bedrooms: number;
  bathrooms: number;
  carSpaces?: number;
  landSize?: string;
}

interface VideoTemplateSelectorProps {
  selectedTemplate: string;
  onSelectTemplate: (templateId: string) => void;
  selectedLayout: string;
  onSelectLayout: (layoutId: string) => void;
  customTitle: string;
  onCustomTitleChange: (title: string) => void;
  previewImageUrl?: string;
  propertyDetails?: PropertyPreviewData;
}

// Shotstack icon URLs (same as used in the actual video)
const ICON_URLS = {
  bed: "https://templates.shotstack.io/basic/asset/image/icon/slimline/white/26px/bed.png",
  bath: "https://templates.shotstack.io/basic/asset/image/icon/slimline/white/26px/bath.png",
  car: "https://templates.shotstack.io/basic/asset/image/icon/slimline/white/26px/car.png",
};

// Preview components for each layout
interface PreviewProps {
  title: string;
  previewImageUrl?: string;
  property?: PropertyPreviewData;
}

function formatPrice(price: string): string {
  if (!price) return "$X,XXX,XXX";
  const num = parseInt(price.replace(/[^0-9]/g, ""));
  if (isNaN(num)) return `$${price}`;
  return `$${num.toLocaleString()}`;
}

function getAddress(property?: PropertyPreviewData): string {
  if (!property) return "123 Example Street, Suburb, NSW";
  const parts = [property.streetAddress, property.suburb, property.state].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "123 Example Street, Suburb, NSW";
}

function PropertySpecs({ property, className = "" }: { property?: PropertyPreviewData; className?: string }) {
  const beds = property?.bedrooms ?? 4;
  const baths = property?.bathrooms ?? 3;
  const cars = property?.carSpaces;
  const land = property?.landSize;

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex items-center gap-1">
        <img src={ICON_URLS.bed} alt="Bed" className="w-3.5 h-3.5" />
        <span className="text-[10px] text-white font-semibold">{beds}</span>
      </div>
      <div className="flex items-center gap-1">
        <img src={ICON_URLS.bath} alt="Bath" className="w-3.5 h-3.5" />
        <span className="text-[10px] text-white font-semibold">{baths}</span>
      </div>
      {(cars !== undefined && cars > 0) && (
        <div className="flex items-center gap-1">
          <img src={ICON_URLS.car} alt="Car" className="w-3.5 h-3.5" />
          <span className="text-[10px] text-white font-semibold">{cars}</span>
        </div>
      )}
      {land && (
        <span className="text-[10px] text-white font-semibold">{land}m²</span>
      )}
    </div>
  );
}

function MinimalFocusPreview({ title, previewImageUrl, property }: PreviewProps) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative">
      {previewImageUrl && (
        <>
          <img src={previewImageUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30" />
        </>
      )}
      <div className="z-10 px-8 py-5 text-center flex flex-col items-center">
        <div className="text-lg font-bold text-white uppercase tracking-wider" style={{ textShadow: "3px 3px 8px rgba(0,0,0,0.8)" }}>
          {title}
        </div>
        <div className="text-[10px] text-white/90 mt-1" style={{ textShadow: "2px 2px 6px rgba(0,0,0,0.8)" }}>
          {getAddress(property)}
        </div>
        <PropertySpecs property={property} className="mt-2" />
      </div>
    </div>
  );
}

function BoldBannerPreview({ title, previewImageUrl, property }: PreviewProps) {
  return (
    <div className="w-full h-full flex flex-col justify-end relative">
      {previewImageUrl && (
        <>
          <img src={previewImageUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </>
      )}
      <div className="z-10 bg-gradient-to-t from-black/60 to-black/40 px-4 py-3">
        <div className="flex justify-between items-center mb-1">
          <div className="text-sm font-bold text-white uppercase tracking-wide">{title}</div>
          <div className="text-sm font-bold text-white">{formatPrice(property?.price || "")}</div>
        </div>
        <div className="text-[9px] text-white/80">{getAddress(property)}</div>
        <PropertySpecs property={property} className="mt-1" />
      </div>
    </div>
  );
}

function ModernLuxePreview({ title, previewImageUrl, property }: PreviewProps) {
  return (
    <div className="w-full h-full flex flex-col relative">
      {previewImageUrl && (
        <>
          <img src={previewImageUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/35" />
        </>
      )}
      <div className="z-10 flex-1 flex flex-col items-center justify-center text-center px-4">
        <div className="text-2xl font-black text-white" style={{ textShadow: "2px 2px 6px rgba(0,0,0,0.7)" }}>
          {title}
        </div>
        <div className="bg-black/45 px-3 py-1 rounded mt-2">
          <div className="text-[9px] text-white/90">{getAddress(property)}</div>
        </div>
      </div>
      <div className="z-10 flex justify-between items-center px-4 py-2 bg-gradient-to-t from-black/60 to-transparent">
        <PropertySpecs property={property} />
        <div className="text-xs font-bold text-white">{formatPrice(property?.price || "")}</div>
      </div>
    </div>
  );
}

function WarmElegancePreview({ title, previewImageUrl, property }: PreviewProps) {
  const beds = property?.bedrooms ?? 4;
  const baths = property?.bathrooms ?? 3;
  const cars = property?.carSpaces;

  return (
    <div className="w-full h-full relative overflow-hidden">
      {/* Property image background */}
      {previewImageUrl && (
        <img src={previewImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      {!previewImageUrl && (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
      )}
      {/* Dark top vignette */}
      <div className="absolute top-0 left-0 right-0 h-[21%]" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.40), transparent)" }} />
      {/* Dark bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-[57%]" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.60) 40%, transparent 100%)" }} />
      <div className="absolute top-[43%] left-0 right-0 text-center px-4">
        <div className="text-white/95 text-3xl italic leading-tight" style={{ fontFamily: "Georgia, serif", letterSpacing: "1px", textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
          {title}
        </div>
        <div className="text-white/60 text-[9px] uppercase mt-2" style={{ letterSpacing: "4px" }}>
          {property?.streetAddress || "27 Alamanda Blvd"}
        </div>
        <div className="text-white/40 text-[9px] uppercase mt-0.5" style={{ letterSpacing: "4px" }}>
          {property?.suburb || "Point Cook"} {property?.state || "VIC"}
        </div>
        <div className="text-white/90 text-base mt-2" style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
          {formatPrice(property?.price || "")}
        </div>
        <div className="mx-auto mt-2 w-[37%] h-px bg-white/15" />
      </div>
      {/* Stats pill with icons */}
      <div className="absolute bottom-[12%] left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2 rounded-full border border-white/15" style={{ background: "rgba(0,0,0,0.35)" }}>
        <span className="flex items-center gap-1 text-white/90 text-[9px]">
          <BedDouble className="w-3.5 h-3.5 text-white/75" strokeWidth={1.5} />
          {beds}
        </span>
        <div className="w-px h-4 bg-white/15" />
        <span className="flex items-center gap-1 text-white/90 text-[9px]">
          <Bath className="w-3.5 h-3.5 text-white/75" strokeWidth={1.5} />
          {baths}
        </span>
        {(cars !== undefined && cars > 0) && (
          <>
            <div className="w-px h-4 bg-white/15" />
            <span className="flex items-center gap-1 text-white/90 text-[9px]">
              <Car className="w-3.5 h-3.5 text-white/75" strokeWidth={1.5} />
              {cars}
            </span>
          </>
        )}
        {property?.landSize && (
          <>
            <div className="w-px h-4 bg-white/15" />
            <span className="flex items-center gap-1 text-white/70 text-[8px]">
              <Ruler className="w-3 h-3 text-white/60" strokeWidth={1.5} />
              {property.landSize}m²
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export function VideoTemplateSelector({
  selectedTemplate,
  onSelectTemplate,
  selectedLayout,
  onSelectLayout,
  customTitle,
  onCustomTitleChange,
  previewImageUrl,
  propertyDetails,
}: VideoTemplateSelectorProps) {
  const layoutIndex = layouts.findIndex(l => l.id === selectedLayout);
  const currentLayout = layouts[layoutIndex] || layouts[0];

  const handlePreviousLayout = () => {
    const newIndex = layoutIndex > 0 ? layoutIndex - 1 : layouts.length - 1;
    onSelectLayout(layouts[newIndex].id);
  };

  const handleNextLayout = () => {
    const newIndex = layoutIndex < layouts.length - 1 ? layoutIndex + 1 : 0;
    onSelectLayout(layouts[newIndex].id);
  };

  // Display title for preview
  const displayTitle = customTitle || templates.find(t => t.id === selectedTemplate)?.name || "Open House";

  // Render the appropriate preview
  const renderPreview = () => {
    switch (currentLayout.id) {
      case "bold-banner":
        return <BoldBannerPreview title={displayTitle} previewImageUrl={previewImageUrl} property={propertyDetails} />;
      case "warm-elegance":
        return <WarmElegancePreview title={displayTitle} previewImageUrl={previewImageUrl} property={propertyDetails} />;
      default:
        return <BoldBannerPreview title={displayTitle} previewImageUrl={previewImageUrl} property={propertyDetails} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Custom Title Input */}
      <div>
        <h3 className="text-sm font-medium flex items-center gap-2">
          Video Title
        </h3>
        <p className="text-xs text-muted-foreground mt-1 mb-2">
          Enter a custom title or leave blank to use template name
        </p>
        <Input
          placeholder="e.g., Just Sold, Open House, New Listing..."
          value={customTitle}
          onChange={(e) => onCustomTitleChange(e.target.value)}
          className="text-sm"
        />
      </div>

      {/* Layout Selector */}
      <div>
        <h3 className="text-sm font-medium flex items-center gap-2">
          Template & Details
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Choose your video template and add property details
        </p>
      </div>

      {/* Layout Carousel */}
      <div className="relative">
        <Button
          variant="outline"
          size="icon"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm"
          onClick={handlePreviousLayout}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm"
          onClick={handleNextLayout}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {/* Layout Preview Card */}
        <div className="relative rounded-xl border-2 border-primary bg-primary/5 p-4">
          <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-primary flex items-center justify-center z-10">
            <Check className="w-4 h-4 text-primary-foreground" />
          </div>

          {/* Layout Preview */}
          <div className="w-full aspect-[9/16] max-h-[600px] mx-auto rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 overflow-hidden relative shadow-xl">
            {!previewImageUrl && (
              <div
                className="absolute inset-0 opacity-20"
                style={{
                  backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"100\" height=\"100\" viewBox=\"0 0 100 100\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h50v50H0z\" fill=\"%23fff\" opacity=\".1\"/%3E%3C/svg%3E')",
                  backgroundSize: "20px 20px"
                }}
              />
            )}
            {renderPreview()}
          </div>

          {/* Layout Info */}
          <div className="mt-4 text-center space-y-1">
            <p className="text-sm font-medium text-foreground">
              {currentLayout.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {currentLayout.description}
            </p>
          </div>
        </div>

        {/* Dots Indicator */}
        <div className="flex justify-center gap-1.5 mt-3">
          {layouts.map((layout, index) => (
            <button
              key={layout.id}
              onClick={() => onSelectLayout(layout.id)}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                index === layoutIndex
                  ? "bg-primary w-6"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
              aria-label={`Select ${layout.name}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
