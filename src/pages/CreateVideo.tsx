import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  LeftSidebar,
  PropertyDetailsForm,
  PropertySourceSelector,
  CustomizationSection,
  RightPanel,
  PropertyDetails,
  CustomizationSettings,
} from "@/components/create-video";
import { ScriptGeneratorSection } from "@/components/create-video/ScriptGeneratorSection";
import { uploadImagesToStorage } from "@/utils/uploadToStorage";
import { uploadVideoToStorage } from "@/utils/uploadVideoToStorage";
import { generateCanvasVideo } from "@/utils/generateCanvasVideo";
import { getMusicId } from "@/config/musicMapping";
import { getVoiceId } from "@/config/voiceMapping";
import { ImageMetadata } from "@/components/create-video/PhotoUpload";

export default function CreateVideo() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form state
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
  const [imageMetadata, setImageMetadata] = useState<ImageMetadata[]>([]);
  const [scrapedImageUrls, setScrapedImageUrls] = useState<string[]>([]);
  const [script, setScript] = useState("");

  const [customization, setCustomization] = useState<CustomizationSettings>({
    includeVoiceover: true,
    voiceType: "Australian Male",
    musicStyle: "Cinematic & Epic",
    musicTrack: "Horizon - Epic Journey",
    selectedTemplate: "modern-luxe",
    selectedLayout: "modern-luxe",
    customTitle: "",
    agentInfo: {
      photo: null,
      name: "",
      phone: "",
      email: "",
    },
  });

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generationIds, setGenerationIds] = useState<string[] | null>(null);
  const [videoRecordId, setVideoRecordId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<string[]>([]); // All individual clips
  const [stitchJobId, setStitchJobId] = useState<string | null>(null); // Shotstack stitching job
  const [generationData, setGenerationData] = useState<{
    generationIds: string[];
    totalClips: number;
    estimatedTime: number;
    audioUrl: string | null;
    musicUrl: string | null;
    agentInfo: CustomizationSettings['agentInfo'];
    propertyData: Record<string, unknown>;
    style: string;
    layout: string;
    customTitle: string;
  } | null>(null);
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]); // source image URLs for landscape re-render
  const [isDownloadingLandscape, setIsDownloadingLandscape] = useState(false);
  const [refreshSidebarTrigger, setRefreshSidebarTrigger] = useState(0);

  // Reset video generation state to create another video
  const handleReset = () => {
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

  // On-demand landscape (16:9) re-render for download.
  // Re-generates canvas clips at 1280×720, submits a new Shotstack job, polls, then downloads.
  const handleDownloadLandscape = async () => {
    if (!uploadedImageUrls.length || !generationData) return;

    setIsDownloadingLandscape(true);
    try {
      toast({ title: "Rendering landscape version...", description: "Generating 16:9 video — this takes about a minute." });

      // Step 1: Re-generate canvas clips at 1280×720 (landscape)
      const landscapeFolder = `landscape-${Date.now()}`;
      const landscapeClipUrls: string[] = [];

      for (let i = 0; i < uploadedImageUrls.length; i++) {
        const meta = imageMetadata[i];
        const blob = await generateCanvasVideo(
          uploadedImageUrls[i],
          meta?.cameraAngle || "auto",
          meta?.duration || 3.5,
          30,
          "landscape"
        );
        const clipUrl = await uploadVideoToStorage(blob, landscapeFolder, `clip-${i + 1}`);
        landscapeClipUrls.push(clipUrl);
      }

      // Step 2: Submit a landscape Shotstack stitch job
      const clipDurations = imageMetadata.map(m => m?.duration || 3.5);
      const { data: stitchData, error: stitchError } = await supabase.functions.invoke("stitch-video", {
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

      if (stitchError) throw new Error(stitchError.message || "Landscape stitch failed");

      const landscapeJobId = stitchData.jobId;

      // Step 3: Poll for completion (video-status skips DB update when videoId is null)
      let landscapeVideoUrl: string | null = null;
      for (let attempt = 0; attempt < 60 && !landscapeVideoUrl; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const { data: statusData } = await supabase.functions.invoke("video-status", {
          body: {
            generationIds: [],
            videoId: null,
            stitchJobId: landscapeJobId,
            clipDurations,
            audioUrl: null,
            musicUrl: null,
            agentInfo: null,
            propertyData: generationData.propertyData,
            style: generationData.style,
          },
        });
        if (statusData?.status === "done" && statusData?.videoUrl) {
          landscapeVideoUrl = statusData.videoUrl;
        } else if (statusData?.status === "failed") {
          throw new Error("Landscape render failed on Shotstack");
        }
      }

      if (!landscapeVideoUrl) throw new Error("Landscape render timed out");

      window.open(landscapeVideoUrl, "_blank");
      toast({ title: "Landscape video ready!", description: "Your 16:9 video is downloading." });
    } catch (err) {
      toast({
        title: "Landscape render failed",
        description: err instanceof Error ? err.message : "Could not render landscape video.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingLandscape(false);
    }
  };

  // Poll for video status
  const pollVideoStatus = async (
    generationIds: string[],
    videoId: string | null,
    audioUrl: string | null,
    musicUrl: string | null,
    agentInfo: CustomizationSettings['agentInfo'],
    propertyData: {
      address: string;
      price: string;
      beds: number;
      baths: number;
      description: string;
    },
    style: string,
    layout: string,
    customTitle: string,
    clipDurations: number[],
    initialStitchJobId?: string | null
  ) => {
    const maxAttempts = 120; // 10 minutes max (120 * 5 seconds)
    let attempts = 0;
    let consecutiveErrors = 0;
    // For canvas flow, start with the stitchJobId returned by generate-video
    let currentStitchJobId: string | null = initialStitchJobId || null;

    const poll = async (): Promise<void> => {
      if (attempts >= maxAttempts) {
        setError("Video generation timed out after 10 minutes. Please try again.");
        setIsGenerating(false);
        return;
      }

      attempts++;

      try {
        // Safety check
        if (!generationIds || generationIds.length === 0) {
          console.error("No generation IDs to poll");
          setError("Video generation failed to start. Please try again.");
          setIsGenerating(false);
          return;
        }

        console.log(`Polling attempt ${attempts}/${maxAttempts} for ${generationIds.length} Luma clips`);

        const { data, error: fnError } = await supabase.functions.invoke("video-status", {
          body: {
            generationIds,
            videoId,
            audioUrl,
            musicUrl,
            agentInfo,
            propertyData,
            style: style,
            layout: layout,
            customTitle: customTitle,
            stitchJobId: currentStitchJobId,
            clipDurations: clipDurations,
          },
        });

        if (fnError) {
          console.error("Status check error:", fnError);
          consecutiveErrors++;

          // After 5 consecutive errors, show a warning but keep trying
          if (consecutiveErrors >= 5) {
            console.warn("Multiple consecutive errors - edge function may be unavailable");
          }

          // Keep polling even on errors
          setTimeout(poll, 5000);
          return;
        }

        // Reset error counter on successful response
        consecutiveErrors = 0;
        console.log("Video status response:", data);

        if (data.status === "done" && data.videoUrl) {
          setVideoUrl(data.videoUrl);
          setVideoUrls(data.videoUrls || [data.videoUrl]); // Capture all clips
          setGeneratingProgress(100);
          setIsGenerating(false);
          setVideoReady(true);
          setRefreshSidebarTrigger(prev => prev + 1); // Refresh recent videos list
          toast({
            title: "Video Ready!",
            description: "Your property video has been generated successfully!",
          });
        } else if (data.status === "stitching") {
          // Luma clips complete, now stitching with Shotstack
          if (data.stitchJobId && !currentStitchJobId) {
            currentStitchJobId = data.stitchJobId;
            setStitchJobId(data.stitchJobId); // Also update state for UI
            console.log("Stitching started with Shotstack:", data.stitchJobId);
          }
          setGeneratingProgress(data.progress || 90);
          setTimeout(poll, 5000);
        } else if (data.status === "failed") {
          setError(data.message || "Video generation failed. Please try again.");
          setIsGenerating(false);
        } else {
          // Still processing - update progress
          const newProgress = data.progress || Math.min(generatingProgress + 2, 95);
          setGeneratingProgress(newProgress);
          setTimeout(poll, 5000);
        }
      } catch (err) {
        console.error("Poll exception:", err);
        consecutiveErrors++;
        setTimeout(poll, 5000);
      }
    };

    await poll();
  };

  const handleNewVideo = () => {
    setPropertyDetails({
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
    setPhotos([]);
    setScrapedImageUrls([]);
    setScript("");
    setVideoReady(false);
    setError(null);
    setVideoUrl(null);
    setVideoUrls([]);
    setStitchJobId(null);
    setGenerationIds(null);
    setVideoRecordId(null);
    setGenerationData(null);
  };

  const handleGenerate = async () => {
    // Check if we have either uploaded photos or scraped images (3-10 for Luma AI)
    const imageCount = scrapedImageUrls.length > 0 ? scrapedImageUrls.length : photos.length;

    if (imageCount < 3) {
      setError(`Need at least 3 photos (you have ${imageCount})`);
      return;
    }

    if (imageCount > 10) {
      setError(`Maximum 10 photos allowed for 15-50 second video (you have ${imageCount})`);
      return;
    }

    // Validate agent info (required for video outro)
    if (!customization.agentInfo.name.trim()) {
      setError("Please fill in your agent name");
      toast({
        title: "Agent info required",
        description: "Your name is required for the video outro",
        variant: "destructive",
      });
      return;
    }

    if (!customization.agentInfo.phone.trim()) {
      setError("Please fill in your agent phone number");
      toast({
        title: "Agent info required",
        description: "Your phone number is required for the video outro",
        variant: "destructive",
      });
      return;
    }

    // Check subscription status and free trial
    if (user?.id) {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("subscription_status, free_video_used, videos_used_this_period, videos_limit")
        .eq("id", user.id)
        .single();

      if (userError) {
        console.error("Error checking user status:", userError);
        // Continue anyway - don't block on this check
      } else if (userData) {
        const hasActiveSubscription = userData.subscription_status === "active";
        const hasFreeTrial = !userData.free_video_used;

        // If no active subscription and free trial already used, show error
        if (!hasActiveSubscription && !hasFreeTrial) {
          setError("You've used your free video. Subscribe to generate more videos!");
          toast({
            title: "Subscription Required",
            description: "Subscribe to continue creating videos",
            variant: "destructive",
          });
          return;
        }

        // If has active subscription, check video limit
        if (hasActiveSubscription) {
          if (userData.videos_used_this_period >= userData.videos_limit) {
            setError(`Video limit reached (${userData.videos_limit}/${userData.videos_limit}). Upgrade your plan or wait for next billing period.`);
            toast({
              title: "Limit Reached",
              description: "You've reached your monthly video limit",
              variant: "destructive",
            });
            return;
          }
        }
      }
    }

    setError(null);
    setIsGenerating(true);
    setGeneratingProgress(0);
    setGenerationIds(null);

    try {
      let imageUrls: string[];

      // Step 1: Get image URLs (either from scraping or upload)
      if (scrapedImageUrls.length > 0) {
        // Use scraped image URLs directly (already in Supabase storage)
        console.log("Using scraped images:", scrapedImageUrls.length, "files");
        imageUrls = scrapedImageUrls;
        setGeneratingProgress(30);
      } else {
        // Upload photos to Supabase Storage
        console.log("Uploading images to storage...");
        const folder = `property-${Date.now()}`;

        imageUrls = await uploadImagesToStorage(
          photos,
          folder,
          (completed, total) => {
            // Update progress during upload phase (0-30%)
            setGeneratingProgress((completed / total) * 30);
          }
        );

        console.log("Images uploaded:", imageUrls.length, "files");
        setGeneratingProgress(30);
      }

      // Store image URLs so landscape re-render can reuse them without re-uploading
      setUploadedImageUrls(imageUrls);

      // Step 2: Generate script if empty (use same logic as RightPanel)
      let videoScript = script;

      if (!videoScript) {
        // Use the same script generation logic as RightPanel
        const { streetAddress, suburb, bedrooms, bathrooms, landSize, features } = propertyDetails;

        if (streetAddress) {
          const featureText = features.length > 0 ? `, featuring ${features.slice(0, 3).join(", ")}` : "";

          videoScript = `Welcome to ${streetAddress} in ${suburb || "a prime location"}.

This exceptional ${bedrooms}-bedroom, ${bathrooms}-bathroom home offers ${landSize || "generous"} square meters of living space${featureText}.

Perfect for families seeking modern luxury living with every convenience at your doorstep.

Contact us today for a private inspection.`;
        } else {
          videoScript = "This is a beautiful property with great features";
        }
      }

      // Step 3: Generate canvas video clips client-side (mathematical transforms, zero AI)
      console.log("Generating canvas video clips client-side...");
      setGeneratingProgress(32);

      const canvasFolder = `canvas-${Date.now()}`;
      const canvasVideoUrls: string[] = [];

      for (let i = 0; i < imageUrls.length; i++) {
        const meta = imageMetadata[i];
        const url = imageUrls[i];
        const cameraAngle = meta?.cameraAngle || "auto";
        const duration = meta?.duration || 5;

        console.log(`Generating clip ${i + 1}/${imageUrls.length}: ${cameraAngle} @ ${duration}s`);

        const blob = await generateCanvasVideo(url, cameraAngle, duration);
        const videoUrl = await uploadVideoToStorage(blob, canvasFolder, `clip-${i + 1}`);
        canvasVideoUrls.push(videoUrl);

        setGeneratingProgress(32 + Math.round(((i + 1) / imageUrls.length) * 38)); // 32–70%
      }

      console.log("Canvas clips generated and uploaded:", canvasVideoUrls.length);
      setGeneratingProgress(70);

      // Step 4: Call generate-video with pre-generated clips (skips Luma, goes straight to Shotstack)
      console.log("Calling generate-video API (canvas flow)...");

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

      // Convert frontend music track name to backend ID
      const musicId = getMusicId(customization.musicTrack);

      // Convert frontend voice name to backend ID (only if voiceover is enabled)
      const voiceId = customization.includeVoiceover ? getVoiceId(customization.voiceType) : null;

      // Prepare image metadata with camera angles and durations
      const imageMetadataPayload = imageUrls.map((url, index) => {
        const metadata = imageMetadata[index];
        return {
          url,
          cameraAngle: metadata?.cameraAngle || "auto",
          duration: metadata?.duration || 3.5,
        };
      });

      const { data, error: fnError} = await supabase.functions.invoke("generate-video", {
        body: {
          imageUrls: imageUrls,
          imageMetadata: imageMetadataPayload,
          preGeneratedVideoUrls: canvasVideoUrls,
          propertyData: propertyDataPayload,
          style: customization.selectedTemplate,
          layout: customization.selectedLayout,
          customTitle: customization.customTitle,
          voice: voiceId,
          music: musicId,
          userId: user?.id,
          script: videoScript,
          source: scrapedImageUrls.length > 0 ? "scrape" : "upload",
          agentInfo: {
            name: customization.agentInfo.name,
            phone: customization.agentInfo.phone,
            email: customization.agentInfo.email,
            photo: customization.agentInfo.photo,
          },
        },
      });

      if (fnError) {
        throw new Error(fnError.message || "Failed to generate video");
      }

      // Handle the response
      if (data.success) {
        if (data.videoId) {
          setVideoRecordId(data.videoId);
          console.log("Video record created:", data.videoId);
        }
        setGenerationData({
          ...data,
          layout: customization.selectedLayout,
          customTitle: customization.customTitle,
        });

        const clipDurations = imageMetadataPayload.map((meta: { duration: number }) => meta.duration);

        if (data.provider === "canvas" && data.stitchJobId) {
          // Canvas flow: clips are already generated, Shotstack stitching has started
          console.log("Canvas flow: stitching started immediately, job:", data.stitchJobId);
          setStitchJobId(data.stitchJobId);
          setGeneratingProgress(80);
          toast({
            title: "Stitching Video",
            description: `Canvas clips ready! Assembling your video now...`,
          });
          // Poll video-status starting directly at the stitch phase
          pollVideoStatus(
            [],
            data.videoId,
            data.audioUrl,
            data.musicUrl,
            data.agentInfo,
            propertyDataPayload,
            customization.selectedTemplate,
            customization.selectedLayout,
            customization.customTitle,
            clipDurations,
            data.stitchJobId
          );
        } else {
          // Luma flow: poll generationIds until Luma finishes
          if (!data.generationIds || data.generationIds.length === 0) {
            throw new Error("No generation IDs returned from server. Check edge function logs.");
          }
          setGenerationIds(data.generationIds);
          console.log(`Started ${data.totalClips} Luma generations`);

          const estimatedMinutes = Math.ceil(data.estimatedTime / 60);
          toast({
            title: "Video Generation Started",
            description: `Generating ${data.totalClips} cinematic clips with Luma... this may take ${estimatedMinutes}-${estimatedMinutes + 2} minutes.`,
          });

          pollVideoStatus(
            data.generationIds,
            data.videoId,
            data.audioUrl,
            data.musicUrl,
            data.agentInfo,
            propertyDataPayload,
            customization.selectedTemplate,
            customization.selectedLayout,
            customization.customTitle,
            clipDurations
          );
        }
      } else {
        throw new Error(data.error || "Video generation failed");
      }
    } catch (err) {
      console.error("Video generation error:", err);
      setError(err instanceof Error ? err.message : "Failed to generate video");
      setIsGenerating(false);
      toast({
        title: "Generation Failed",
        description: err instanceof Error ? err.message : "Failed to generate video",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-background via-background to-secondary/20 overflow-hidden">
      {/* Premium Top Navigation */}
      <header className="h-16 border-b border-border/50 bg-card/80 backdrop-blur-xl flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-shadow">
            <Video className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground hidden sm:block tracking-tight">
            Property Motion
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-3">
          <Button 
            variant="hero" 
            size="sm" 
            onClick={handleNewVideo}
            className="shadow-lg shadow-primary/20"
          >
            New Video
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground">
            Videos
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="text-muted-foreground hover:text-foreground">
            Account
          </Button>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2.5 text-foreground hover:bg-secondary/50 rounded-lg transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-card/95 backdrop-blur-xl border-b border-border/50 p-4 space-y-2 animate-fade-in">
          <Button variant="hero" className="w-full shadow-lg" onClick={handleNewVideo}>
            New Video
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => navigate("/dashboard")}>
            Videos
          </Button>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => navigate("/settings")}>
            Account
          </Button>
        </div>
      )}

      {/* Main Content - 3 Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Hidden on mobile */}
        <div className="hidden lg:block">
          <LeftSidebar
            onNewVideo={handleNewVideo}
            selectedTemplate={customization.selectedTemplate}
            onSelectTemplate={(templateId) =>
              setCustomization((prev) => ({ ...prev, selectedTemplate: templateId }))
            }
            refreshTrigger={refreshSidebarTrigger}
          />
        </div>

        {/* Center Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 lg:p-8 space-y-6">
            {/* Page Header */}
            <div className="text-center mb-8">
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
                Create Your Video
              </h1>
              <p className="text-muted-foreground">
                Fill in the details below to generate a stunning property video
              </p>
            </div>

            {/* Property Details Card */}
            <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 p-6 shadow-card hover:shadow-card-hover transition-shadow">
              <PropertyDetailsForm
                details={propertyDetails}
                onChange={setPropertyDetails}
              />
            </div>

            {/* Property Source Card (Upload or Scrape) */}
            <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 p-6 shadow-card hover:shadow-card-hover transition-shadow">
              <PropertySourceSelector
                photos={photos}
                onPhotosChange={setPhotos}
                imageMetadata={imageMetadata}
                onMetadataChange={setImageMetadata}
                propertyDetails={propertyDetails}
                onPropertyDetailsChange={setPropertyDetails}
                onScrapedImagesChange={setScrapedImageUrls}
                userId={user?.id}
              />
            </div>

            {/* Script Generator Card */}
            <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 p-6 shadow-card hover:shadow-card-hover transition-shadow">
              <ScriptGeneratorSection
                propertyDetails={propertyDetails}
                script={script}
                onScriptChange={setScript}
              />
            </div>

            {/* Customization Card */}
            <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 p-6 shadow-card hover:shadow-card-hover transition-shadow">
              <CustomizationSection
                settings={customization}
                onChange={setCustomization}
                previewImageUrl={
                  scrapedImageUrls.length > 0
                    ? scrapedImageUrls[0]
                    : photos.length > 0
                    ? URL.createObjectURL(photos[0])
                    : undefined
                }
                propertyDetails={propertyDetails}
              />
            </div>

            {/* Mobile Generate Button */}
            <div className="lg:hidden sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pt-6 pb-8 -mx-6 px-6">
              <Button
                variant="hero"
                size="lg"
                className="w-full shadow-xl shadow-primary/30"
                onClick={handleGenerate}
                disabled={
                  (photos.length < 3 && scrapedImageUrls.length < 3) ||
                  (Math.max(photos.length, scrapedImageUrls.length) > 10) ||
                  !customization.agentInfo.name.trim() ||
                  !customization.agentInfo.phone.trim() ||
                  isGenerating
                }
              >
                {isGenerating ? "Generating..." : "Generate Video"}
              </Button>
              {photos.length < 3 && scrapedImageUrls.length < 3 && (
                <p className="text-xs text-center text-warning mt-3 font-medium">
                  Add {3 - Math.max(photos.length, scrapedImageUrls.length)} more photos to continue (3-10 images for 15-50s video)
                </p>
              )}
              {Math.max(photos.length, scrapedImageUrls.length) > 10 && (
                <p className="text-xs text-center text-warning mt-3 font-medium">
                  Maximum 10 photos allowed (you have {Math.max(photos.length, scrapedImageUrls.length)})
                </p>
              )}
              {!customization.agentInfo.name.trim() && (
                <p className="text-xs text-center text-warning mt-3 font-medium">
                  Please fill in your agent name
                </p>
              )}
              {!customization.agentInfo.phone.trim() && customization.agentInfo.name.trim() && (
                <p className="text-xs text-center text-warning mt-3 font-medium">
                  Please fill in your agent phone number
                </p>
              )}
            </div>
          </div>
        </main>

        {/* Right Panel - Hidden on mobile */}
        <div className="hidden lg:block">
          <RightPanel
            propertyDetails={propertyDetails}
            photoCount={scrapedImageUrls.length > 0 ? scrapedImageUrls.length : photos.length}
            onGenerate={handleGenerate}
            onReset={handleReset}
            isGenerating={isGenerating}
            generatingProgress={generatingProgress}
            videoReady={videoReady}
            error={error}
            videoUrl={videoUrl}
            videoUrls={videoUrls}
            agentInfoValid={!!customization.agentInfo.name.trim() && !!customization.agentInfo.phone.trim()}
            onDownloadLandscape={handleDownloadLandscape}
            isDownloadingLandscape={isDownloadingLandscape}
          />
        </div>
      </div>
    </div>
  );
}
