import { useState } from "react";
import { ChevronDown, Settings, Mic, Music, Palette, Play } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
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
  includeVoiceover: boolean;
  voiceType: string;
  musicStyle: string;
  musicTrack: string;
  selectedTemplate: string;
  agentInfo: AgentInfo;
}

const voiceOptions = [
  "Australian Male",
  "Australian Female",
  "British Male",
  "British Female",
  "American Male",
  "American Female",
];

const musicStyles = [
  "Cinematic & Epic",
  "Modern & Chill",
  "Upbeat & Energetic",
  "Classical Elegance",
  "Ambient Relaxing",
];

const musicTracks: Record<string, string[]> = {
  "Cinematic & Epic": ["Horizon - Epic Journey", "Summit - Orchestral Rise", "Vast - Dramatic Sweep"],
  "Modern & Chill": ["Asteroid - Modern & Chill", "Waves - Lo-fi Beats", "Sunset - Acoustic Vibes"],
  "Upbeat & Energetic": ["Pulse - Dance Pop", "Drive - Electronic", "Spark - Indie Rock"],
  "Classical Elegance": ["Nocturne - Piano Solo", "Adagio - String Quartet", "Grace - Chamber Music"],
  "Ambient Relaxing": ["Drift - Ambient Tones", "Serenity - Nature Sounds", "Flow - Meditation"],
};

interface CustomizationSectionProps {
  settings: CustomizationSettings;
  onChange: (settings: CustomizationSettings) => void;
}

export function CustomizationSection({ settings, onChange }: CustomizationSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPreviewingVoice, setIsPreviewingVoice] = useState(false);
  const [isPreviewingMusic, setIsPreviewingMusic] = useState(false);
  const [voiceAudio, setVoiceAudio] = useState<HTMLAudioElement | null>(null);
  const [musicAudio, setMusicAudio] = useState<HTMLAudioElement | null>(null);

  const currentTracks = musicTracks[settings.musicStyle] || [];

  const handlePreviewVoice = async () => {
    if (isPreviewingVoice) {
      // Stop current preview
      if (voiceAudio) {
        voiceAudio.pause();
        voiceAudio.currentTime = 0;
      }
      setIsPreviewingVoice(false);
      return;
    }

    setIsPreviewingVoice(true);

    try {
      // Get Supabase credentials from environment
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      // Call backend function directly with fetch to handle binary response
      const response = await fetch(`${supabaseUrl}/functions/v1/preview-voice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          voiceType: settings.voiceType,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate voice preview");
      }

      // Get audio blob from response
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      setVoiceAudio(audio);

      audio.onended = () => {
        setIsPreviewingVoice(false);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsPreviewingVoice(false);
        URL.revokeObjectURL(audioUrl);
        alert("Failed to play voice preview.");
      };

      await audio.play();
    } catch (error) {
      console.error("Voice preview error:", error);
      setIsPreviewingVoice(false);
      alert("Failed to preview voice. Please try again.");
    }
  };

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
      // Get the first track for the selected music style
      const firstTrack = currentTracks[0];
      if (!firstTrack) {
        throw new Error("No music track available for this style");
      }

      // For now, we'll use a placeholder URL
      // TODO: Upload actual music files to Supabase Storage and use real URLs
      console.log("Would play music:", settings.musicStyle, "-", firstTrack);

      // Simulate loading
      await new Promise(resolve => setTimeout(resolve, 500));

      setIsPreviewingMusic(false);
      alert("Music preview coming soon! Please select your preferred style and we'll include it in your video.");
    } catch (error) {
      console.error("Music preview error:", error);
      setIsPreviewingMusic(false);
      alert("Music preview not yet available.");
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
            />
          </div>

          {/* Voiceover Section */}
          <div className="space-y-4 p-4 bg-secondary/30 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Include Voiceover</Label>
              </div>
              <Switch
                checked={settings.includeVoiceover}
                onCheckedChange={(checked) =>
                  onChange({ ...settings, includeVoiceover: checked })
                }
              />
            </div>

            {settings.includeVoiceover && (
              <div className="space-y-3 pt-2">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Voice Type</Label>
                  <Select
                    value={settings.voiceType}
                    onValueChange={(value) => onChange({ ...settings, voiceType: value })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {voiceOptions.map((voice) => (
                        <SelectItem key={voice} value={voice}>
                          {voice}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handlePreviewVoice}
                  disabled={isPreviewingVoice}
                >
                  <Play className={`w-3 h-3 ${isPreviewingVoice ? "text-primary animate-pulse" : ""}`} />
                  {isPreviewingVoice ? "Playing..." : "Preview Voice Sample"}
                </Button>
              </div>
            )}
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
                disabled={isPreviewingMusic}
              >
                <Play className={`w-3 h-3 ${isPreviewingMusic ? "text-primary animate-pulse" : ""}`} />
                {isPreviewingMusic ? "Loading..." : "Preview Music"}
              </Button>
            </div>
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
