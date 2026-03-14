import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, RotateCcw, Check, Home, Palette, Image } from "lucide-react";
import { useStagingJobs, type StagingJob } from "@/hooks/useStagingJobs";

const ROOM_TYPES = [
  { value: "LIVINGROOM", label: "Living Room", icon: "🛋️" },
  { value: "BEDROOM", label: "Bedroom", icon: "🛏️" },
  { value: "KITCHEN", label: "Kitchen", icon: "🍳" },
  { value: "DININGROOM", label: "Dining", icon: "🍽️" },
  { value: "OFFICE", label: "Office", icon: "💼" },
  { value: "BATHROOM", label: "Bathroom", icon: "🚿" },
  { value: "BACK_PATIO", label: "Patio", icon: "🌿" },
  { value: "GARAGE", label: "Garage", icon: "🚗" },
  { value: "KIDSROOM", label: "Kids Room", icon: "🧸" },
];

// Room type → recommended styles
const STYLE_RECOMMENDATIONS: Record<string, string[]> = {
  LIVINGROOM: ["MODERN", "COASTAL", "LUXEMODERN"],
  BEDROOM: ["MINIMALIST", "SCANDINAVIAN", "CONTEMPORARY"],
  KITCHEN: ["MODERN", "FARMHOUSE", "INDUSTRIAL"],
  DININGROOM: ["ARTDECO", "LUXEMODERN", "CONTEMPORARY"],
  OFFICE: ["MODERN", "MINIMALIST", "INDUSTRIAL"],
  BATHROOM: ["MINIMALIST", "SCANDINAVIAN", "COASTAL"],
  BACK_PATIO: ["COASTAL", "FARMHOUSE", "BOHO"],
  GARAGE: ["INDUSTRIAL", "MODERN", "CONTEMPORARY"],
  KIDSROOM: ["CONTEMPORARY", "BOHO", "MINIMALIST"],
};

const DESIGN_STYLES = [
  { value: "MODERN", label: "Modern", description: "Clean, sleek, contemporary" },
  { value: "SCANDINAVIAN", label: "Scandinavian", description: "Light, minimal, cozy" },
  { value: "LUXEMODERN", label: "Luxury Modern", description: "Elegant, premium finishes" },
  { value: "FARMHOUSE", label: "Farmhouse", description: "Rustic, warm, homey" },
  { value: "MINIMALIST", label: "Minimalist", description: "Simple, uncluttered, calm" },
  { value: "INDUSTRIAL", label: "Industrial", description: "Raw, exposed, edgy" },
  { value: "COASTAL", label: "Coastal", description: "Breezy, beach, relaxed" },
  { value: "ARTDECO", label: "Art Deco", description: "Glamorous, geometric, bold" },
  { value: "BOHO", label: "Bohemian", description: "Eclectic, artistic, free" },
  { value: "CONTEMPORARY", label: "Contemporary", description: "Current, trendy, stylish" },
];

interface StagingFlowProps {
  imageUrls: string[];
  onComplete: (jobs: StagingJob[]) => void;
  userId: string;
}

export function StagingFlow({ imageUrls, onComplete, userId }: StagingFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [roomType, setRoomType] = useState("LIVINGROOM");
  const [designStyle, setDesignStyle] = useState("MODERN");

  const { jobs, isProcessing, stagePhotos, restageWithOptions } = useStagingJobs();

  const handleSubmitStaging = async () => {
    setStep(4);
    await stagePhotos(imageUrls, roomType, designStyle, userId);
  };

  const handleTryDifferentStyle = async () => {
    setStep(3);
    const jobIds = jobs.map((j) => j.id);
    await restageWithOptions(jobIds, roomType, designStyle);
  };

  const handleDownload = () => {
    if (jobs.length > 0) {
      const job = jobs[0];
      if (job.staged_urls.length > 0) {
        const url = job.staged_urls[0];
        const a = document.createElement("a");
        a.href = url;
        a.download = `propertymotion-staged-${designStyle.toLowerCase()}.jpg`;
        a.click();
      }
    }
  };

  const getRecommendedStyles = () => {
    return STYLE_RECOMMENDATIONS[roomType] || [];
  };

  const isStyleRecommended = (styleValue: string) => {
    return getRecommendedStyles().includes(styleValue);
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8">
      {/* Step Indicator — 4 Steps */}
      <div className="flex items-center justify-between px-4">
        {[
          { num: 1, label: "Upload", icon: Image },
          { num: 2, label: "Room Type", icon: Home },
          { num: 3, label: "Style", icon: Palette },
          { num: 4, label: "Results", icon: Check },
        ].map((s, idx) => {
          const Icon = s.icon;
          return (
            <div key={s.num} className="flex items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  step >= s.num
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > s.num ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              <span className={`text-xs font-medium ml-2 ${step >= s.num ? "text-primary" : "text-muted-foreground"}`}>
                {s.label}
              </span>
              {idx < 3 && <div className={`flex-1 h-1 mx-2 ${step > s.num ? "bg-primary" : "bg-muted"}`} />}
            </div>
          );
        })}
      </div>

      {/* STEP 1: Upload Photos */}
      {step === 1 && (
        <div className="space-y-6 px-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">📸 Virtual Staging</h2>
            <p className="text-muted-foreground">
              {imageUrls.length} photo{imageUrls.length > 1 ? "s" : ""} selected
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
            {imageUrls.map((url, i) => (
              <div key={i} className="aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-primary/50 transition-colors">
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>

          <Button onClick={() => setStep(2)} size="lg" className="w-full">
            Next: Choose Room Type
          </Button>
        </div>
      )}

      {/* STEP 2: Room Type */}
      {step === 2 && (
        <div className="space-y-6 px-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">🏠 What Type of Room?</h2>
            <p className="text-muted-foreground">This helps us recommend the best design styles</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ROOM_TYPES.map((room) => (
              <button
                key={room.value}
                onClick={() => setRoomType(room.value)}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  roomType === room.value
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                }`}
              >
                <span className="text-3xl">{room.icon}</span>
                <span className="text-sm font-medium text-center">{room.label}</span>
              </button>
            ))}
          </div>

          <Button onClick={() => setStep(3)} size="lg" className="w-full">
            Next: Choose Design Style
          </Button>
        </div>
      )}

      {/* STEP 3: Design Style */}
      {step === 3 && (
        <div className="space-y-6 px-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">🎨 Choose Design Style</h2>
            <p className="text-muted-foreground">
              Recommended styles for {ROOM_TYPES.find((r) => r.value === roomType)?.label}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {DESIGN_STYLES.map((style) => {
              const isRecommended = isStyleRecommended(style.value);
              return (
                <button
                  key={style.value}
                  onClick={() => setDesignStyle(style.value)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    designStyle === style.value
                      ? "border-primary bg-primary/10"
                      : isRecommended
                        ? "border-primary/30 hover:border-primary/50"
                        : "border-border hover:border-border"
                  }`}
                >
                  <div className="font-medium text-sm">{style.label}</div>
                  <div className="text-xs text-muted-foreground">{style.description}</div>
                  {isRecommended && designStyle !== style.value && (
                    <div className="text-xs text-primary font-medium mt-2">✨ Recommended</div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            ⏱️ Processing takes ~20 seconds. We'll show you the result next.
          </div>

          <Button onClick={handleSubmitStaging} size="lg" className="w-full" disabled={isProcessing}>
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Generate Staging"
            )}
          </Button>
        </div>
      )}

      {/* STEP 4: Results */}
      {step === 4 && (
        <div className="space-y-6 px-4">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">✨ Staging Complete!</h2>
            <p className="text-muted-foreground">
              {DESIGN_STYLES.find((s) => s.value === designStyle)?.label} style applied
            </p>
          </div>

          {isProcessing ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Staging your photos...</p>
            </div>
          ) : jobs.length > 0 && jobs[0].staged_urls.length > 0 ? (
            <>
              {/* Result Image */}
              <div className="space-y-4">
                <div className="rounded-lg overflow-hidden border border-border">
                  <img
                    src={jobs[0].staged_urls[0]}
                    alt="Staged result"
                    className="w-full h-auto"
                  />
                </div>

                {/* Before/After Slider Info */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                  💡 This is how your room looks with {DESIGN_STYLES.find((s) => s.value === designStyle)?.label} styling.
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button onClick={handleDownload} variant="default" size="lg" className="flex-1">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
                <Button onClick={handleTryDifferentStyle} variant="outline" size="lg" className="flex-1">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Try Another Style
                </Button>
              </div>

              {/* Recommendation */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <div className="font-medium text-green-900">💡 Next styles to try:</div>
                <div className="flex flex-wrap gap-2">
                  {getRecommendedStyles()
                    .filter((s) => s !== designStyle)
                    .slice(0, 2)
                    .map((styleVal) => {
                      const style = DESIGN_STYLES.find((s) => s.value === styleVal);
                      return (
                        <button
                          key={styleVal}
                          onClick={() => {
                            setDesignStyle(styleVal);
                            setStep(3);
                          }}
                          className="text-sm bg-white hover:bg-green-100 border border-green-300 rounded px-3 py-1 transition-colors"
                        >
                          {style?.label}
                        </button>
                      );
                    })}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-4">
              <p className="text-muted-foreground">Something went wrong. Please try again.</p>
              <Button onClick={() => setStep(3)} variant="outline">
                Go Back
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
