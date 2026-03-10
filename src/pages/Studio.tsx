import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

// ─── Template data ───────────────────────────────────
const TEMPLATES = [
  { id: "modern-treehouse", name: "Modern Treehouse" },
  { id: "apartment-for-sale", name: "Apartment For Sale, Contact" },
  { id: "open-house-blue", name: "Open House Blue Banner" },
  { id: "big-bold", name: "Big and Bold" },
  { id: "simple-white", name: "Simple White" },
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
  const [videoTitle, setVideoTitle] = useState("Untitled video");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("template");

  // Template
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateType, setTemplateType] = useState<"intro" | "outro">("intro");
  const [selectedTemplate, setSelectedTemplate] = useState("open-house-blue");

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

  // Load video data
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

        // Build timeline clips from stored data
        const imageUrls: string[] = [];
        if (data.photos) {
          try {
            const parsed = JSON.parse(data.photos);
            if (parsed.imageUrls) imageUrls.push(...parsed.imageUrls);
          } catch { /* ignore */ }
        }

        if (imageUrls.length > 0) {
          setClips(
            imageUrls.map((url, i) => ({
              id: `clip-${i}`,
              type: "image" as const,
              src: url,
              duration: 3.5,
              label: url.split("/").pop()?.substring(0, 20) || `Clip ${i + 1}`,
            }))
          );
        } else {
          // Fallback placeholder clips
          setClips(
            Array.from({ length: 5 }, (_, i) => ({
              id: `clip-${i}`,
              type: "image" as const,
              src: data.thumbnail_url || "",
              duration: 3,
              label: `Scene ${i + 1}`,
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load video:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user]);

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

  const handleRender = () => {
    toast({ title: "Rendering video...", description: "This may take a few minutes." });
  };

  const filteredTemplates = TEMPLATES.filter((t) =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const filteredTracks = MUSIC_TRACKS.filter((t) =>
    t.toLowerCase().includes(musicSearch.toLowerCase())
  );

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

        <Button
          variant="hero"
          size="sm"
          onClick={handleRender}
          className="text-xs"
        >
          Render Video
        </Button>
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
                Add photos or videos to the timeline. No image-to-video generation in Studio mode.
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
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                    onClick={() => setSelectedClip(clip.id)}
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
              {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/20">
                  <Play className="w-16 h-16" />
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
              onClick={() => setIsPlaying(!isPlaying)}
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
              {String(Math.floor(currentTime % 60)).padStart(2, "0")}.00 /{" "}
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

            {/* Tracks */}
            <div className="py-1">
              {/* Video track labels */}
              {["Video", "Text", "Audio", "Overlay", "Stickers"].map((trackName, trackIdx) => (
                <div key={trackName} className="flex items-center h-7 border-b border-white/5">
                  <div className="w-8 flex-shrink-0 flex items-center justify-center">
                    <GripVertical className="w-3 h-3 text-white/20" />
                  </div>
                  <div className="flex-1 relative h-full">
                    {/* Render clips on video track */}
                    {trackIdx === 0 && (
                      <div className="absolute inset-0 flex items-center gap-px">
                        {clips.map((clip) => (
                          <div
                            key={clip.id}
                            onClick={() => setSelectedClip(clip.id)}
                            className={`h-5 rounded-sm flex items-center px-1.5 text-[9px] font-medium cursor-pointer transition-colors flex-shrink-0 ${
                              selectedClip === clip.id
                                ? "bg-primary ring-1 ring-primary"
                                : "bg-pink-600/80 hover:bg-pink-500/80"
                            }`}
                            style={{ width: `${clip.duration * zoom * 2}px` }}
                          >
                            <span className="truncate text-white">{clip.label}</span>
                          </div>
                        ))}
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
