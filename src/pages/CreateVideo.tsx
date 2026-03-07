import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Check, Download, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction, EdgeFunctionError } from "@/lib/invokeEdgeFunction";
import { callVideoStatus } from "@/lib/callVideoStatus";
import {
  PropertyDetails,
  CustomizationSettings,
} from "@/components/create-video";
import { uploadImagesToStorage } from "@/utils/uploadToStorage";
import { uploadVideoToStorage } from "@/utils/uploadVideoToStorage";
import { generateCanvasVideo } from "@/utils/generateCanvasVideo";
import { getMusicId } from "@/config/musicMapping";
import { getVoiceId } from "@/config/voiceMapping";
import { cropImageToFile } from "@/utils/cropImage";
import { type CameraAction, type ImageMetadata } from "@/components/create-video/PhotoUpload";
import { StepUpload } from "@/components/create-video/StepUpload";
import { StepSelect } from "@/components/create-video/StepSelect";
import { StepEdit, type CropData } from "@/components/create-video/StepEdit";
import { StepBranding } from "@/components/create-video/StepBranding";

// ─── Step definitions ───────────────────────────────────
const STEPS = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Select" },
  { id: 3, label: "Edit" },
  { id: 4, label: "Branding" },
] as const;

export default function CreateVideo() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  // ─── Wizard state ──────────────────────────────────
  const [step, setStep] = useState(1);

  // ─── Form state ────────────────────────────────────
  const [propertyDetails, setPropertyDetails] = useState<PropertyDetails>({
    streetAddress: "",
    suburb: "",
    state: "",
    price: "",
    bedrooms: 4,
    bathrooms: 3,
    carSpaces: 2,
    landSize: "",
    features: [],
  });

  const [photos, setPhotos] = useState<File[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [cameraActions, setCameraActions] = useState<Record<number, CameraAction>>({});
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [cropData, setCropData] = useState<Record<number, CropData>>({});
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata[]>([]);
  const [script, setScript] = useState("");

  const [customization, setCustomization] = useState<CustomizationSettings>({
    includeVoiceover: true,
    voiceType: "Australian Male",
    musicStyle: "Cinematic & Epic",
    musicTrack: "Horizon - Epic Journey",
    selectedTemplate: "open-house",
    selectedLayout: "open-house",
    customTitle: "",
    useGlobalSeed: false,
    globalSeed: Math.floor(Math.random() * 999999) + 1,
    agentInfo: { photo: null, name: "", phone: "", email: "" },
  });

  // ─── Generation state ──────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationIds, setGenerationIds] = useState<string[] | null>(null);
  const [videoRecordId, setVideoRecordId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [stitchJobId, setStitchJobId] = useState<string | null>(null);
  const [generationData, setGenerationData] = useState<{
    generationIds: string[];
    totalClips: number;
    estimatedTime: number;
    audioUrl: string | null;
    musicUrl: string | null;
    agentInfo: CustomizationSettings["agentInfo"];
    propertyData: Record<string, unknown>;
    style: string;
    layout: string;
    customTitle: string;
  } | null>(null);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [isDownloadingLandscape, setIsDownloadingLandscape] = useState(false);

  const pollCancelledRef = useRef(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      pollCancelledRef.current = true;
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  // Sync imageMetadata when selection or camera actions change
  useEffect(() => {
    const meta: ImageMetadata[] = selectedIndices.map((idx) => ({
      file: photos[idx],
      cameraAction: cameraActions[idx] || "push-in",
      cameraAngle: "auto" as const,
      duration: 3.5,
      isLandscape: true,
    }));
    setImageMetadata(meta);
  }, [selectedIndices, cameraActions, photos]);

  // ─── Preview URL for first selected image ──────────
  const previewImageUrl =
    selectedIndices.length > 0 && photos[selectedIndices[0]]
      ? URL.createObjectURL(photos[selectedIndices[0]])
      : undefined;

  // ─── Step navigation ───────────────────────────────
  const canGoNext = (): boolean => {
    switch (step) {
      case 1:
        return photos.length >= 3;
      case 2:
        return selectedIndices.length >= 3;
      case 3:
        return selectedIndices.length >= 3;
      case 4:
        return (
          !!customization.agentInfo.name.trim() &&
          !!customization.agentInfo.phone.trim()
        );
      default:
        return true;
    }
  };

  const goNext = () => {
    if (step < 4 && canGoNext()) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 1) setStep(step - 1);
  };

  // ─── Business logic (preserved from original) ─────

  const handleReset = () => {
    pollCancelledRef.current = true;
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    setIsGenerating(false);
    setGeneratingProgress(0);
    setVideoReady(false);
    setError(null);
    setGenerationIds(null);
    setVideoRecordId(null);
    setVideoUrl(null);
    setVideoUrls([]);
    setStitchJobId(null);
    setGenerationData(null);
    setUploadedImageUrls([]);
  };

  const handleDownloadLandscape = async () => {
    if (!uploadedImageUrls.length || !generationData) return;
    setIsDownloadingLandscape(true);
    try {
      toast({ title: "Rendering landscape version...", description: "Generating 16:9 video — this takes about a minute." });
      const landscapeFolder = `landscape-${Date.now()}`;
      const landscapeClipUrls: string[] = [];
      for (let i = 0; i < uploadedImageUrls.length; i++) {
        const meta = imageMetadata[i];
        const blob = await generateCanvasVideo(uploadedImageUrls[i], meta?.cameraAngle || "auto", meta?.duration || 3.5, 30, "landscape");
        const clipUrl = await uploadVideoToStorage(blob, landscapeFolder, `clip-${i + 1}`);
        landscapeClipUrls.push(clipUrl);
      }
      const clipDurations = imageMetadata.map((m) => m?.duration || 3.5);
      const stitchData = await invokeEdgeFunction<{ jobId: string }>("stitch-video", {
        body: {
          videoUrls: landscapeClipUrls,
          clipDurations,
          audioUrl: generationData.audioUrl,
          musicUrl: generationData.musicUrl,
          agentInfo: generationData.agentInfo,
          propertyData: generationData.propertyData,
          style: generationData.style,
          layout: generationData.layout,
          customTitle: generationData.customTitle,
          outputFormat: "landscape",
        },
      });
      const landscapeJobId = stitchData.jobId;
      let landscapeVideoUrl: string | null = null;
      for (let attempt = 0; attempt < 60 && !landscapeVideoUrl; attempt++) {
        await new Promise((r) => setTimeout(r, 5000));
        const statusData = await callVideoStatus<{ status: string; videoUrl?: string }>({
          generationIds: [],
          videoId: null,
          stitchJobId: landscapeJobId,
          clipDurations,
          audioUrl: null,
          musicUrl: null,
          agentInfo: null,
          propertyData: generationData.propertyData,
          style: generationData.style,
        });
        if (statusData?.status === "done" && statusData?.videoUrl) landscapeVideoUrl = statusData.videoUrl;
        else if (statusData?.status === "failed") throw new Error("Landscape render failed");
      }
      if (!landscapeVideoUrl) throw new Error("Landscape render timed out");
      window.open(landscapeVideoUrl, "_blank");
      toast({ title: "Landscape video ready!" });
    } catch (err) {
      toast({ title: "Landscape render failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    } finally {
      setIsDownloadingLandscape(false);
    }
  };

  const pollVideoStatus = async (
    generationIds: string[],
    videoId: string | null,
    audioUrl: string | null,
    musicUrl: string | null,
    agentInfo: CustomizationSettings["agentInfo"],
    propertyData: { address: string; price: string; beds: number; baths: number; description: string },
    style: string,
    layout: string,
    customTitle: string,
    clipDurations: number[],
    initialStitchJobId?: string | null,
    provider?: string,
    imageUrls?: string[],
    outputFormat?: "portrait" | "landscape",
    cameraAngles?: string[]
  ) => {
    const maxAttempts = 120;
    let attempts = 0;
    let consecutiveErrors = 0;
    let currentStitchJobId: string | null = initialStitchJobId || null;
    pollCancelledRef.current = false;

    const poll = async (): Promise<void> => {
      if (pollCancelledRef.current) return;
      if (attempts >= maxAttempts) {
        setError("Video generation timed out after 10 minutes. Please try again.");
        setIsGenerating(false);
        return;
      }
      attempts++;
      try {
        if (!currentStitchJobId && (!generationIds || generationIds.length === 0)) {
          setError("Video generation failed to start. Please try again.");
          setIsGenerating(false);
          return;
        }
        let data: Record<string, unknown>;
        try {
          data = await callVideoStatus({
            generationIds,
            videoId,
            audioUrl,
            musicUrl,
            agentInfo,
            propertyData,
            style,
            layout,
            customTitle,
            stitchJobId: currentStitchJobId,
            clipDurations,
            provider: provider || "runway",
            imageUrls,
            outputFormat: outputFormat || "portrait",
            cameraAngles,
          });
        } catch (invokeErr) {
          const isAuth = invokeErr instanceof EdgeFunctionError && invokeErr.isAuthError;
          consecutiveErrors++;
          if (isAuth && consecutiveErrors >= 3) {
            setError("Authentication failed. Please sign in again.");
            setIsGenerating(false);
            return;
          }
          if (consecutiveErrors >= 10) {
            setError("Service unavailable. Check your dashboard later.");
            setIsGenerating(false);
            return;
          }
          pollTimeoutRef.current = setTimeout(poll, 5000);
          return;
        }
        consecutiveErrors = 0;
        if (data.status === "done" && data.videoUrl) {
          setVideoUrl(data.videoUrl as string);
          setVideoUrls((data.videoUrls as string[]) || [data.videoUrl as string]);
          setGeneratingProgress(100);
          setIsGenerating(false);
          setVideoReady(true);
          toast({ title: "Video Ready!", description: "Your property video has been generated!" });
        } else if (data.status === "stitching") {
          if (data.stitchJobId && !currentStitchJobId) {
            currentStitchJobId = data.stitchJobId as string;
            setStitchJobId(data.stitchJobId as string);
          }
          setGeneratingProgress((data.progress as number) || 90);
          pollTimeoutRef.current = setTimeout(poll, 5000);
        } else if (data.status === "failed") {
          setError((data.message as string) || "Video generation failed.");
          setIsGenerating(false);
        } else {
          if (data.progress) setGeneratingProgress(data.progress as number);
          else setGeneratingProgress((prev) => Math.min(prev + 2, 95));
          pollTimeoutRef.current = setTimeout(poll, 5000);
        }
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors >= 10) {
          setError("Service unavailable. Check your dashboard later.");
          setIsGenerating(false);
          return;
        }
        pollTimeoutRef.current = setTimeout(poll, 5000);
      }
    };
    await poll();
  };

  const handleGenerate = async () => {
    const selectedPhotos = selectedIndices.map((i) => photos[i]);
    const imageCount = selectedPhotos.length;

    if (imageCount < 3) {
      setError(`Need at least 3 photos (you have ${imageCount})`);
      return;
    }
    if (imageCount > 10) {
      setError(`Maximum 10 photos (you have ${imageCount})`);
      return;
    }
    if (!customization.agentInfo.name.trim()) {
      setError("Please fill in your agent name");
      return;
    }
    if (!customization.agentInfo.phone.trim()) {
      setError("Please fill in your agent phone number");
      return;
    }

    // Check subscription
    if (user?.id) {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("subscription_status, free_video_used, videos_used_this_period, videos_limit")
        .eq("id", user.id)
        .single();
      if (!userError && userData) {
        const hasActive = userData.subscription_status === "active";
        if (!hasActive && userData.free_video_used) {
          setError("Subscribe to generate more videos!");
          return;
        }
        if (hasActive && userData.videos_used_this_period >= userData.videos_limit) {
          setError("Video limit reached. Upgrade or wait for next period.");
          return;
        }
      }
    }

    setError(null);
    setIsGenerating(true);
    setGeneratingProgress(0);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession();
      if (sessionError || !sessionData.session) {
        setIsGenerating(false);
        setError("Session expired. Please sign in again.");
        return;
      }

      // Crop images that have crop data applied, then upload
      const targetAspect = orientation === "portrait" ? 9 / 16 : 16 / 9;
      const photosToUpload: File[] = [];
      for (let i = 0; i < selectedPhotos.length; i++) {
        const photoIdx = selectedIndices[i];
        const crop = cropData[photoIdx];
        if (crop && (crop.x !== 0.5 || crop.y !== 0.5)) {
          photosToUpload.push(
            await cropImageToFile(selectedPhotos[i], crop.x, crop.y, targetAspect)
          );
        } else {
          photosToUpload.push(selectedPhotos[i]);
        }
      }

      const folder = `property-${Date.now()}`;
      const imageUrls = await uploadImagesToStorage(
        photosToUpload,
        folder,
        (completed, total) => setGeneratingProgress((completed / total) * 30)
      );
      setGeneratingProgress(30);
      setUploadedImageUrls(imageUrls);

      // Generate script if empty
      let videoScript = script;
      if (!videoScript) {
        const { streetAddress, suburb, bedrooms, bathrooms, landSize, features } = propertyDetails;
        if (streetAddress) {
          const featureText = features.length > 0 ? `, featuring ${features.slice(0, 3).join(", ")}` : "";
          videoScript = `Welcome to ${streetAddress} in ${suburb || "a prime location"}.\n\nThis exceptional ${bedrooms}-bedroom, ${bathrooms}-bathroom home offers ${landSize || "generous"} square meters of living space${featureText}.\n\nPerfect for families seeking modern luxury living.\n\nContact us today for a private inspection.`;
        } else {
          videoScript = "This is a beautiful property with great features";
        }
      }

      setGeneratingProgress(45);

      const propertyDataPayload = {
        address: `${propertyDetails.streetAddress}, ${propertyDetails.suburb}, ${propertyDetails.state}`,
        streetAddress: propertyDetails.streetAddress,
        suburb: propertyDetails.suburb,
        state: propertyDetails.state,
        price: propertyDetails.price,
        beds: propertyDetails.bedrooms,
        baths: propertyDetails.bathrooms,
        carSpaces: propertyDetails.carSpaces,
        landSize: propertyDetails.landSize,
        features: propertyDetails.features,
        description: videoScript,
      };

      const musicId = getMusicId(customization.musicTrack);
      const voiceId = customization.includeVoiceover ? getVoiceId(customization.voiceType) : null;

      const imageMetadataPayload = imageUrls.map((url, index) => {
        const meta = imageMetadata[index];
        const payload: Record<string, unknown> = {
          url,
          cameraAction: meta?.cameraAction || "push-in",
          cameraAngle: meta?.cameraAngle || "auto",
          duration: meta?.duration || 3.5,
          isLandscape: meta?.isLandscape ?? true,
        };
        if (customization.useGlobalSeed && customization.globalSeed) {
          payload.seed = customization.globalSeed;
        }
        return payload;
      });

      const data = await invokeEdgeFunction<{
        success: boolean;
        error?: string;
        videoId?: string;
        generationIds?: string[];
        totalClips?: number;
        estimatedTime?: number;
        audioUrl?: string | null;
        musicUrl?: string | null;
        agentInfo?: CustomizationSettings["agentInfo"];
        propertyData?: Record<string, unknown>;
        style?: string;
        provider?: string;
        stitchJobId?: string;
        imageUrls?: string[];
        cameraAngles?: string[];
      }>("generate-video", {
        body: {
          imageUrls,
          imageMetadata: imageMetadataPayload,
          useKenBurns: false,
          propertyData: propertyDataPayload,
          style: customization.selectedTemplate,
          layout: customization.selectedLayout,
          customTitle: customization.customTitle,
          voice: voiceId,
          music: musicId,
          userId: user?.id,
          script: videoScript,
          source: "upload",
          agentInfo: {
            name: customization.agentInfo.name,
            phone: customization.agentInfo.phone,
            email: customization.agentInfo.email,
            photo: customization.agentInfo.photo,
          },
        },
      });

      if (data.success) {
        if (data.videoId) setVideoRecordId(data.videoId);
        setGenerationData({
          ...data,
          layout: customization.selectedLayout,
          customTitle: customization.customTitle,
        } as typeof generationData);

        const clipDurations = imageMetadataPayload.map((m: Record<string, unknown>) => (m.duration as number) || 3.5);

        if (data.provider === "canvas" && data.stitchJobId) {
          setStitchJobId(data.stitchJobId);
          setGeneratingProgress(80);
          toast({ title: "Stitching Video", description: "Assembling your video now..." });
          pollVideoStatus([], data.videoId ?? null, data.audioUrl ?? null, data.musicUrl ?? null, data.agentInfo!, propertyDataPayload, customization.selectedTemplate, customization.selectedLayout, customization.customTitle, clipDurations, data.stitchJobId);
        } else {
          if (!data.generationIds?.length) throw new Error("No generation IDs returned.");
          setGenerationIds(data.generationIds);
          const est = Math.ceil((data.estimatedTime || 120) / 60);
          toast({ title: "Generation Started", description: `Generating ${data.totalClips} clips... ~${est}-${est + 2} min.` });
          pollVideoStatus(data.generationIds, data.videoId ?? null, data.audioUrl ?? null, data.musicUrl ?? null, data.agentInfo!, propertyDataPayload, customization.selectedTemplate, customization.selectedLayout, customization.customTitle, clipDurations, null, data.provider, data.imageUrls || imageUrls, orientation, data.cameraAngles || imageMetadataPayload.map((m: Record<string, unknown>) => (m.cameraAction as string) || "push-in"));
        }
      } else {
        throw new Error(data.error || "Video generation failed");
      }
    } catch (err) {
      console.error("Video generation error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate video");
      setIsGenerating(false);
      toast({ title: "Generation Failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  };

  // ─── Render ────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card flex items-center px-6 flex-shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to project
        </button>

        {/* Stepper */}
        <div className="flex-1 flex items-center justify-center gap-0">
          {STEPS.map((s, i) => {
            const isDone = step > s.id;
            const isCurrent = step === s.id;
            return (
              <div key={s.id} className="flex items-center">
                {i > 0 && (
                  <div
                    className={`w-12 h-0.5 ${
                      isDone ? "bg-primary" : "bg-border"
                    }`}
                  />
                )}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isCurrent
                        ? "bg-primary text-primary-foreground"
                        : isDone
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : s.id}
                  </div>
                  <span
                    className={`text-[11px] font-medium ${
                      isCurrent ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="w-24" /> {/* Spacer to balance "Back to project" */}
      </header>

      {/* Step content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8">
          {/* Step 1: Upload */}
          {step === 1 && (
            <StepUpload photos={photos} onPhotosChange={setPhotos} />
          )}

          {/* Step 2: Select */}
          {step === 2 && (
            <StepSelect
              photos={photos}
              selectedIndices={selectedIndices}
              onSelectionChange={setSelectedIndices}
            />
          )}

          {/* Step 3: Edit */}
          {step === 3 && (
            <StepEdit
              photos={photos}
              selectedIndices={selectedIndices}
              cameraActions={cameraActions}
              onCameraActionChange={(idx, action) =>
                setCameraActions((prev) => ({ ...prev, [idx]: action }))
              }
              orientation={orientation}
              onOrientationChange={setOrientation}
              cropData={cropData}
              onCropChange={(idx, crop) =>
                setCropData((prev) => ({ ...prev, [idx]: crop }))
              }
            />
          )}

          {/* Step 4: Branding (includes property details) */}
          {step === 4 && !isGenerating && !videoReady && (
            <StepBranding
              settings={customization}
              onChange={setCustomization}
              propertyDetails={propertyDetails}
              onPropertyDetailsChange={setPropertyDetails}
              previewImageUrl={previewImageUrl}
              orientation={orientation}
              onOrientationChange={setOrientation}
            />
          )}

          {/* Generating state */}
          {step === 4 && isGenerating && (
            <div className="max-w-md mx-auto text-center py-20">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
              <h2 className="text-xl font-bold text-foreground mb-2">
                Generating your video...
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                This may take a few minutes. You can leave this page and check your dashboard.
              </p>
              <div className="h-2 bg-secondary rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${generatingProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{Math.round(generatingProgress)}%</p>
              {error && (
                <p className="text-sm text-destructive mt-4">{error}</p>
              )}
            </div>
          )}

          {/* Video ready state */}
          {step === 4 && videoReady && videoUrl && (
            <div className="max-w-lg mx-auto text-center py-12">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Video ready!</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Your property video has been generated successfully.
              </p>

              {/* Video preview */}
              <div className="aspect-[9/16] max-w-[280px] mx-auto rounded-xl overflow-hidden border border-border mb-6">
                <video src={videoUrl} controls className="w-full h-full object-contain bg-black" />
              </div>

              <div className="flex items-center justify-center gap-3">
                <Button variant="hero" onClick={() => window.open(videoUrl, "_blank")}>
                  <Download className="w-4 h-4" />
                  Download Portrait
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadLandscape}
                  disabled={isDownloadingLandscape}
                >
                  {isDownloadingLandscape ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Landscape 16:9
                </Button>
              </div>
              <Button
                variant="ghost"
                className="mt-4"
                onClick={() => navigate("/dashboard")}
              >
                Back to dashboard
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Bottom bar */}
      <footer className="h-16 border-t border-border bg-card flex items-center justify-between px-6 flex-shrink-0">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={step === 1 || isGenerating}
        >
          Back
        </Button>

        {step < 4 ? (
          <Button
            variant="hero"
            onClick={goNext}
            disabled={!canGoNext()}
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : !isGenerating && !videoReady ? (
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => navigate("/dashboard")}>
              Skip
            </Button>
            <Button
              variant="hero"
              onClick={handleGenerate}
              disabled={
                !customization.agentInfo.name.trim() ||
                !customization.agentInfo.phone.trim() ||
                selectedIndices.length < 3
              }
            >
              <LayoutTemplate className="w-4 h-4" />
              Render branded video
            </Button>
          </div>
        ) : null}
      </footer>
    </div>
  );
}
