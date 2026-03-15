import { useState } from "react";
import { ChevronDown, Settings, Music, Palette, Play, Pause, Fingerprint, RefreshCw } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { MUSIC_LIBRARY } from "@/config/musicLibrary";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { VideoTemplateSelector } from "./VideoTemplateSelector";
import { AgentPhotoUpload } from "./AgentPhotoUpload";

export interface AgentInfo {
  photo: string | null;
  name: string;
  phone: string;
  email: string;
}

export interface CustomizationSettings {
  musicStyle: string;
  musicTrack: string;
  customAudioUrl: string | null; // URL of user-uploaded audio in Supabase Storage
  customAudioFile: File | null;  // Local file reference before upload
  musicTrimStart: number;        // Trim start in seconds
  musicTrimEnd: number;          // Trim end in seconds (0 = no trim)
  selectedTemplate: string;
  selectedLayout: string; // "bold-banner" | "warm-elegance" | "open-house"
  customTitle: string; // Custom title text (e.g., "Just Sold", "Open House")
  detailsText: string; // Free-text details shown on intro overlay
  outroTemplate: string; // "none" | "classic" | "classic-dark"
  outroText: string; // Custom outro text
  showProfilePhoto: boolean;
  showBrandLogo: boolean;
  brandLogo: string | null; // base64 brand logo
  agentInfo: AgentInfo;
  useGlobalSeed: boolean; // When true, all clips share a seed for consistent visual style
  globalSeed: number;     // The shared seed value (1–999999)
  customIntroImage: string | null; // base64 or URL of uploaded custom intro overlay image
  customOutroImage: string | null; // base64 or URL of uploaded custom outro overlay image
  landSizeUnit?: string; // "m²" | "sqft" | "acres" | "ha"
}

const musicStyles = [
  "Cinematic & Epic",
  "Modern & Chill",
  "Upbeat & Energetic",
  "Classical Elegance",
  "Ambient Relaxing",
];

const musicTracks: Record<string, string[]> = {
  "Cinematic & Epic": ["cinematic-epic-1", "cinematic-epic-2", "cinematic-epic-3"],
  "Modern & Chill": ["modern-chill-1", "modern-chill-2", "Lofi 2 .mp3"],
  "Upbeat & Energetic": ["upbeat-energetic-3.mp3", "Upbeat 1 .mp3", "Luxury 1.mp3"],
  "Classical Elegance": ["classical-elegant-1", "classical-elegant-2"],
  "Ambient Relaxing": ["ambient-relaxing-1", "ambient-relaxing-2"],
};

interface CustomizationSectionProps {
  settings: CustomizationSettings;
  onChange: (settings: CustomizationSettings) => void;
  previewImageUrl?: string;
  propertyDetails?: {
    streetAddress: string;
    suburb: string;
    state: string;
    price: string;
    bedrooms: number;
    bathrooms: number;
    carSpaces?: number;
    landSize?: string;
  };
}

export function CustomizationSection({ settings, onChange, previewImageUrl, propertyDetails }: CustomizationSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPreviewingMusic, setIsPreviewingMusic] = useState(false);
  const [musicAudio, setMusicAudio] = useState<HTMLAudioElement | null>(null);

  const currentTracks = musicTracks[settings.musicStyle] || [];

  const handlePreviewMusic = async () => {
    if (isPreviewingMusic) {
      // Stop current preview
      if (musicAudio) {
        musicAudio.pause();
        musicAudio.currentTime = 0;
      }
      setIsPreviewingMusic(false);
      return;
    }

    setIsPreviewingMusic(true);

    try {
      // Map music style to music library category
      const styleToCategoryMap: Record<string, string> = {
        "Cinematic & Epic": "cinematic-epic-1",
        "Modern & Chill": "modern-chill-1",
        "Upbeat & Energetic": "upbeat-energetic-1",
        "Classical Elegance": "classical-elegant-1",
        "Ambient Relaxing": "ambient-relaxing-1",
      };

      const musicId = styleToCategoryMap[settings.musicStyle];
      if (!musicId) {
        throw new Error("Music style not found");
      }

      const track = MUSIC_LIBRARY[musicId];
      if (!track) {
        throw new Error("Music track not available");
      }

      console.log("Playing music preview:", track.name, "from", track.url);

      // Create audio element and play
      const audio = new Audio(track.url);
      setMusicAudio(audio);

      audio.onended = () => {
        setIsPreviewingMusic(false);
      };

      audio.onerror = () => {
        setIsPreviewingMusic(false);
        console.error("Failed to load music file");
        alert("Music file not available. Please ensure music files are uploaded to Supabase Storage.");
      };

      // Play for 30 seconds preview
      await audio.play();
      setTimeout(() => {
        if (audio && !audio.paused) {
          audio.pause();
          audio.currentTime = 0;
          setIsPreviewingMusic(false);
        }
      }, 30000); // 30 second preview

    } catch (error) {
      console.error("Music preview error:", error);
      setIsPreviewingMusic(false);
      alert("Failed to preview music. Please try again.");
    }
  };

  return (
    <section className="space-y-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-secondary/50 rounded-xl hover:bg-secondary transition-colors">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Customize Details</h2>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4 space-y-6">
          {/* Video Template Selection */}
          <div className="p-4 bg-secondary/30 rounded-xl">
            <VideoTemplateSelector
              selectedTemplate={settings.selectedTemplate}
              onSelectTemplate={(templateId) =>
                onChange({ ...settings, selectedTemplate: templateId })
              }
              selectedLayout={settings.selectedLayout}
              onSelectLayout={(layoutId) =>
                onChange({ ...settings, selectedLayout: layoutId })
              }
              customTitle={settings.customTitle}
              onCustomTitleChange={(title) =>
                onChange({ ...settings, customTitle: title })
              }
              previewImageUrl={previewImageUrl}
              propertyDetails={propertyDetails}
            />
          </div>

          {/* Music Section */}
          <div className="space-y-4 p-4 bg-secondary/30 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Music className="w-4 h-4 text-muted-foreground" />
              <Label className="text-sm font-medium">Background Music</Label>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Music Style</Label>
                <Select
                  value={settings.musicStyle}
                  onValueChange={(value) =>
                    onChange({
                      ...settings,
                      musicStyle: value,
                      musicTrack: musicTracks[value]?.[0] || "",
                    })
                  }
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {musicStyles.map((style) => (
                      <SelectItem key={style} value={style}>
                        {style}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handlePreviewMusic}
              >
                {isPreviewingMusic ? (
                  <>
                    <Pause className="w-3 h-3 text-primary" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    Preview Music
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Consistency Seed Section */}
          <div className="space-y-4 p-4 bg-secondary/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Consistent Style (Seed)</Label>
              </div>
              <Switch
                checked={settings.useGlobalSeed}
                onCheckedChange={(checked) =>
                  onChange({ ...settings, useGlobalSeed: checked })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Lock a seed across all clips so Runway produces visually consistent output — same lighting style, color grading, and motion quality.
            </p>

            {settings.useGlobalSeed && (
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="number"
                  min={1}
                  max={999999}
                  value={settings.globalSeed}
                  onChange={(e) =>
                    onChange({ ...settings, globalSeed: Math.max(1, Math.min(999999, Number(e.target.value) || 1)) })
                  }
                  className="h-9 w-32 text-sm"
                  placeholder="Seed"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9"
                  onClick={() =>
                    onChange({ ...settings, globalSeed: Math.floor(Math.random() * 999999) + 1 })
                  }
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Randomize
                </Button>
              </div>
            )}
          </div>

          {/* Branding Section */}
          <div className="space-y-4 p-4 bg-secondary/30 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Branding</Label>
              </div>
              <span className="text-xs text-muted-foreground">Save as default</span>
            </div>

            {/* Agent Photo & Details */}
            <AgentPhotoUpload
              agentInfo={settings.agentInfo}
              onChange={(agentInfo) => onChange({ ...settings, agentInfo })}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
