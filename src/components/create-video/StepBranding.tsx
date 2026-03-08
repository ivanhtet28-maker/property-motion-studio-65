import { useState, useRef, useEffect, useCallback } from "react";
import {
  LayoutTemplate,
  Music,
  Mic,
  Play,
  Pause,
  Smartphone,
  Monitor,
  Search,
  Upload,
  X,
  MapPin,
  Scissors,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PropertyDetailsForm } from "./PropertyDetailsForm";
import type { CustomizationSettings, AgentInfo } from "./CustomizationSection";
import type { PropertyDetails } from "./PropertyDetailsForm";

// Template options
const INTRO_TEMPLATES = [
  { id: "none", name: "None" },
  { id: "big-bold", name: "Big and Bold" },
  { id: "white-on-black", name: "White on Black" },
  { id: "simple-white", name: "Simple White" },
  { id: "newly-listed", name: "Newly Listed" },
  { id: "open-house", name: "Open House" },
  { id: "modern-treehouse", name: "Modern Treehouse" },
];

// All music tracks — IDs and filenames match actual Supabase Storage files
// Storage bucket: video-assets/music/
const MUSIC_TRACKS: { name: string; id: string; filename: string; duration: string }[] = [
  // Cinematic
  { name: "Horizon - Epic Journey", id: "cinematic-epic-1", filename: "cinematic-epic-1", duration: "2:45" },
  { name: "Summit - Orchestral Rise", id: "cinematic-epic-2", filename: "cinematic-epic-2", duration: "3:12" },
  { name: "Grand Estate - Dramatic Reveal", id: "cinematic-epic-3", filename: "cinematic-epic-3", duration: "2:30" },
  { name: "Luxury Showcase", id: "luxury-1", filename: "Luxury 1.mp3", duration: "2:58" },
  // Modern
  { name: "Daylight - Acoustic Pop", id: "modern-chill-1", filename: "modern-chill-1", duration: "2:40" },
  { name: "Waves - Lo-fi Beats", id: "modern-chill-2", filename: "modern-chill-2", duration: "2:55" },
  { name: "Lofi Chill Beats", id: "lofi-2", filename: "Lofi 2 .mp3", duration: "3:00" },
  // Energetic
  { name: "Welcome Home - Feel Good", id: "upbeat-energetic-3", filename: "upbeat-energetic-3.mp3", duration: "2:42" },
  { name: "Upbeat Energy", id: "upbeat-1", filename: "Upbeat 1 .mp3", duration: "2:35" },
  // Classical
  { name: "Nocturne - Piano Solo", id: "classical-elegant-1", filename: "classical-elegant-1", duration: "3:20" },
  { name: "Adagio - String Quartet", id: "classical-elegant-2", filename: "classical-elegant-2", duration: "3:45" },
  // Ambient
  { name: "Drift - Ambient Tones", id: "ambient-relaxing-1", filename: "ambient-relaxing-1", duration: "3:00" },
  { name: "Serenity - Soft Pads", id: "ambient-relaxing-2", filename: "ambient-relaxing-2", duration: "3:25" },
];

const MUSIC_BASE_URL =
  "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music";

/** Convert "M:SS" to seconds */
function parseDuration(d: string): number {
  const [m, s] = d.split(":").map(Number);
  return m * 60 + s;
}

/** Format seconds to M:SS */
function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const VOICE_OPTIONS = [
  "Australian Male",
  "Australian Female",
  "British Male",
  "British Female",
  "American Male",
  "American Female",
];

interface StepBrandingProps {
  settings: CustomizationSettings;
  onChange: (settings: CustomizationSettings) => void;
  propertyDetails: PropertyDetails;
  onPropertyDetailsChange: (details: PropertyDetails) => void;
  previewImageUrl?: string;
  orientation: "portrait" | "landscape";
  onOrientationChange: (o: "portrait" | "landscape") => void;
}

export function StepBranding({
  settings,
  onChange,
  propertyDetails,
  onPropertyDetailsChange,
  previewImageUrl,
  orientation,
  onOrientationChange,
}: StepBrandingProps) {
  const [activeTab, setActiveTab] = useState("property");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [musicSearch, setMusicSearch] = useState("");
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<{ id: string; name: string; previewUrl: string }[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredTracks = MUSIC_TRACKS.filter((t) =>
    t.name.toLowerCase().includes(musicSearch.toLowerCase())
  );

  // Get the audio URL for a track (library or custom upload)
  const getTrackAudioUrl = useCallback((trackId: string): string | null => {
    if (trackId === "custom-upload" && settings.customAudioFile) {
      return URL.createObjectURL(settings.customAudioFile);
    }
    const track = MUSIC_TRACKS.find((t) => t.id === trackId);
    if (track) return `${MUSIC_BASE_URL}/${encodeURIComponent(track.filename)}`;
    return null;
  }, [settings.customAudioFile]);

  // Handle play/pause with real audio
  useEffect(() => {
    if (!playingTrack) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      return;
    }
    const url = getTrackAudioUrl(playingTrack);
    if (!url) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => setPlayingTrack(null));
    audio.onended = () => setPlayingTrack(null);
    return () => {
      audio.pause();
      audio.onended = null;
    };
  }, [playingTrack, getTrackAudioUrl]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Handle custom audio upload
  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Get audio duration
    const tempAudio = new Audio(URL.createObjectURL(file));
    tempAudio.onloadedmetadata = () => {
      setAudioDuration(tempAudio.duration);
      updateSettings({
        musicTrack: file.name.replace(/\.[^.]+$/, ""),
        customAudioFile: file,
        customAudioUrl: null, // Will be uploaded during generation
        musicTrimStart: 0,
        musicTrimEnd: Math.floor(tempAudio.duration),
      });
    };

    if (audioInputRef.current) audioInputRef.current.value = "";
  };

  // Remove custom audio
  const handleRemoveCustomAudio = () => {
    updateSettings({
      musicTrack: "",
      customAudioFile: null,
      customAudioUrl: null,
      musicTrimStart: 0,
      musicTrimEnd: 0,
    });
    setAudioDuration(0);
    setPlayingTrack(null);
  };

  const allTemplates = [
    ...INTRO_TEMPLATES,
    ...customTemplates.map((t) => ({ id: t.id, name: t.name })),
  ];

  const selectedTemplate =
    allTemplates.find((t) => t.id === settings.selectedTemplate) ||
    INTRO_TEMPLATES[0];

  const updateSettings = (partial: Partial<CustomizationSettings>) => {
    onChange({ ...settings, ...partial });
  };

  const updateAgent = (partial: Partial<AgentInfo>) => {
    onChange({ ...settings, agentInfo: { ...settings.agentInfo, ...partial } });
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const name = file.name.replace(/\.[^.]+$/, "");
      setCustomTemplates((prev) => [...prev, { id, name, previewUrl: url }]);
      updateSettings({ selectedTemplate: id, selectedLayout: id });
    });

    // Reset input
    if (templateInputRef.current) templateInputRef.current.value = "";
  };

  const TAB_LIST = [
    { id: "property", icon: MapPin, label: "Property" },
    { id: "templates", icon: LayoutTemplate, label: "Templates" },
    { id: "music", icon: Music, label: "Music" },
    { id: "voiceover", icon: Mic, label: "Voiceover\nand Agent" },
  ];

  return (
    <div className="flex gap-6 h-full">
      {/* Left: Icon tabs */}
      <div className="flex flex-col gap-2 pt-1">
        {TAB_LIST.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center gap-1 w-16 py-3 rounded-xl text-center transition-colors ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  active ? "bg-primary text-primary-foreground" : "bg-secondary"
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-medium leading-tight whitespace-pre-line">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Center: Settings panel */}
      <div className="flex-1 min-w-0 overflow-y-auto max-h-[calc(100vh-200px)]">
        {/* Property tab */}
        {activeTab === "property" && (
          <div>
            <PropertyDetailsForm
              details={propertyDetails}
              onChange={onPropertyDetailsChange}
            />
          </div>
        )}

        {/* Templates tab */}
        {activeTab === "templates" && (
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-primary" />
              Templates
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Customize your video with pre-built templates or upload your own.
            </p>

            <div className="space-y-5">
              {/* Upload template */}
              <div>
                <input
                  ref={templateInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleTemplateUpload}
                  multiple
                />
                <Button
                  variant="outline"
                  className="w-full h-12 border-dashed"
                  onClick={() => templateInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload custom template
                </Button>
              </div>

              {/* Custom templates */}
              {customTemplates.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Your templates</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {customTemplates.map((ct) => {
                      const isSelected = settings.selectedTemplate === ct.id;
                      return (
                        <button
                          key={ct.id}
                          onClick={() =>
                            updateSettings({
                              selectedTemplate: ct.id,
                              selectedLayout: ct.id,
                            })
                          }
                          className={`rounded-lg border-2 overflow-hidden transition-all ${
                            isSelected
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className="aspect-video bg-secondary">
                            <img
                              src={ct.previewUrl}
                              alt={ct.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="p-1.5 flex items-center justify-between">
                            <p className="text-[11px] font-medium text-foreground truncate">
                              {ct.name}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setCustomTemplates((prev) =>
                                  prev.filter((t) => t.id !== ct.id)
                                );
                                if (settings.selectedTemplate === ct.id) {
                                  updateSettings({
                                    selectedTemplate: "none",
                                    selectedLayout: "none",
                                  });
                                }
                              }}
                              className="p-0.5 rounded hover:bg-accent"
                            >
                              <X className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Template style */}
              <div>
                <Label className="text-sm font-medium">Template style</Label>
                <Tabs defaultValue="intro" className="mt-2">
                  <TabsList className="h-9">
                    <TabsTrigger value="intro" className="text-xs">
                      Intro
                    </TabsTrigger>
                    <TabsTrigger value="outro" className="text-xs">
                      Outro
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="intro" className="mt-3">
                    <button
                      onClick={() => setShowTemplateModal(true)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm text-left flex items-center justify-between hover:bg-accent/50 transition-colors"
                    >
                      <span>{selectedTemplate.name}</span>
                      <svg className="w-3 h-3 text-muted-foreground" viewBox="0 0 10 12" fill="none">
                        <path d="M3 1L7 6L3 11" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </TabsContent>
                  <TabsContent value="outro" className="mt-3">
                    <p className="text-sm text-muted-foreground">
                      Outro uses your agent branding automatically.
                    </p>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Heading */}
              <div>
                <Label htmlFor="heading">Heading</Label>
                <Input
                  id="heading"
                  placeholder="OPEN HOUSE"
                  value={settings.customTitle}
                  onChange={(e) => updateSettings({ customTitle: e.target.value })}
                  className="mt-1.5 h-10"
                />
              </div>

              {/* Details */}
              <div>
                <Label htmlFor="details">Details</Label>
                <Textarea
                  id="details"
                  placeholder="03.14.2026 | 2PM&#10;123 Anywhere St, Any City"
                  value={`${propertyDetails.price ? propertyDetails.price + "\n" : ""}${propertyDetails.streetAddress}${propertyDetails.suburb ? ", " + propertyDetails.suburb : ""}`}
                  readOnly
                  rows={3}
                  className="mt-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Music tab */}
        {activeTab === "music" && (
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Music className="w-4 h-4 text-primary" />
              Music
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Select a track or upload your own audio.
            </p>

            {/* Upload audio button */}
            <div className="mb-4">
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleAudioUpload}
              />
              {settings.customAudioFile ? (
                <div className="border border-primary/30 bg-primary/5 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Volume2 className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-sm font-medium text-primary truncate">
                        {settings.customAudioFile.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() =>
                          setPlayingTrack(
                            playingTrack === "custom-upload" ? null : "custom-upload"
                          )
                        }
                        className="p-1 hover:bg-accent rounded"
                      >
                        {playingTrack === "custom-upload" ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={handleRemoveCustomAudio}
                        className="p-1 hover:bg-accent rounded"
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  {/* Trim controls */}
                  {audioDuration > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/50">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Scissors className="w-3 h-3" />
                        <span>Trim audio</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground block mb-1">
                            Start: {formatTime(settings.musicTrimStart)}
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={Math.max(0, (settings.musicTrimEnd || audioDuration) - 1)}
                            step={1}
                            value={settings.musicTrimStart}
                            onChange={(e) =>
                              updateSettings({ musicTrimStart: Number(e.target.value) })
                            }
                            className="w-full h-1.5 accent-primary"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground block mb-1">
                            End: {formatTime(settings.musicTrimEnd || audioDuration)}
                          </label>
                          <input
                            type="range"
                            min={settings.musicTrimStart + 1}
                            max={Math.floor(audioDuration)}
                            step={1}
                            value={settings.musicTrimEnd || Math.floor(audioDuration)}
                            onChange={(e) =>
                              updateSettings({ musicTrimEnd: Number(e.target.value) })
                            }
                            className="w-full h-1.5 accent-primary"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground text-right">
                        Duration: {formatTime((settings.musicTrimEnd || audioDuration) - settings.musicTrimStart)}
                        {" / "}
                        {formatTime(audioDuration)}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-12 border-dashed"
                  onClick={() => audioInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload your own audio
                </Button>
              )}
            </div>

            {/* Divider */}
            {!settings.customAudioFile && (
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">or choose a track</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {/* Search */}
            {!settings.customAudioFile && (
              <>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search audio tracks..."
                    value={musicSearch}
                    onChange={(e) => setMusicSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>

                {/* Track list — flat, no categories */}
                <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
                  {filteredTracks.map((track) => {
                    const isSelected =
                      settings.musicTrack === track.name && !settings.customAudioFile;
                    const isPlaying = playingTrack === track.id;
                    return (
                      <button
                        key={track.id}
                        onClick={() =>
                          updateSettings({
                            musicTrack: track.name,
                            customAudioFile: null,
                            customAudioUrl: null,
                            musicTrimStart: 0,
                            musicTrimEnd: 0,
                          })
                        }
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                          isSelected
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlayingTrack(isPlaying ? null : track.id);
                            }}
                            className="p-1 hover:bg-accent rounded flex-shrink-0"
                          >
                            {isPlaying ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </button>
                          <span className="truncate">{track.name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                          {track.duration}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Voiceover & Agent tab */}
        {activeTab === "voiceover" && (
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Mic className="w-4 h-4 text-primary" />
              Voiceover & Agent
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Configure voiceover and agent branding for the video.
            </p>

            <div className="space-y-5">
              {/* Voiceover toggle */}
              <div className="flex items-center justify-between">
                <Label>Include voiceover</Label>
                <Switch
                  checked={settings.includeVoiceover}
                  onCheckedChange={(v) => updateSettings({ includeVoiceover: v })}
                />
              </div>

              {settings.includeVoiceover && (
                <div>
                  <Label>Voice type</Label>
                  <Select
                    value={settings.voiceType}
                    onValueChange={(v) => updateSettings({ voiceType: v })}
                  >
                    <SelectTrigger className="mt-1.5 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICE_OPTIONS.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Agent info */}
              <div className="border-t border-border pt-5">
                <h4 className="text-sm font-semibold text-foreground mb-3">
                  Agent branding
                </h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="agent-name">Name *</Label>
                    <Input
                      id="agent-name"
                      placeholder="John Smith"
                      value={settings.agentInfo.name}
                      onChange={(e) => updateAgent({ name: e.target.value })}
                      className="mt-1 h-10"
                    />
                  </div>
                  <div>
                    <Label htmlFor="agent-phone">Phone *</Label>
                    <Input
                      id="agent-phone"
                      placeholder="0412 345 678"
                      value={settings.agentInfo.phone}
                      onChange={(e) => updateAgent({ phone: e.target.value })}
                      className="mt-1 h-10"
                    />
                  </div>
                  <div>
                    <Label htmlFor="agent-email">Email</Label>
                    <Input
                      id="agent-email"
                      type="email"
                      placeholder="john@agency.com"
                      value={settings.agentInfo.email}
                      onChange={(e) => updateAgent({ email: e.target.value })}
                      className="mt-1 h-10"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: Preview */}
      <div className="w-[360px] flex-shrink-0">
        <div className="text-center mb-4">
          <h3 className="text-sm font-semibold text-foreground">Preview</h3>
          <p className="text-xs text-muted-foreground">
            Preview your video with the current settings.
          </p>
          {/* Orientation toggle */}
          <div className="inline-flex items-center border border-border rounded-lg overflow-hidden mt-3">
            <button
              onClick={() => onOrientationChange("portrait")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                orientation === "portrait"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Smartphone className="w-3 h-3" />
              Portrait
            </button>
            <button
              onClick={() => onOrientationChange("landscape")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                orientation === "landscape"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="w-3 h-3" />
              Landscape
            </button>
          </div>
        </div>

        {/* Preview image */}
        <div
          className={`bg-secondary rounded-lg overflow-hidden border border-border mx-auto ${
            orientation === "portrait" ? "w-[200px] aspect-[9/16]" : "w-full aspect-video"
          }`}
        >
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
              No images selected
            </div>
          )}
        </div>

        {/* Summary tags */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground">
            <LayoutTemplate className="w-3 h-3" />
            Intro: <span className="text-primary font-medium">{selectedTemplate.name}</span>
            &nbsp;Outro: <span className="text-primary font-medium">Agent</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-border rounded-lg text-xs text-muted-foreground">
            <Music className="w-3 h-3" />
            Music: <span className="text-primary font-medium">{settings.musicTrack || "None"}</span>
          </div>
        </div>
      </div>

      {/* Template selection modal */}
      <Dialog open={showTemplateModal} onOpenChange={setShowTemplateModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4" />
              Select intro template
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4 mt-2">
            {allTemplates.map((template) => {
              const isSelected = settings.selectedTemplate === template.id;
              const customPreview = customTemplates.find((c) => c.id === template.id)?.previewUrl;
              return (
                <button
                  key={template.id}
                  onClick={() => {
                    updateSettings({
                      selectedTemplate: template.id,
                      selectedLayout: template.id,
                    });
                    setShowTemplateModal(false);
                  }}
                  className={`rounded-xl border-2 overflow-hidden transition-all ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="aspect-video bg-secondary flex items-center justify-center">
                    {template.id === "none" ? (
                      <X className="w-8 h-8 text-muted-foreground" />
                    ) : customPreview ? (
                      <img
                        src={customPreview}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    ) : previewImageUrl ? (
                      <img
                        src={previewImageUrl}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="p-2 text-center">
                    <p className="text-xs font-medium text-foreground">{template.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
