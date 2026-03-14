import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Download, RotateCcw, ImagePlus, Check, AlertCircle } from "lucide-react";
import { useStagingJobs, type StagingJob } from "@/hooks/useStagingJobs";
import { BeforeAfterSlider } from "./BeforeAfterSlider";

const ROOM_TYPES = [
  { value: "LIVINGROOM", label: "Living" },
  { value: "BEDROOM", label: "Bed" },
  { value: "KITCHEN", label: "Kitchen" },
  { value: "DININGROOM", label: "Dining" },
  { value: "OFFICE", label: "Office" },
  { value: "BATHROOM", label: "Bath" },
  { value: "BACK_PATIO", label: "Patio" },
  { value: "GARAGE", label: "Garage" },
  { value: "KIDSROOM", label: "Kids Room" },
];

const DESIGN_STYLES = [
  { value: "MODERN", label: "Modern" },
  { value: "SCANDINAVIAN", label: "Scandi" },
  { value: "LUXEMODERN", label: "Luxury" },
  { value: "FARMHOUSE", label: "Farmhouse" },
  { value: "MINIMALIST", label: "Minimal" },
  { value: "INDUSTRIAL", label: "Industrial" },
  { value: "COASTAL", label: "Coastal" },
  { value: "ARTDECO", label: "Art Deco" },
  { value: "BOHO", label: "Boho" },
  { value: "CONTEMPORARY", label: "Contemp." },
];

interface StagingFlowProps {
  imageUrls: string[];
  onComplete: (jobs: StagingJob[]) => void;
  userId: string;
}

export function StagingFlow({ imageUrls, onComplete, userId }: StagingFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [roomType, setRoomType] = useState("LIVINGROOM");
  const [designStyle, setDesignStyle] = useState("MODERN");
  const [selectedVariations, setSelectedVariations] = useState<Record<string, number>>({});
  const [fullscreenJob, setFullscreenJob] = useState<StagingJob | null>(null);

  const { jobs, isProcessing, stagePhotos, restageWithOptions, reset } = useStagingJobs();

  const handleSubmitStaging = async () => {
    setStep(3);
    await stagePhotos(imageUrls, roomType, designStyle, userId);
  };

  const handleTryDifferentStyle = async () => {
    setStep(2);
    const jobIds = jobs.map((j) => j.id);
    await restageWithOptions(jobIds, roomType, designStyle);
  };

  const handleDownloadAll = async () => {
    for (const job of jobs) {
      if (job.staged_urls.length > 0) {
        const url = job.staged_urls[selectedVariations[job.id] || 0];
        const a = document.createElement("a");
        a.href = url;
        a.download = `propertymotion-staged-${designStyle.toLowerCase()}-${job.id.slice(0, 8)}.jpg`;
        a.click();
      }
    }
  };

  const getSelectedVariationIndex = (jobId: string) => selectedVariations[jobId] || 0;

  return (
    <div className="space-y-8">
      {/* Step Indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {[1, 2, 3].map((stepNum) => (
            <div key={stepNum} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                  step >= stepNum
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step > stepNum ? <Check className="w-5 h-5" /> : stepNum}
              </div>
              <span className="text-sm font-medium">
                {stepNum === 1 ? "Upload" : stepNum === 2 ? "Configure" : "Results"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1 — Preview */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Photos Ready for Staging</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {imageUrls.length} photo{imageUrls.length > 1 ? "s" : ""} selected. Next, choose a room type and design style.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {imageUrls.map((url, i) => (
              <div key={i} className="aspect-square rounded-lg overflow-hidden bg-muted">
                <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>

          <Button onClick={() => setStep(2)} className="w-full">
            Next: Choose Style
          </Button>
        </div>
      )}

      {/* STEP 2 — Configure Staging */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Choose Your Staging Style</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pick a room type and design style. We'll virtually stage your photos to show potential.
            </p>
          </div>

          {/* Room Type */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Room Type</label>
            <div className="grid grid-cols-3 gap-2">
              {ROOM_TYPES.map((room) => (
                <button
                  key={room.value}
                  onClick={() => setRoomType(room.value)}
                  className={`px-3 py-2 rounded-lg border-2 transition-all text-xs font-medium ${
                    roomType === room.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {room.label}
                </button>
              ))}
            </div>
          </div>

          {/* Design Style */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Design Style</label>
            <div className="grid grid-cols-5 gap-2">
              {DESIGN_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => setDesignStyle(style.value)}
                  className={`px-3 py-2 rounded-lg border-2 transition-all text-xs font-medium ${
                    designStyle === style.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview Card */}
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Preview</p>
            <p className="text-xs text-muted-foreground mb-3">
              Room: <strong>{ROOM_TYPES.find((r) => r.value === roomType)?.label}</strong> | Style:{" "}
              <strong>{DESIGN_STYLES.find((s) => s.value === designStyle)?.label}</strong>
            </p>
            <p className="text-xs text-muted-foreground">Processing takes ~30 seconds per photo</p>
          </div>

          <Button onClick={handleSubmitStaging} className="w-full" disabled={isProcessing}>
            {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Submit for Virtual Staging
          </Button>
        </div>
      )}

      {/* STEP 3 — Results */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Staging Complete</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {jobs.filter((j) => j.status === "complete").length} of {jobs.length} photos staged
            </p>
          </div>

          {/* Results Grid */}
          {jobs.length > 0 && (
            <div className="space-y-6">
              {jobs.map((job) => (
                <div key={job.id} className="border rounded-lg p-4">
                  {job.status === "complete" && job.staged_urls.length > 0 ? (
                    <div className="space-y-3">
                      {/* Before/After Slider */}
                      <BeforeAfterSlider
                        beforeUrl={job.original_url}
                        afterUrl={job.staged_urls[getSelectedVariationIndex(job.id)]}
                      />

                      {/* Variation Thumbnails */}
                      {job.staged_urls.length > 1 && (
                        <div className="flex gap-2">
                          {job.staged_urls.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setSelectedVariations((prev) => ({ ...prev, [job.id]: i }))}
                              className={`w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${
                                getSelectedVariationIndex(job.id) === i
                                  ? "border-primary"
                                  : "border-border hover:border-primary/30"
                              }`}
                            >
                              <img src={url} alt={`Variation ${i + 1}`} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Fullscreen Comparison */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setFullscreenJob(job)}
                        className="w-full"
                      >
                        Fullscreen Comparison
                      </Button>
                    </div>
                  ) : job.status === "failed" ? (
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertCircle className="w-5 h-5" />
                      <p className="text-sm">Failed: {job.error_message}</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <p className="text-sm">Processing...</p>
                    </div>
                  )}
                </div>
              ))}

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Try Different Style
                </Button>
                <Button variant="outline" onClick={() => { reset(); setStep(1); }}>
                  <ImagePlus className="w-4 h-4 mr-2" />
                  Stage Another Room
                </Button>
                <Button onClick={handleDownloadAll}>
                  <Download className="w-4 h-4 mr-2" />
                  Download All
                </Button>
              </div>

              {/* Decor8 Attribution */}
              <p className="text-xs text-muted-foreground">
                Images generated by <strong>Decor8 AI</strong> virtual staging
              </p>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen Comparison Dialog */}
      <Dialog open={!!fullscreenJob} onOpenChange={() => setFullscreenJob(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Before / After Comparison</DialogTitle>
          </DialogHeader>
          {fullscreenJob && fullscreenJob.staged_urls.length > 0 && (
            <div className="space-y-4">
              <BeforeAfterSlider
                beforeUrl={fullscreenJob.original_url}
                afterUrl={fullscreenJob.staged_urls[getSelectedVariationIndex(fullscreenJob.id)]}
                large
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
