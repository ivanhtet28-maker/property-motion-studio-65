import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  X,
  LayoutTemplate,
  FolderOpen,
  Type,
  Music,
  Sticker,
  Search,
  Upload,
  Play,
  Pause,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Settings,
  Plus,
  Loader2,
  GripVertical,
  Trash2,
  Home,
  BedDouble,
  Bath,
  Utensils,
  LayoutGrid,
  Square,
  DollarSign,
  MapPin,
  Car,
  Sprout,
  Waves,
  Flame,
  Thermometer,
  Snowflake,
  CalendarDays,
  Eye,
  Sun,
  Heart,
  Star,
  ThumbsUp,
  Camera,
  Phone,
  Mail,
  Bell,
  Gift,
  Save,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { callStitchVideo } from "@/lib/callStitchVideo";
import { callVideoStatus } from "@/lib/callVideoStatus";
import { getMusicUrl } from "@/config/musicMapping";

// ─── Template data ───────────────────────────────────
const TEMPLATES = [
  { id: "open-house", name: "Open House" },
  { id: "modern-treehouse", name: "Modern Treehouse" },
  { id: "big-bold", name: "Big and Bold" },
  { id: "simple-white", name: "Simple White" },
  { id: "elegant-classic", name: "Elegant Classic" },
];

// ─── Sticker icons (matching AutoReel) ───────────────
const ICON_STICKERS = [
  { icon: Home, label: "Home" },
  { icon: BedDouble, label: "Bed" },
  { icon: Bath, label: "Bath" },
  { icon: Utensils, label: "Kitchen" },
  { icon: LayoutGrid, label: "Layout" },
  { icon: Square, label: "Square" },
  { icon: DollarSign, label: "Dollar" },
  { icon: MapPin, label: "Location" },
  { icon: Car, label: "Car" },
  { icon: Sprout, label: "Garden" },
  { icon: Waves, label: "Pool" },
  { icon: Flame, label: "Fire" },
  { icon: Thermometer, label: "Temp" },
  { icon: Snowflake, label: "AC" },
  { icon: CalendarDays, label: "Date" },
  { icon: Eye, label: "View" },
  { icon: Sun, label: "Sun" },
  { icon: Heart, label: "Heart" },
  { icon: Star, label: "Star" },
  { icon: ThumbsUp, label: "Like" },
  { icon: Camera, label: "Camera" },
  { icon: Phone, label: "Phone" },
  { icon: Mail, label: "Mail" },
  { icon: Bell, label: "Bell" },
  { icon: Gift, label: "Gift" },
];

// ─── Music tracks ────────────────────────────────────
const MUSIC_TRACKS = [
  "ambient-relaxing-1",
  "ambient-relaxing-2",
  "cinematic-epic-1",
  "cinematic-epic-2",
  "cinematic-epic-3",
  "classical-elegant-1",
  "classical-elegant-2",
  "Lofi 2 .mp3",
  "Luxury 1.mp3",
  "modern-chill-1",
  "modern-chill-2",
  "Upbeat 1 .mp3",
  "upbeat-energetic-3.mp3",
];

// ─── Timeline clip type ──────────────────────────────
interface TimelineClip {
  id: string;
  type: "image" | "video";
  src: string;
  duration: number; // seconds
  label: string;
  cameraAction: string;
}

// ─── Left sidebar tabs ──────────────────────────────
const SIDEBAR_TABS = [
  { id: "template", icon: LayoutTemplate, label: "Template" },
  { id: "media", icon: FolderOpen, label: "Media" },
  { id: "text", icon: Type, label: "Text" },
  { id: "audio", icon: Music, label: "Audio" },
  { id: "stickers", icon: Sticker, label: "Stickers" },
];

export default function Studio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [videoTitle, setVideoTitle] = useState("Untitled video");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("template");

  // Stored video context for re-rendering
  const [storedContext, setStoredContext] = useState<Record<string, unknown> | null>(null);
  const [videoData, setVideoData] = useState<Record<string, unknown> | null>(null);

  // Template
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateType, setTemplateType] = useState<"intro" | "outro">("intro");
  const [selectedTemplate, setSelectedTemplate] = useState("open-house");

  // Timeline
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(50);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);

  // Music
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [musicSearch, setMusicSearch] = useState("");

  // Sticker tab
  const [stickerTab, setStickerTab] = useState<"icons" | "emojis" | "shapes">("icons");

  // Text overlays on timeline
  const [textOverlays, setTextOverlays] = useState<
    { id: string; text: string; start: number; duration: number }[]
  >([]);

  const totalDuration = clips.reduce((acc, c) => acc + c.duration, 0);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCancelledRef = useRef(false);

  // ─── Determine which clip is visible at the current playback time ───
  const getClipAtTime = useCallback(
    (time: number): TimelineClip | null => {
      let elapsed = 0;
      for (const clip of clips) {
        if (time >= elapsed && time < elapsed + clip.duration) return clip;
        elapsed += clip.duration;
      }
      return clips[clips.length - 1] || null;
    },
    [clips]
  );

  const previewClip = selectedClip
    ? clips.find((c) => c.id === selectedClip) || null
    : getClipAtTime(currentTime);

  const previewSrc = previewClip?.src || thumbnailUrl;

  // ─── Playback timer ───
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 0.1;
          if (next >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, 100);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, totalDuration]);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => {
      pollCancelledRef.current = true;
    };
  }, []);

  // ─── Load video data ───
  useEffect(() => {
    if (!id || !user?.id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();
        if (error) throw error;

        setVideoTitle(data.property_address || "Untitled video");
        setThumbnailUrl(data.thumbnail_url);
        setVideoData(data);

        // Parse stored context
        const imageUrls: string[] = [];
        let cameraAngles: string[] = [];
        let clipDurations: number[] = [];
        let ctx: Record<string, unknown> = {};

        if (data.photos) {
          try {
            const parsed = typeof data.photos === "string"
              ? JSON.parse(data.photos)
              : data.photos;
            ctx = parsed;
            if (parsed.imageUrls) imageUrls.push(...parsed.imageUrls);
            if (Array.isArray(parsed.cameraAngles)) cameraAngles = parsed.cameraAngles;
            if (Array.isArray(parsed.clipDurations)) clipDurations = parsed.clipDurations;
            if (parsed.style) setSelectedTemplate(parsed.style);
          } catch { /* ignore */ }
        }

        setStoredContext(ctx);

        if (imageUrls.length > 0) {
          setClips(
            imageUrls.map((url, i) => ({
              id: `clip-${i}`,
              type: "image" as const,
              src: url,
              duration: clipDurations[i] || 3.5,
              label: `Scene ${i + 1}`,
              cameraAction: cameraAngles[i] || "push-in",
            }))
          );
        } else {
          setClips(
            Array.from({ length: 5 }, (_, i) => ({
              id: `clip-${i}`,
              type: "image" as const,
              src: data.thumbnail_url || "",
              duration: 3,
              label: `Scene ${i + 1}`,
              cameraAction: "push-in",
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load video:", err);
        toast({ title: "Error loading video", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user]);

  // ─── Add media clips ───
  const addMediaClip = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const newClips: TimelineClip[] = files.map((f, i) => ({
        id: `clip-${Date.now()}-${i}`,
        type: f.type.startsWith("video") ? "video" : "image",
        src: URL.createObjectURL(f),
        duration: 3.5,
        label: f.name.substring(0, 20),
        cameraAction: "push-in",
      }));
      setClips((prev) => [...prev, ...newClips]);
      toast({ title: `Added ${files.length} clip${files.length > 1 ? "s" : ""}` });
    };
    input.click();
  };

  const removeClip = (clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    if (selectedClip === clipId) setSelectedClip(null);
  };

  const addTextOverlay = () => {
    setTextOverlays((prev) => [
      ...prev,
      {
        id: `text-${Date.now()}`,
        text: "New Text",
        start: currentTime,
        duration: 3,
      },
    ]);
  };

  // ─── Save changes to database ───
  const handleSave = async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const updatedContext = { ...storedContext };
      updatedContext.cameraAngles = clips.map((c) => c.cameraAction);
      updatedContext.clipDurations = clips.map((c) => c.duration);
      updatedContext.imageUrls = clips.map((c) => c.src);
      updatedContext.style = selectedTemplate;

      const { error } = await supabase
        .from("videos")
        .update({ photos: JSON.stringify(updatedContext) })
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
      setStoredContext(updatedContext);
      toast({ title: "Changes saved", description: "Your edits have been saved." });
    } catch (err) {
      console.error("Save failed:", err);
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Could not save changes",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── Render video via stitch-video ───
  const handleRender = async () => {
    if (!id || !user?.id || !storedContext) return;

    setRendering(true);
    setRenderProgress(0);
    pollCancelledRef.current = false;

    try {
      // Build the stitch payload from stored context + studio edits
      const ctx = storedContext;
      const imageUrls = clips.map((c) => c.src);
      const clipDurations = clips.map((c) => c.duration);
      const cameraAngles = clips.map((c) => c.cameraAction);

      const musicUrl = selectedTrack ? getMusicUrl(selectedTrack) : (ctx.musicUrl as string | undefined) || undefined;

      const stitchResult = await callStitchVideo<{
        success: boolean;
        jobId?: string;
        error?: string;
      }>({
        imageUrls,
        clipDurations,
        cameraAngles,
        audioUrl: (ctx.audioUrl as string) || undefined,
        musicUrl: musicUrl || undefined,
        agentInfo: (ctx.agentInfo as Record<string, unknown>) || undefined,
        propertyData: (ctx.propertyData as Record<string, unknown>) || {
          address: videoTitle,
          price: "",
          beds: 0,
          baths: 0,
          description: "",
        },
        style: selectedTemplate,
        layout: selectedTemplate,
        customTitle: (ctx.customTitle as string) || "",
        videoId: id,
        outputFormat: "portrait",
      });

      if (!stitchResult.success || !stitchResult.jobId) {
        throw new Error(stitchResult.error || "Failed to start render");
      }

      setRenderProgress(20);
      toast({ title: "Rendering started", description: "Your video is being rendered..." });

      // Poll for completion
      const jobId = stitchResult.jobId;
      let attempts = 0;
      const maxAttempts = 120;

      const poll = async () => {
        if (pollCancelledRef.current || attempts >= maxAttempts) {
          if (attempts >= maxAttempts) {
            toast({ title: "Render timed out", variant: "destructive" });
          }
          setRendering(false);
          return;
        }
        attempts++;

        try {
          const statusData = await callVideoStatus<{
            status: string;
            videoUrl?: string;
            progress?: number;
          }>({
            stitchJobId: jobId,
            videoId: id,
            generationIds: [],
            clipDurations,
            propertyData: (ctx.propertyData as Record<string, unknown>) || { address: videoTitle, price: "", beds: 0, baths: 0, description: "" },
            style: selectedTemplate,
          });

          if (statusData.status === "done" && statusData.videoUrl) {
            setRenderProgress(100);
            setRendering(false);
            toast({
              title: "Video rendered!",
              description: "Your updated video is ready.",
            });
            window.open(statusData.videoUrl, "_blank");
            return;
          } else if (statusData.status === "failed") {
            setRendering(false);
            toast({ title: "Render failed", variant: "destructive" });
            return;
          } else {
            setRenderProgress(statusData.progress || Math.min(20 + attempts * 1.5, 95));
            setTimeout(poll, 5000);
          }
        } catch {
          setTimeout(poll, 5000);
        }
      };

      await poll();
    } catch (err) {
      console.error("Render failed:", err);
      setRendering(false);
      toast({
        title: "Render failed",
        description: err instanceof Error ? err.message : "Error",
        variant: "destructive",
      });
    }
  };

  const filteredTemplates = TEMPLATES.filter((t) =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const filteredTracks = MUSIC_TRACKS.filter((t) =>
    t.toLowerCase().includes(musicSearch.toLowerCase())
  );

  // ─── Seek on timeline click ───
  const handleTimelineSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - 32; // account for grip column
    if (x < 0) return;
    const seekTime = x / (zoom * 2);
    setCurrentTime(Math.max(0, Math.min(seekTime, totalDuration)));
    setSelectedClip(null);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#1a1a2e] text-white overflow-hidden">
      {/* Top bar */}
      <header className="h-12 bg-[#16162a] border-b border-white/10 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
            Exit
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{videoTitle}</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-white/10 border-white/10 text-white hover:bg-white/20"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="hero"
            size="sm"
            onClick={handleRender}
            disabled={rendering}
            className="text-xs"
          >
            {rendering ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Rendering {Math.round(renderProgress)}%
              </>
            ) : (
              "Render Video"
            )}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left icon sidebar */}
        <div className="w-14 bg-[#16162a] border-r border-white/10 flex flex-col items-center py-3 gap-1 flex-shrink-0">
          {SIDEBAR_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-0.5 w-12 py-2 rounded-lg transition-colors ${
                  isActive ? "bg-primary/20 text-primary" : "text-white/50 hover:text-white/80"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Left panel content */}
        <div className="w-[260px] bg-[#1e1e38] border-r border-white/10 overflow-y-auto flex-shrink-0">
          {/* Template */}
          {activeTab === "template" && (
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Template</h3>
              <Input
                placeholder="Search templates..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="bg-white/10 border-white/10 text-white placeholder:text-white/40 h-9 mb-3"
              />
              <div className="flex gap-1 mb-4">
                <button
                  onClick={() => setTemplateType("intro")}
                  className={`flex-1 text-xs py-1.5 rounded font-medium transition-colors ${
                    templateType === "intro"
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  Intro
                </button>
                <button
                  onClick={() => setTemplateType("outro")}
                  className={`flex-1 text-xs py-1.5 rounded font-medium transition-colors ${
                    templateType === "outro"
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/10 text-white/60"
                  }`}
                >
                  Outro
                </button>
              </div>
              <div className="space-y-3">
                {filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`w-full rounded-lg border-2 overflow-hidden transition-all ${
                      selectedTemplate === template.id
                        ? "border-primary"
                        : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <div className="aspect-video bg-white/5 flex items-center justify-center">
                      {thumbnailUrl ? (
                        <img src={thumbnailUrl} alt={template.name} className="w-full h-full object-cover" />
                      ) : (
                        <LayoutTemplate className="w-8 h-8 text-white/20" />
                      )}
                    </div>
                    <p className="text-xs font-medium py-2 px-2">{template.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Media */}
          {activeTab === "media" && (
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Media</h3>
              <p className="text-xs text-white/50 mb-4">
                Add photos or videos to the timeline.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-white/10 border-white/10 text-white hover:bg-white/20 mb-4"
                onClick={addMediaClip}
              >
                <Upload className="w-4 h-4 mr-1.5" />
                Upload media
              </Button>
              {/* Existing clips */}
              <div className="space-y-2">
                {clips.map((clip) => (
                  <div
                    key={clip.id}
                    className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer ${
                      selectedClip === clip.id
                        ? "bg-primary/20 ring-1 ring-primary"
                        : "bg-white/5 hover:bg-white/10"
                    }`}
                    onClick={() => {
                      setSelectedClip(clip.id);
                      // Seek to the clip's start time
                      let seekTime = 0;
                      for (const c of clips) {
                        if (c.id === clip.id) break;
                        seekTime += c.duration;
                      }
                      setCurrentTime(seekTime);
                    }}
                  >
                    <div className="w-12 h-8 rounded bg-white/10 overflow-hidden flex-shrink-0">
                      {clip.src && (
                        <img src={clip.src} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{clip.label}</p>
                      <p className="text-[10px] text-white/40">{clip.duration}s</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeClip(clip.id); }}
                      className="p-1 text-white/30 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Text */}
          {activeTab === "text" && (
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Text</h3>
              <p className="text-xs text-white/50 mb-4">
                Add text overlays to your video.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full bg-white/10 border-white/10 text-white hover:bg-white/20 mb-4"
                onClick={addTextOverlay}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add text
              </Button>
              <div className="space-y-3">
                {[
                  { name: "Heading", size: "text-xl", weight: "font-bold" },
                  { name: "Subheading", size: "text-base", weight: "font-semibold" },
                  { name: "Body", size: "text-sm", weight: "font-normal" },
                  { name: "Caption", size: "text-xs", weight: "font-light" },
                ].map((style) => (
                  <button
                    key={style.name}
                    onClick={addTextOverlay}
                    className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
                  >
                    <span className={`${style.size} ${style.weight}`}>{style.name}</span>
                  </button>
                ))}
              </div>
              {textOverlays.length > 0 && (
                <div className="mt-4 border-t border-white/10 pt-3">
                  <p className="text-xs text-white/40 mb-2">On timeline</p>
                  {textOverlays.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 py-1.5 text-xs">
                      <Type className="w-3 h-3 text-white/40" />
                      <span className="truncate">{t.text}</span>
                      <button
                        onClick={() => setTextOverlays((prev) => prev.filter((o) => o.id !== t.id))}
                        className="ml-auto p-0.5 text-white/30 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Audio */}
          {activeTab === "audio" && (
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Audio</h3>
              <Input
                placeholder="Search tracks..."
                value={musicSearch}
                onChange={(e) => setMusicSearch(e.target.value)}
                className="bg-white/10 border-white/10 text-white placeholder:text-white/40 h-9 mb-3"
              />
              <div className="space-y-0.5">
                {filteredTracks.map((track) => {
                  const isSelected = selectedTrack === track;
                  return (
                    <button
                      key={track}
                      onClick={() => setSelectedTrack(isSelected ? null : track)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-colors ${
                        isSelected
                          ? "bg-primary/20 text-primary"
                          : "text-white/70 hover:bg-white/10"
                      }`}
                    >
                      <span>{track}</span>
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stickers */}
          {activeTab === "stickers" && (
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Stickers</h3>
              <div className="flex gap-1 mb-4">
                {(["icons", "emojis", "shapes"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStickerTab(tab)}
                    className={`flex-1 text-xs py-1.5 rounded font-medium capitalize transition-colors ${
                      stickerTab === tab
                        ? "bg-primary text-primary-foreground"
                        : "bg-white/10 text-white/60"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {stickerTab === "icons" && (
                <div className="grid grid-cols-3 gap-2">
                  {ICON_STICKERS.map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      onClick={() => toast({ title: `Added ${label} sticker` })}
                      className="aspect-square rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/30 transition-colors"
                    >
                      <Icon className="w-6 h-6 text-white/70" />
                    </button>
                  ))}
                </div>
              )}

              {stickerTab === "emojis" && (
                <div className="grid grid-cols-5 gap-2">
                  {["🏠", "🏡", "🏢", "🏗️", "🏘️", "🛏️", "🛁", "🍳", "🚗", "🌳", "🏊", "🔥", "❄️", "☀️", "🌊", "⭐", "❤️", "👍", "📸", "📞"].map(
                    (emoji) => (
                      <button
                        key={emoji}
                        onClick={() => toast({ title: `Added ${emoji}` })}
                        className="text-xl p-2 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        {emoji}
                      </button>
                    )
                  )}
                </div>
              )}

              {stickerTab === "shapes" && (
                <div className="grid grid-cols-3 gap-2">
                  {["circle", "square", "rounded", "diamond", "triangle", "hexagon"].map(
                    (shape) => (
                      <button
                        key={shape}
                        onClick={() => toast({ title: `Added ${shape}` })}
                        className="aspect-square rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-xs text-white/50 capitalize"
                      >
                        {shape}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center: Preview + Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Preview area */}
          <div className="flex-1 flex items-center justify-center bg-[#12122a] p-6">
            <div className="aspect-[9/16] h-full max-h-[500px] bg-black rounded-lg overflow-hidden border border-white/10 relative">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Preview"
                  className="w-full h-full object-cover transition-opacity duration-200"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20">
                  <Play className="w-16 h-16" />
                </div>
              )}
              {/* Scene indicator */}
              {previewClip && (
                <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-md px-2 py-1">
                  <span className="text-[10px] font-medium text-white/80">
                    {previewClip.label} — {previewClip.cameraAction}
                  </span>
                </div>
              )}
              {/* Render progress overlay */}
              {rendering && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
                  <p className="text-sm font-medium">Rendering {Math.round(renderProgress)}%</p>
                  <div className="w-40 h-1.5 bg-white/20 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${renderProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Playback controls */}
          <div className="h-12 bg-[#1e1e38] border-t border-white/10 flex items-center gap-4 px-4">
            <div className="flex items-center gap-2">
              <button className="p-1 text-white/40 hover:text-white transition-colors">
                <Undo2 className="w-4 h-4" />
              </button>
              <button className="p-1 text-white/40 hover:text-white transition-colors">
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
            <button className="text-xs px-2 py-1 rounded bg-white/10 text-white/60">
              1x
            </button>
            <button
              onClick={() => {
                if (!isPlaying && currentTime >= totalDuration) setCurrentTime(0);
                setIsPlaying(!isPlaying);
                setSelectedClip(null);
              }}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 text-primary-foreground" />
              ) : (
                <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
              )}
            </button>
            <span className="text-xs text-white/60 tabular-nums">
              {String(Math.floor(currentTime / 60)).padStart(2, "0")}:
              {String(Math.floor(currentTime % 60)).padStart(2, "0")}.
              {String(Math.floor((currentTime % 1) * 10)).padStart(1, "0")}0 /{" "}
              {String(Math.floor(totalDuration / 60)).padStart(2, "0")}:
              {String(Math.floor(totalDuration % 60)).padStart(2, "0")}.00
            </span>
            <div className="flex-1" />
            <button
              onClick={() => setZoom(Math.max(20, zoom - 10))}
              className="p-1 text-white/40 hover:text-white transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={20}
              max={100}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-24 accent-primary"
            />
            <button
              onClick={() => setZoom(Math.min(100, zoom + 10))}
              className="p-1 text-white/40 hover:text-white transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button className="p-1 text-white/40 hover:text-white transition-colors">
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Timeline */}
          <div className="h-[200px] bg-[#16162a] border-t border-white/10 overflow-x-auto">
            {/* Time ruler */}
            <div className="h-6 border-b border-white/5 flex items-end px-8 text-[9px] text-white/30">
              {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
                <div
                  key={i}
                  className="flex-shrink-0"
                  style={{ width: `${zoom * 2}px` }}
                >
                  {i}.00s
                </div>
              ))}
            </div>

            {/* Playhead */}
            <div
              className="absolute h-[174px] w-px bg-primary z-10 pointer-events-none"
              style={{
                left: `${32 + currentTime * zoom * 2}px`,
                marginTop: "0px",
              }}
            />

            {/* Tracks */}
            <div className="py-1 relative">
              {["Video", "Text", "Audio", "Overlay", "Stickers"].map((trackName, trackIdx) => (
                <div
                  key={trackName}
                  className="flex items-center h-7 border-b border-white/5"
                  onClick={trackIdx === 0 ? handleTimelineSeek : undefined}
                >
                  <div className="w-8 flex-shrink-0 flex items-center justify-center">
                    <GripVertical className="w-3 h-3 text-white/20" />
                  </div>
                  <div className="flex-1 relative h-full">
                    {/* Render clips on video track */}
                    {trackIdx === 0 && (
                      <div className="absolute inset-0 flex items-center gap-px">
                        {clips.map((clip) => {
                          const isActive = selectedClip === clip.id ||
                            (!selectedClip && previewClip?.id === clip.id);
                          return (
                            <div
                              key={clip.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedClip(clip.id);
                                let seekTime = 0;
                                for (const c of clips) {
                                  if (c.id === clip.id) break;
                                  seekTime += c.duration;
                                }
                                setCurrentTime(seekTime);
                              }}
                              className={`h-5 rounded-sm flex items-center px-1.5 text-[9px] font-medium cursor-pointer transition-colors flex-shrink-0 ${
                                isActive
                                  ? "bg-primary ring-1 ring-primary"
                                  : "bg-pink-600/80 hover:bg-pink-500/80"
                              }`}
                              style={{ width: `${clip.duration * zoom * 2}px` }}
                            >
                              <span className="truncate text-white">{clip.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Audio track */}
                    {trackIdx === 2 && selectedTrack && (
                      <div className="absolute inset-0 flex items-center">
                        <div
                          className="h-5 rounded-sm bg-blue-600/60 flex items-center px-1.5 text-[9px] font-medium text-white"
                          style={{ width: `${totalDuration * zoom * 2}px` }}
                        >
                          <Music className="w-2.5 h-2.5 mr-1" />
                          {selectedTrack}
                        </div>
                      </div>
                    )}
                    {/* Text overlays on text track */}
                    {trackIdx === 1 && textOverlays.length > 0 && (
                      <div className="absolute inset-0 flex items-center gap-px">
                        {textOverlays.map((t) => (
                          <div
                            key={t.id}
                            className="h-5 rounded-sm bg-green-600/60 flex items-center px-1.5 text-[9px] font-medium text-white"
                            style={{
                              width: `${t.duration * zoom * 2}px`,
                              marginLeft: `${t.start * zoom * 2}px`,
                            }}
                          >
                            {t.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
