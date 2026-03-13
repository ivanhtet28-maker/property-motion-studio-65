import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  X,
  LayoutTemplate,
  FolderOpen,
  Type,
  Music,
  Sticker,
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
  ChevronUp,
  ChevronDown,
  Clock,
  Palette,
  MoveVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { callStitchVideo } from "@/lib/callStitchVideo";
import { callVideoStatus } from "@/lib/callVideoStatus";
import { getMusicUrl } from "@/config/musicMapping";
import {
  type CameraAction,
  CAMERA_ACTION_OPTIONS,
} from "@/components/create-video/PhotoUpload";

// ─── Template data ───────────────────────────────────
const TEMPLATES = [
  { id: "open-house", name: "Open House" },
  { id: "modern-treehouse", name: "Modern Treehouse" },
  { id: "big-bold", name: "Big and Bold" },
  { id: "simple-white", name: "Simple White" },
  { id: "elegant-classic", name: "Elegant Classic" },
];

// ─── Sticker icons ───────────────────────────────────
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

// ─── Text preset styles ─────────────────────────────
const TEXT_PRESETS = [
  { name: "Heading", fontSize: 32, fontWeight: "bold", color: "#ffffff" },
  { name: "Subheading", fontSize: 24, fontWeight: "semibold", color: "#ffffff" },
  { name: "Body", fontSize: 16, fontWeight: "normal", color: "#ffffff" },
  { name: "Caption", fontSize: 12, fontWeight: "light", color: "#cccccc" },
];

// ─── Timeline types ─────────────────────────────────
interface TimelineClip {
  id: string;
  type: "image" | "video";
  src: string;
  duration: number;
  label: string;
  cameraAction: CameraAction;
}

interface TextOverlay {
  id: string;
  text: string;
  start: number;
  duration: number;
  fontSize: number;
  fontWeight: string;
  color: string;
}

// ─── Sidebar tabs ────────────────────────────────────
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
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Music
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [musicSearch, setMusicSearch] = useState("");

  // Sticker tab
  const [stickerTab, setStickerTab] = useState<"icons" | "emojis" | "shapes">("icons");

  // Text overlays
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);

  // Timeline drag resize
  const [resizingClip, setResizingClip] = useState<string | null>(null);
  const resizeStartRef = useRef<{ x: number; originalDuration: number } | null>(null);

  const totalDuration = clips.reduce((acc, c) => acc + c.duration, 0);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCancelledRef = useRef(false);

  // ─── Clip at playback time ───
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
  const selectedTextOverlay = selectedTextId
    ? textOverlays.find((t) => t.id === selectedTextId) || null
    : null;

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

  useEffect(() => {
    return () => { pollCancelledRef.current = true; };
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

        const imageUrls: string[] = [];
        let cameraAngles: string[] = [];
        let clipDurations: number[] = [];
        let ctx: Record<string, unknown> = {};

        if (data.photos) {
          try {
            const parsed = typeof data.photos === "string"
              ? JSON.parse(data.photos) : data.photos;
            ctx = parsed;
            if (parsed.imageUrls) imageUrls.push(...parsed.imageUrls);
            if (Array.isArray(parsed.cameraAngles)) cameraAngles = parsed.cameraAngles;
            if (Array.isArray(parsed.clipDurations)) clipDurations = parsed.clipDurations;
            if (parsed.style) setSelectedTemplate(parsed.style);
          } catch { /* ignore */ }
        }

        setStoredContext(ctx);

        if (imageUrls.length > 0) {
          setClips(imageUrls.map((url, i) => ({
            id: `clip-${i}`,
            type: "image" as const,
            src: url,
            duration: clipDurations[i] || 3.5,
            label: `Scene ${i + 1}`,
            cameraAction: (cameraAngles[i] || "push-in") as CameraAction,
          })));
        } else {
          setClips(Array.from({ length: 5 }, (_, i) => ({
            id: `clip-${i}`,
            type: "image" as const,
            src: data.thumbnail_url || "",
            duration: 3,
            label: `Scene ${i + 1}`,
            cameraAction: "push-in" as CameraAction,
          })));
        }
      } catch (err) {
        console.error("Failed to load video:", err);
        toast({ title: "Error loading video", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user]);

  // ─── Clip mutations ───
  const updateClip = (clipId: string, updates: Partial<TimelineClip>) => {
    setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, ...updates } : c)));
  };

  const moveClip = (clipId: string, direction: "up" | "down") => {
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === clipId);
      if (idx < 0) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const addMediaClip = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const newClips: TimelineClip[] = files.map((f, i) => ({
        id: `clip-${Date.now()}-${i}`,
        type: f.type.startsWith("video") ? ("video" as const) : ("image" as const),
        src: URL.createObjectURL(f),
        duration: 3.5,
        label: f.name.substring(0, 20),
        cameraAction: "push-in" as CameraAction,
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

  // ─── Text overlay mutations ───
  const addTextOverlay = (preset?: typeof TEXT_PRESETS[number]) => {
    const newText: TextOverlay = {
      id: `text-${Date.now()}`,
      text: preset?.name || "New Text",
      start: currentTime,
      duration: 3,
      fontSize: preset?.fontSize || 16,
      fontWeight: preset?.fontWeight || "normal",
      color: preset?.color || "#ffffff",
    };
    setTextOverlays((prev) => [...prev, newText]);
    setSelectedTextId(newText.id);
    setSelectedClip(null);
  };

  const updateTextOverlay = (textId: string, updates: Partial<TextOverlay>) => {
    setTextOverlays((prev) =>
      prev.map((t) => (t.id === textId ? { ...t, ...updates } : t))
    );
  };

  const removeTextOverlay = (textId: string) => {
    setTextOverlays((prev) => prev.filter((t) => t.id !== textId));
    if (selectedTextId === textId) setSelectedTextId(null);
  };

  // ─── Timeline drag resize ───
  const handleResizeStart = (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;
    setResizingClip(clipId);
    resizeStartRef.current = { x: e.clientX, originalDuration: clip.duration };

    const handleMove = (moveEvent: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const dx = moveEvent.clientX - resizeStartRef.current.x;
      const durationDelta = dx / (zoom * 2);
      const newDuration = Math.max(0.5, Math.min(30, resizeStartRef.current.originalDuration + durationDelta));
      updateClip(clipId, { duration: Math.round(newDuration * 10) / 10 });
    };

    const handleUp = () => {
      setResizingClip(null);
      resizeStartRef.current = null;
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  // ─── Save ───
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
      toast({ title: "Save failed", description: err instanceof Error ? err.message : "Could not save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───
  const handleRender = async () => {
    if (!id || !user?.id || !storedContext) return;
    setRendering(true);
    setRenderProgress(0);
    pollCancelledRef.current = false;

    try {
      const ctx = storedContext;
      const imageUrls = clips.map((c) => c.src);
      const clipDurations = clips.map((c) => c.duration);
      const cameraAngles = clips.map((c) => c.cameraAction);
      const musicUrl = selectedTrack ? getMusicUrl(selectedTrack) : (ctx.musicUrl as string | undefined) || undefined;

      const stitchResult = await callStitchVideo<{ success: boolean; jobId?: string; error?: string }>({
        imageUrls, clipDurations, cameraAngles,
        audioUrl: (ctx.audioUrl as string) || undefined,
        musicUrl: musicUrl || undefined,
        agentInfo: (ctx.agentInfo as Record<string, unknown>) || undefined,
        propertyData: (ctx.propertyData as Record<string, unknown>) || { address: videoTitle, price: "", beds: 0, baths: 0, description: "" },
        style: selectedTemplate, layout: selectedTemplate,
        customTitle: (ctx.customTitle as string) || "",
        videoId: id, outputFormat: "portrait",
      });

      if (!stitchResult.success || !stitchResult.jobId) throw new Error(stitchResult.error || "Failed to start render");

      setRenderProgress(20);
      toast({ title: "Rendering started", description: "Your video is being rendered..." });

      const jobId = stitchResult.jobId;
      let attempts = 0;
      const poll = async () => {
        if (pollCancelledRef.current || attempts >= 120) {
          if (attempts >= 120) toast({ title: "Render timed out", variant: "destructive" });
          setRendering(false);
          return;
        }
        attempts++;
        try {
          const statusData = await callVideoStatus<{ status: string; videoUrl?: string; progress?: number }>({
            stitchJobId: jobId, videoId: id, generationIds: [], clipDurations,
            propertyData: (ctx.propertyData as Record<string, unknown>) || { address: videoTitle, price: "", beds: 0, baths: 0, description: "" },
            style: selectedTemplate,
          });
          if (statusData.status === "done" && statusData.videoUrl) {
            setRenderProgress(100);
            setRendering(false);
            toast({ title: "Video rendered!", description: "Your updated video is ready." });
            window.open(statusData.videoUrl, "_blank");
          } else if (statusData.status === "failed") {
            setRendering(false);
            toast({ title: "Render failed", variant: "destructive" });
          } else {
            setRenderProgress(statusData.progress || Math.min(20 + attempts * 1.5, 95));
            setTimeout(poll, 5000);
          }
        } catch { setTimeout(poll, 5000); }
      };
      await poll();
    } catch (err) {
      console.error("Render failed:", err);
      setRendering(false);
      toast({ title: "Render failed", description: err instanceof Error ? err.message : "Error", variant: "destructive" });
    }
  };

  const filteredTemplates = TEMPLATES.filter((t) =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );
  const filteredTracks = MUSIC_TRACKS.filter((t) =>
    t.toLowerCase().includes(musicSearch.toLowerCase())
  );

  const handleTimelineSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - 32;
    if (x < 0) return;
    const seekTime = x / (zoom * 2);
    setCurrentTime(Math.max(0, Math.min(seekTime, totalDuration)));
    setSelectedClip(null);
    setSelectedTextId(null);
  };

  // Get clip start time helper
  const getClipStartTime = (clipId: string): number => {
    let t = 0;
    for (const c of clips) {
      if (c.id === clipId) return t;
      t += c.duration;
    }
    return t;
  };

  // Determine if we should show the right properties panel
  const showPropertiesPanel = selectedClip || selectedTextId;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#1a1a2e] text-white overflow-hidden">
      {/* ─── Top bar ─── */}
      <header className="h-12 bg-[#16162a] border-b border-white/10 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/dashboard")} className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white transition-colors">
            <X className="w-4 h-4" /> Exit
          </button>
        </div>
        <span className="text-sm font-medium">{videoTitle}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="text-xs bg-white/10 border-white/10 text-white hover:bg-white/20">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button variant="hero" size="sm" onClick={handleRender} disabled={rendering} className="text-xs">
            {rendering ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /> Rendering {Math.round(renderProgress)}%</>) : "Render Video"}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ─── Left icon sidebar ─── */}
        <div className="w-14 bg-[#16162a] border-r border-white/10 flex flex-col items-center py-3 gap-1 flex-shrink-0">
          {SIDEBAR_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-0.5 w-12 py-2 rounded-lg transition-colors ${activeTab === tab.id ? "bg-primary/20 text-primary" : "text-white/50 hover:text-white/80"}`}>
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ─── Left panel content ─── */}
        <div className="w-[260px] bg-[#1e1e38] border-r border-white/10 overflow-y-auto flex-shrink-0">
          {/* Template */}
          {activeTab === "template" && (
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Template</h3>
              <Input placeholder="Search templates..." value={templateSearch} onChange={(e) => setTemplateSearch(e.target.value)}
                className="bg-white/10 border-white/10 text-white placeholder:text-white/40 h-9 mb-3" />
              <div className="flex gap-1 mb-4">
                {(["intro", "outro"] as const).map((t) => (
                  <button key={t} onClick={() => setTemplateType(t)}
                    className={`flex-1 text-xs py-1.5 rounded font-medium capitalize transition-colors ${templateType === t ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/60"}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {filteredTemplates.map((template) => (
                  <button key={template.id} onClick={() => setSelectedTemplate(template.id)}
                    className={`w-full rounded-lg border-2 overflow-hidden transition-all ${selectedTemplate === template.id ? "border-primary" : "border-white/10 hover:border-white/30"}`}>
                    <div className="aspect-video bg-white/5 flex items-center justify-center">
                      {thumbnailUrl ? <img src={thumbnailUrl} alt={template.name} className="w-full h-full object-cover" /> : <LayoutTemplate className="w-8 h-8 text-white/20" />}
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
              <Button variant="outline" size="sm" className="w-full bg-white/10 border-white/10 text-white hover:bg-white/20 mb-4" onClick={addMediaClip}>
                <Upload className="w-4 h-4 mr-1.5" /> Upload media
              </Button>
              <div className="space-y-1">
                {clips.map((clip, idx) => (
                  <div key={clip.id}
                    className={`flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer ${selectedClip === clip.id ? "bg-primary/20 ring-1 ring-primary" : "bg-white/5 hover:bg-white/10"}`}
                    onClick={() => { setSelectedClip(clip.id); setSelectedTextId(null); setCurrentTime(getClipStartTime(clip.id)); }}>
                    <div className="w-10 h-7 rounded bg-white/10 overflow-hidden flex-shrink-0">
                      {clip.src && <img src={clip.src} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{clip.label}</p>
                      <p className="text-[10px] text-white/40">{clip.duration}s &middot; {clip.cameraAction}</p>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); moveClip(clip.id, "up"); }} disabled={idx === 0}
                        className="p-0.5 text-white/30 hover:text-white disabled:opacity-20 transition-colors">
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); moveClip(clip.id, "down"); }} disabled={idx === clips.length - 1}
                        className="p-0.5 text-white/30 hover:text-white disabled:opacity-20 transition-colors">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeClip(clip.id); }} className="p-1 text-white/30 hover:text-red-400 transition-colors">
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
              <Button variant="outline" size="sm" className="w-full bg-white/10 border-white/10 text-white hover:bg-white/20 mb-4"
                onClick={() => addTextOverlay()}>
                <Plus className="w-4 h-4 mr-1.5" /> Add text
              </Button>
              <div className="space-y-2 mb-4">
                {TEXT_PRESETS.map((preset) => (
                  <button key={preset.name} onClick={() => addTextOverlay(preset)}
                    className="w-full p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left">
                    <span style={{ fontSize: `${Math.min(preset.fontSize, 20)}px`, fontWeight: preset.fontWeight === "bold" ? 700 : preset.fontWeight === "semibold" ? 600 : preset.fontWeight === "light" ? 300 : 400 }}>
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
              {textOverlays.length > 0 && (
                <div className="border-t border-white/10 pt-3">
                  <p className="text-xs text-white/40 mb-2">On timeline ({textOverlays.length})</p>
                  {textOverlays.map((t) => (
                    <div key={t.id}
                      className={`flex items-center gap-2 py-1.5 px-2 text-xs rounded cursor-pointer transition-colors ${selectedTextId === t.id ? "bg-primary/20" : "hover:bg-white/5"}`}
                      onClick={() => { setSelectedTextId(t.id); setSelectedClip(null); }}>
                      <Type className="w-3 h-3 text-white/40 flex-shrink-0" />
                      <span className="truncate flex-1">{t.text}</span>
                      <span className="text-[10px] text-white/30">{t.duration}s</span>
                      <button onClick={(e) => { e.stopPropagation(); removeTextOverlay(t.id); }} className="p-0.5 text-white/30 hover:text-red-400">
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
              <Input placeholder="Search tracks..." value={musicSearch} onChange={(e) => setMusicSearch(e.target.value)}
                className="bg-white/10 border-white/10 text-white placeholder:text-white/40 h-9 mb-3" />
              <div className="space-y-0.5">
                {filteredTracks.map((track) => (
                  <button key={track} onClick={() => setSelectedTrack(selectedTrack === track ? null : track)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-colors ${selectedTrack === track ? "bg-primary/20 text-primary" : "text-white/70 hover:bg-white/10"}`}>
                    <span>{track}</span>
                    <Play className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stickers */}
          {activeTab === "stickers" && (
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Stickers</h3>
              <div className="flex gap-1 mb-4">
                {(["icons", "emojis", "shapes"] as const).map((tab) => (
                  <button key={tab} onClick={() => setStickerTab(tab)}
                    className={`flex-1 text-xs py-1.5 rounded font-medium capitalize transition-colors ${stickerTab === tab ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/60"}`}>
                    {tab}
                  </button>
                ))}
              </div>
              {stickerTab === "icons" && (
                <div className="grid grid-cols-3 gap-2">
                  {ICON_STICKERS.map(({ icon: Icon, label }) => (
                    <button key={label} onClick={() => toast({ title: `Added ${label} sticker` })}
                      className="aspect-square rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/30 transition-colors">
                      <Icon className="w-6 h-6 text-white/70" />
                    </button>
                  ))}
                </div>
              )}
              {stickerTab === "emojis" && (
                <div className="grid grid-cols-5 gap-2">
                  {["🏠","🏡","🏢","🏗️","🏘️","🛏️","🛁","🍳","🚗","🌳","🏊","🔥","❄️","☀️","🌊","⭐","❤️","👍","📸","📞"].map((emoji) => (
                    <button key={emoji} onClick={() => toast({ title: `Added ${emoji}` })} className="text-xl p-2 rounded-lg hover:bg-white/10 transition-colors">{emoji}</button>
                  ))}
                </div>
              )}
              {stickerTab === "shapes" && (
                <div className="grid grid-cols-3 gap-2">
                  {["circle","square","rounded","diamond","triangle","hexagon"].map((shape) => (
                    <button key={shape} onClick={() => toast({ title: `Added ${shape}` })}
                      className="aspect-square rounded-lg border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-xs text-white/50 capitalize">{shape}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Center: Preview + Timeline ─── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Preview */}
          <div className="flex-1 flex items-center justify-center bg-[#12122a] p-6 relative">
            <div className="aspect-[9/16] h-full max-h-[500px] bg-black rounded-lg overflow-hidden border border-white/10 relative">
              {previewSrc ? (
                <img src={previewSrc} alt="Preview" className="w-full h-full object-cover transition-opacity duration-200" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20">
                  <Play className="w-16 h-16" />
                </div>
              )}
              {/* Scene indicator */}
              {previewClip && (
                <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-md px-2 py-1">
                  <span className="text-[10px] font-medium text-white/80">{previewClip.label} — {previewClip.cameraAction}</span>
                </div>
              )}
              {/* Text overlay preview */}
              {textOverlays.filter((t) => currentTime >= t.start && currentTime < t.start + t.duration).map((t) => (
                <div key={t.id} className="absolute bottom-16 left-0 right-0 flex justify-center pointer-events-none">
                  <span style={{ fontSize: `${t.fontSize}px`, fontWeight: t.fontWeight === "bold" ? 700 : t.fontWeight === "semibold" ? 600 : t.fontWeight === "light" ? 300 : 400, color: t.color }}
                    className="text-shadow px-4 py-1 drop-shadow-lg">
                    {t.text}
                  </span>
                </div>
              ))}
              {/* Render progress */}
              {rendering && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
                  <p className="text-sm font-medium">Rendering {Math.round(renderProgress)}%</p>
                  <div className="w-40 h-1.5 bg-white/20 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${renderProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Playback controls */}
          <div className="h-12 bg-[#1e1e38] border-t border-white/10 flex items-center gap-4 px-4">
            <div className="flex items-center gap-2">
              <button className="p-1 text-white/40 hover:text-white transition-colors"><Undo2 className="w-4 h-4" /></button>
              <button className="p-1 text-white/40 hover:text-white transition-colors"><Redo2 className="w-4 h-4" /></button>
            </div>
            <button className="text-xs px-2 py-1 rounded bg-white/10 text-white/60">1x</button>
            <button onClick={() => { if (!isPlaying && currentTime >= totalDuration) setCurrentTime(0); setIsPlaying(!isPlaying); setSelectedClip(null); setSelectedTextId(null); }}
              className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              {isPlaying ? <Pause className="w-4 h-4 text-primary-foreground" /> : <Play className="w-4 h-4 text-primary-foreground ml-0.5" />}
            </button>
            <span className="text-xs text-white/60 tabular-nums">
              {String(Math.floor(currentTime / 60)).padStart(2, "0")}:{String(Math.floor(currentTime % 60)).padStart(2, "0")}.{String(Math.floor((currentTime % 1) * 10))}0 / {String(Math.floor(totalDuration / 60)).padStart(2, "0")}:{String(Math.floor(totalDuration % 60)).padStart(2, "0")}.00
            </span>
            <div className="flex-1" />
            <button onClick={() => setZoom(Math.max(20, zoom - 10))} className="p-1 text-white/40 hover:text-white"><ZoomOut className="w-4 h-4" /></button>
            <input type="range" min={20} max={100} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-24 accent-primary" />
            <button onClick={() => setZoom(Math.min(100, zoom + 10))} className="p-1 text-white/40 hover:text-white"><ZoomIn className="w-4 h-4" /></button>
            <button className="p-1 text-white/40 hover:text-white"><Settings className="w-4 h-4" /></button>
          </div>

          {/* Timeline */}
          <div className="h-[200px] bg-[#16162a] border-t border-white/10 overflow-x-auto relative">
            {/* Time ruler */}
            <div className="h-6 border-b border-white/5 flex items-end px-8 text-[9px] text-white/30">
              {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
                <div key={i} className="flex-shrink-0" style={{ width: `${zoom * 2}px` }}>{i}.00s</div>
              ))}
            </div>

            {/* Playhead */}
            <div className="absolute w-px bg-primary z-10 pointer-events-none" style={{ left: `${32 + currentTime * zoom * 2}px`, top: "24px", bottom: "0px" }} />

            {/* Tracks */}
            <div className="py-1 relative">
              {["Video", "Text", "Audio", "Overlay", "Stickers"].map((trackName, trackIdx) => (
                <div key={trackName} className="flex items-center h-7 border-b border-white/5"
                  onClick={trackIdx === 0 ? handleTimelineSeek : undefined}>
                  <div className="w-8 flex-shrink-0 flex items-center justify-center">
                    <GripVertical className="w-3 h-3 text-white/20" />
                  </div>
                  <div className="flex-1 relative h-full">
                    {/* Video track */}
                    {trackIdx === 0 && (
                      <div className="absolute inset-0 flex items-center gap-px">
                        {clips.map((clip) => {
                          const isActive = selectedClip === clip.id || (!selectedClip && !selectedTextId && previewClip?.id === clip.id);
                          return (
                            <div key={clip.id} className="relative flex-shrink-0" style={{ width: `${clip.duration * zoom * 2}px` }}>
                              <div onClick={(e) => { e.stopPropagation(); setSelectedClip(clip.id); setSelectedTextId(null); setCurrentTime(getClipStartTime(clip.id)); }}
                                className={`h-5 rounded-sm flex items-center px-1.5 text-[9px] font-medium cursor-pointer transition-colors ${isActive ? "bg-primary ring-1 ring-primary" : "bg-pink-600/80 hover:bg-pink-500/80"}`}>
                                <span className="truncate text-white">{clip.label}</span>
                              </div>
                              {/* Drag handle on right edge for resize */}
                              <div onMouseDown={(e) => handleResizeStart(clip.id, e)}
                                className={`absolute right-0 top-0 w-2 h-5 cursor-col-resize hover:bg-white/30 rounded-r-sm transition-colors ${resizingClip === clip.id ? "bg-white/40" : ""}`} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Text track */}
                    {trackIdx === 1 && textOverlays.length > 0 && (
                      <div className="absolute inset-0">
                        {textOverlays.map((t) => (
                          <div key={t.id}
                            onClick={(e) => { e.stopPropagation(); setSelectedTextId(t.id); setSelectedClip(null); }}
                            className={`absolute h-5 top-1 rounded-sm flex items-center px-1.5 text-[9px] font-medium cursor-pointer transition-colors ${selectedTextId === t.id ? "bg-green-500 ring-1 ring-green-400" : "bg-green-600/60 hover:bg-green-500/60"}`}
                            style={{ width: `${t.duration * zoom * 2}px`, left: `${t.start * zoom * 2}px` }}>
                            <span className="truncate text-white">{t.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Audio track */}
                    {trackIdx === 2 && selectedTrack && (
                      <div className="absolute inset-0 flex items-center">
                        <div className="h-5 rounded-sm bg-blue-600/60 flex items-center px-1.5 text-[9px] font-medium text-white"
                          style={{ width: `${totalDuration * zoom * 2}px` }}>
                          <Music className="w-2.5 h-2.5 mr-1" />{selectedTrack}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Right: Properties panel ─── */}
        {showPropertiesPanel && (
          <div className="w-[260px] bg-[#1e1e38] border-l border-white/10 overflow-y-auto flex-shrink-0">
            {/* Clip properties */}
            {selectedClip && (() => {
              const clip = clips.find((c) => c.id === selectedClip);
              if (!clip) return null;
              const clipIdx = clips.findIndex((c) => c.id === selectedClip);
              return (
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold">Clip Properties</h3>
                    <button onClick={() => setSelectedClip(null)} className="p-1 text-white/40 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Thumbnail */}
                  <div className="aspect-video rounded-lg overflow-hidden bg-white/5 mb-4">
                    {clip.src && <img src={clip.src} alt="" className="w-full h-full object-cover" />}
                  </div>

                  {/* Label */}
                  <div className="mb-4">
                    <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 block">Label</label>
                    <Input value={clip.label} onChange={(e) => updateClip(clip.id, { label: e.target.value })}
                      className="bg-white/10 border-white/10 text-white h-8 text-xs" />
                  </div>

                  {/* Duration */}
                  <div className="mb-4">
                    <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Duration (seconds)
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={0.5} max={30} step={0.1} value={clip.duration}
                        onChange={(e) => updateClip(clip.id, { duration: Number(e.target.value) })}
                        className="flex-1 accent-primary" />
                      <Input type="number" min={0.5} max={30} step={0.1} value={clip.duration}
                        onChange={(e) => updateClip(clip.id, { duration: Math.max(0.5, Math.min(30, Number(e.target.value))) })}
                        className="w-16 bg-white/10 border-white/10 text-white h-8 text-xs text-center" />
                    </div>
                  </div>

                  {/* Camera action */}
                  <div className="mb-4">
                    <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Camera className="w-3 h-3" /> Camera Motion
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {CAMERA_ACTION_OPTIONS.map((option) => (
                        <button key={option.value}
                          onClick={() => updateClip(clip.id, { cameraAction: option.value })}
                          className={`px-2 py-1.5 rounded text-[11px] transition-colors ${clip.cameraAction === option.value ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-white/40 mt-1.5">
                      {CAMERA_ACTION_OPTIONS.find((o) => o.value === clip.cameraAction)?.description}
                    </p>
                  </div>

                  {/* Reorder */}
                  <div className="mb-4">
                    <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <MoveVertical className="w-3 h-3" /> Reorder
                    </label>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" disabled={clipIdx === 0}
                        onClick={() => moveClip(clip.id, "up")}
                        className="flex-1 bg-white/10 border-white/10 text-white hover:bg-white/20 text-xs">
                        <ChevronUp className="w-3 h-3 mr-1" /> Move up
                      </Button>
                      <Button variant="outline" size="sm" disabled={clipIdx === clips.length - 1}
                        onClick={() => moveClip(clip.id, "down")}
                        className="flex-1 bg-white/10 border-white/10 text-white hover:bg-white/20 text-xs">
                        <ChevronDown className="w-3 h-3 mr-1" /> Move down
                      </Button>
                    </div>
                  </div>

                  {/* Delete */}
                  <Button variant="outline" size="sm"
                    onClick={() => removeClip(clip.id)}
                    className="w-full bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs">
                    <Trash2 className="w-3 h-3 mr-1" /> Remove clip
                  </Button>
                </div>
              );
            })()}

            {/* Text overlay properties */}
            {selectedTextOverlay && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Text Properties</h3>
                  <button onClick={() => setSelectedTextId(null)} className="p-1 text-white/40 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Text content */}
                <div className="mb-4">
                  <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 block">Content</label>
                  <textarea value={selectedTextOverlay.text}
                    onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { text: e.target.value })}
                    rows={3}
                    className="w-full bg-white/10 border border-white/10 text-white rounded-md px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>

                {/* Font size */}
                <div className="mb-4">
                  <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Type className="w-3 h-3" /> Font Size
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={8} max={64} step={1} value={selectedTextOverlay.fontSize}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { fontSize: Number(e.target.value) })}
                      className="flex-1 accent-primary" />
                    <Input type="number" min={8} max={64} value={selectedTextOverlay.fontSize}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { fontSize: Number(e.target.value) })}
                      className="w-16 bg-white/10 border-white/10 text-white h-8 text-xs text-center" />
                  </div>
                </div>

                {/* Font weight */}
                <div className="mb-4">
                  <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 block">Font Weight</label>
                  <div className="grid grid-cols-4 gap-1">
                    {["light", "normal", "semibold", "bold"].map((w) => (
                      <button key={w} onClick={() => updateTextOverlay(selectedTextOverlay.id, { fontWeight: w })}
                        className={`px-2 py-1.5 rounded text-[10px] capitalize transition-colors ${selectedTextOverlay.fontWeight === w ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/70 hover:bg-white/20"}`}>
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color */}
                <div className="mb-4">
                  <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Palette className="w-3 h-3" /> Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={selectedTextOverlay.color}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { color: e.target.value })}
                      className="w-8 h-8 rounded border border-white/10 cursor-pointer bg-transparent" />
                    <Input value={selectedTextOverlay.color}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { color: e.target.value })}
                      className="flex-1 bg-white/10 border-white/10 text-white h-8 text-xs" />
                  </div>
                  <div className="flex gap-1 mt-2">
                    {["#ffffff", "#000000", "#ff4444", "#44aaff", "#44ff44", "#ffaa00"].map((c) => (
                      <button key={c} onClick={() => updateTextOverlay(selectedTextOverlay.id, { color: c })}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${selectedTextOverlay.color === c ? "border-primary scale-110" : "border-white/20"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>

                {/* Timing: Start */}
                <div className="mb-4">
                  <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Start Time (seconds)
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={Math.max(0, totalDuration - selectedTextOverlay.duration)} step={0.1}
                      value={selectedTextOverlay.start}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { start: Number(e.target.value) })}
                      className="flex-1 accent-primary" />
                    <Input type="number" min={0} max={totalDuration} step={0.1} value={selectedTextOverlay.start}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { start: Math.max(0, Number(e.target.value)) })}
                      className="w-16 bg-white/10 border-white/10 text-white h-8 text-xs text-center" />
                  </div>
                </div>

                {/* Timing: Duration */}
                <div className="mb-4">
                  <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Duration (seconds)
                  </label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0.5} max={30} step={0.1} value={selectedTextOverlay.duration}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { duration: Number(e.target.value) })}
                      className="flex-1 accent-primary" />
                    <Input type="number" min={0.5} max={30} step={0.1} value={selectedTextOverlay.duration}
                      onChange={(e) => updateTextOverlay(selectedTextOverlay.id, { duration: Math.max(0.5, Number(e.target.value)) })}
                      className="w-16 bg-white/10 border-white/10 text-white h-8 text-xs text-center" />
                  </div>
                </div>

                {/* Delete */}
                <Button variant="outline" size="sm"
                  onClick={() => removeTextOverlay(selectedTextOverlay.id)}
                  className="w-full bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs">
                  <Trash2 className="w-3 h-3 mr-1" /> Remove text
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
