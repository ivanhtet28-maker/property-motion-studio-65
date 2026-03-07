import { useState } from "react";
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

// Music categories and tracks
const MUSIC_CATEGORIES = ["All", "Cinematic", "Modern", "Energetic", "Classical", "Ambient"];
const MUSIC_TRACKS: { name: string; category: string; id: string }[] = [
  { name: "Horizon - Epic Journey", category: "Cinematic", id: "cinematic-epic-1" },
  { name: "Summit - Orchestral Rise", category: "Cinematic", id: "cinematic-epic-2" },
  { name: "Vast - Dramatic Sweep", category: "Cinematic", id: "cinematic-epic-3" },
  { name: "Asteroid - Modern & Chill", category: "Modern", id: "modern-chill-1" },
  { name: "Waves - Lo-fi Beats", category: "Modern", id: "modern-chill-2" },
  { name: "Sunset - Acoustic Vibes", category: "Modern", id: "modern-chill-3" },
  { name: "Pulse - Dance Pop", category: "Energetic", id: "upbeat-energetic-1" },
  { name: "Drive - Electronic", category: "Energetic", id: "upbeat-energetic-2" },
  { name: "Spark - Indie Rock", category: "Energetic", id: "upbeat-energetic-3" },
  { name: "Nocturne - Piano Solo", category: "Classical", id: "classical-elegant-1" },
  { name: "Adagio - String Quartet", category: "Classical", id: "classical-elegant-2" },
  { name: "Grace - Chamber Music", category: "Classical", id: "classical-elegant-3" },
  { name: "Drift - Ambient Tones", category: "Ambient", id: "ambient-relaxing-1" },
  { name: "Serenity - Nature Sounds", category: "Ambient", id: "ambient-relaxing-2" },
  { name: "Flow - Meditation", category: "Ambient", id: "ambient-relaxing-3" },
];

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
  previewImageUrl?: string;
  orientation: "portrait" | "landscape";
  onOrientationChange: (o: "portrait" | "landscape") => void;
}

export function StepBranding({
  settings,
  onChange,
  propertyDetails,
  previewImageUrl,
  orientation,
  onOrientationChange,
}: StepBrandingProps) {
  const [activeTab, setActiveTab] = useState("templates");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [musicCategory, setMusicCategory] = useState("All");
  const [musicSearch, setMusicSearch] = useState("");
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);

  const filteredTracks = MUSIC_TRACKS.filter((t) => {
    const matchesCategory = musicCategory === "All" || t.category === musicCategory;
    const matchesSearch = t.name.toLowerCase().includes(musicSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const selectedTemplate =
    INTRO_TEMPLATES.find((t) => t.id === settings.selectedTemplate) ||
    INTRO_TEMPLATES[0];

  const updateSettings = (partial: Partial<CustomizationSettings>) => {
    onChange({ ...settings, ...partial });
  };

  const updateAgent = (partial: Partial<AgentInfo>) => {
    onChange({ ...settings, agentInfo: { ...settings.agentInfo, ...partial } });
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Left: Icon tabs */}
      <div className="flex flex-col gap-2 pt-1">
        {[
          { id: "templates", icon: LayoutTemplate, label: "Templates" },
          { id: "music", icon: Music, label: "Music" },
          { id: "voiceover", icon: Mic, label: "Voiceover\nand Agent" },
        ].map((tab) => {
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
      <div className="flex-1 min-w-0">
        {/* Templates tab */}
        {activeTab === "templates" && (
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-primary" />
              Templates
            </h3>
            <p className="text-sm text-muted-foreground mt-1 mb-5">
              Customize your video with pre-built templates.
            </p>

            <div className="space-y-5">
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
              Select a track to feature in your video.
            </p>

            {/* Search + Upload */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search audio tracks..."
                  value={musicSearch}
                  onChange={(e) => setMusicSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Button variant="outline" size="sm" className="h-9">
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                Upload Audio
              </Button>
            </div>

            {/* Category pills */}
            <div className="flex gap-1.5 mb-4 flex-wrap">
              {MUSIC_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setMusicCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    musicCategory === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Track list */}
            <div className="space-y-0.5 max-h-[350px] overflow-y-auto">
              {filteredTracks.map((track) => {
                const isSelected = settings.musicTrack === track.name;
                const isPlaying = playingTrack === track.id;
                return (
                  <button
                    key={track.id}
                    onClick={() => updateSettings({ musicTrack: track.name })}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-accent"
                    }`}
                  >
                    <span>{track.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPlayingTrack(isPlaying ? null : track.id);
                      }}
                      className="p-1 hover:bg-accent rounded"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                  </button>
                );
              })}
            </div>
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
            {INTRO_TEMPLATES.map((template) => {
              const isSelected = settings.selectedTemplate === template.id;
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
