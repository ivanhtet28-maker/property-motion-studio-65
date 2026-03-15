import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Type,
  Music,
  Clock,
  Palette,
  Download,
  Upload,
  Phone,
  Mail,
  User,
  MapPin,
  Sparkles,
  Volume2,
  Timer,
  Gauge,
  Image,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface StudioChanges {
  agent_name?: string;
  agent_phone?: string;
  agent_email?: string;
  agent_company?: string;
  property_address?: string;
  custom_title?: string;
  music_volume?: number;
  voiceover_volume?: number;
  music_fade_in?: number;
  music_fade_out?: number;
  video_speed?: number;
  clip_duration?: number;
  logo_url?: string;
  logo_position?: string;
  color_scheme?: string;
  font_family?: string;
  output_format?: string;
  resolution?: string;
  aspect_ratio?: string;
}

interface EditControlsProps {
  changes: StudioChanges;
  onChange: (changes: StudioChanges) => void;
  videoData: {
    agent_name?: string;
    agent_phone?: string;
    agent_email?: string;
    agent_company?: string;
    property_address?: string;
    template?: string;
    music_id?: string;
    voice_id?: string;
    duration?: number;
    aspect_ratio?: string;
  };
  disabled?: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const LOGO_POSITIONS = [
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
];

const COLOR_SCHEMES = [
  { value: "default", label: "Default", color: "#6366f1" },
  { value: "gold", label: "Gold", color: "#d97706" },
  { value: "emerald", label: "Emerald", color: "#059669" },
  { value: "rose", label: "Rose", color: "#e11d48" },
  { value: "slate", label: "Slate", color: "#475569" },
];

const FONT_FAMILIES = [
  { value: "arial", label: "Arial" },
  { value: "georgia", label: "Georgia" },
  { value: "helvetica", label: "Helvetica" },
  { value: "playfair", label: "Playfair Display" },
  { value: "montserrat", label: "Montserrat" },
];

const ASPECT_RATIOS = [
  { value: "9:16", label: "Portrait (9:16)" },
  { value: "16:9", label: "Landscape (16:9)" },
  { value: "1:1", label: "Square (1:1)" },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 10)}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function EditControls({
  changes,
  onChange,
  videoData,
  disabled,
}: EditControlsProps) {
  const update = useCallback(
    (partial: Partial<StudioChanges>) => {
      onChange({ ...changes, ...partial });
    },
    [changes, onChange],
  );

  const val = <K extends keyof StudioChanges>(key: K): StudioChanges[K] =>
    changes[key] ?? (videoData as Record<string, unknown>)[key] as StudioChanges[K];

  // Compute total duration display
  const clipDur = changes.clip_duration || 3.5;
  const speed = changes.video_speed || 1.0;
  const estimatedDuration = videoData.duration
    ? Math.round((videoData.duration / speed))
    : null;

  return (
    <Tabs defaultValue="text" className="flex-1 flex flex-col overflow-hidden">
      <TabsList className="grid grid-cols-5 mx-4 mt-4 mb-2 h-9 bg-secondary/50">
        <TabsTrigger value="text" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Type className="w-3 h-3" />
          Text
        </TabsTrigger>
        <TabsTrigger value="audio" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Music className="w-3 h-3" />
          Audio
        </TabsTrigger>
        <TabsTrigger value="timing" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Clock className="w-3 h-3" />
          Timing
        </TabsTrigger>
        <TabsTrigger value="brand" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Palette className="w-3 h-3" />
          Brand
        </TabsTrigger>
        <TabsTrigger value="export" className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
          <Download className="w-3 h-3" />
          Export
        </TabsTrigger>
      </TabsList>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* ── Text Tab ─────────────────────────────────────── */}
        <TabsContent value="text" className="mt-0 space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                Agent Name
              </label>
              <Input
                value={(val("agent_name") as string) || ""}
                onChange={(e) => update({ agent_name: e.target.value.slice(0, 30) })}
                placeholder="John Doe"
                maxLength={30}
                disabled={disabled}
                className="h-9"
              />
              <p className="text-[10px] text-muted-foreground text-right">
                {((val("agent_name") as string) || "").length}/30
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                Phone
              </label>
              <Input
                value={(val("agent_phone") as string) || ""}
                onChange={(e) => update({ agent_phone: formatPhone(e.target.value) })}
                placeholder="0412 345 678"
                disabled={disabled}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                Email
              </label>
              <Input
                value={(val("agent_email") as string) || ""}
                onChange={(e) => update({ agent_email: e.target.value })}
                placeholder="agent@agency.com"
                type="email"
                disabled={disabled}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                Property Address
              </label>
              <Input
                value={(val("property_address") as string) || ""}
                onChange={(e) => update({ property_address: e.target.value })}
                placeholder="123 Main St, Sydney"
                disabled={disabled}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
                Custom Title / Tagline
              </label>
              <Input
                value={(val("custom_title") as string) || ""}
                onChange={(e) => update({ custom_title: e.target.value })}
                placeholder="Just Listed! Open House Saturday"
                disabled={disabled}
                className="h-9"
              />
            </div>
          </div>
        </TabsContent>

        {/* ── Audio Tab ────────────────────────────────────── */}
        <TabsContent value="audio" className="mt-0 space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
              Music Volume
            </label>
            <div className="flex items-center gap-3">
              <Slider
                min={0}
                max={100}
                step={1}
                value={[changes.music_volume ?? 80]}
                onValueChange={([v]) => update({ music_volume: v })}
                disabled={disabled}
              />
              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                {changes.music_volume ?? 80}%
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
              Voiceover Volume
            </label>
            <div className="flex items-center gap-3">
              <Slider
                min={0}
                max={100}
                step={1}
                value={[changes.voiceover_volume ?? 100]}
                onValueChange={([v]) => update({ voiceover_volume: v })}
                disabled={disabled}
              />
              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                {changes.voiceover_volume ?? 100}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Fade In</label>
              <div className="flex items-center gap-2">
                <Slider
                  min={0}
                  max={3}
                  step={0.5}
                  value={[changes.music_fade_in ?? 1]}
                  onValueChange={([v]) => update({ music_fade_in: v })}
                  disabled={disabled}
                />
                <span className="text-xs text-muted-foreground tabular-nums w-6">{changes.music_fade_in ?? 1}s</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Fade Out</label>
              <div className="flex items-center gap-2">
                <Slider
                  min={0}
                  max={3}
                  step={0.5}
                  value={[changes.music_fade_out ?? 2]}
                  onValueChange={([v]) => update({ music_fade_out: v })}
                  disabled={disabled}
                />
                <span className="text-xs text-muted-foreground tabular-nums w-6">{changes.music_fade_out ?? 2}s</span>
              </div>
            </div>
          </div>

          {videoData.music_id && (
            <div className="rounded-lg bg-secondary/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">Current track</p>
              <p className="text-sm font-medium text-foreground">{videoData.music_id}</p>
            </div>
          )}
        </TabsContent>

        {/* ── Timing Tab ───────────────────────────────────── */}
        <TabsContent value="timing" className="mt-0 space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-muted-foreground" />
              Video Speed
            </label>
            <div className="flex items-center gap-3">
              <Slider
                min={0.8}
                max={1.5}
                step={0.1}
                value={[changes.video_speed ?? 1.0]}
                onValueChange={([v]) => update({ video_speed: Math.round(v * 10) / 10 })}
                disabled={disabled}
              />
              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                {(changes.video_speed ?? 1.0).toFixed(1)}x
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-muted-foreground" />
              Clip Duration (per image)
            </label>
            <div className="flex items-center gap-3">
              <Slider
                min={2}
                max={5}
                step={0.5}
                value={[changes.clip_duration ?? 3.5]}
                onValueChange={([v]) => update({ clip_duration: v })}
                disabled={disabled}
              />
              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                {(changes.clip_duration ?? 3.5).toFixed(1)}s
              </span>
            </div>
          </div>

          {estimatedDuration && (
            <div className="rounded-lg bg-secondary/50 px-3 py-2.5 space-y-1">
              <p className="text-xs text-muted-foreground">Estimated Total Duration</p>
              <p className="text-lg font-semibold text-foreground tabular-nums">
                {Math.floor(estimatedDuration / 60)}:{String(estimatedDuration % 60).padStart(2, "0")}
              </p>
            </div>
          )}
        </TabsContent>

        {/* ── Branding Tab ─────────────────────────────────── */}
        <TabsContent value="brand" className="mt-0 space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5 text-muted-foreground" />
              Logo
            </label>
            <LogoUpload
              logoUrl={changes.logo_url}
              onUpload={(url) => update({ logo_url: url })}
              disabled={disabled}
            />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground">Logo Position</label>
            <div className="grid grid-cols-2 gap-2">
              {LOGO_POSITIONS.map((pos) => (
                <button
                  key={pos.value}
                  onClick={() => update({ logo_position: pos.value })}
                  disabled={disabled}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    (changes.logo_position || "bottom-right") === pos.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground hover:bg-accent"
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground">Color Scheme</label>
            <div className="flex gap-2">
              {COLOR_SCHEMES.map((scheme) => (
                <button
                  key={scheme.value}
                  onClick={() => update({ color_scheme: scheme.value })}
                  disabled={disabled}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                    (changes.color_scheme || "default") === scheme.value
                      ? "ring-2 ring-primary bg-primary/10"
                      : "hover:bg-secondary"
                  }`}
                  title={scheme.label}
                >
                  <div
                    className="w-6 h-6 rounded-full border-2 border-white/20"
                    style={{ backgroundColor: scheme.color }}
                  />
                  <span className="text-[10px] text-muted-foreground">{scheme.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground">Font Family</label>
            <div className="space-y-1">
              {FONT_FAMILIES.map((font) => (
                <button
                  key={font.value}
                  onClick={() => update({ font_family: font.value })}
                  disabled={disabled}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    (changes.font_family || "arial") === font.value
                      ? "bg-primary/10 ring-1 ring-primary text-foreground"
                      : "hover:bg-secondary text-foreground"
                  }`}
                  style={{ fontFamily: font.value }}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Export Tab ────────────────────────────────────── */}
        <TabsContent value="export" className="mt-0 space-y-5">
          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground">Format</label>
            <div className="flex gap-2">
              {["mp4", "webm"].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => update({ output_format: fmt })}
                  disabled={disabled}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium uppercase transition-colors ${
                    (changes.output_format || "mp4") === fmt
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground hover:bg-accent"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground">Resolution</label>
            <div className="flex gap-2">
              {[
                { value: "hd", label: "1080p" },
                { value: "4k", label: "4K" },
              ].map((res) => (
                <button
                  key={res.value}
                  onClick={() => update({ resolution: res.value })}
                  disabled={disabled}
                  className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    (changes.resolution || "hd") === res.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-foreground hover:bg-accent"
                  }`}
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-foreground">Aspect Ratio</label>
            <div className="space-y-1">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar.value}
                  onClick={() => update({ aspect_ratio: ar.value })}
                  disabled={disabled}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    (changes.aspect_ratio || videoData.aspect_ratio || "9:16") === ar.value
                      ? "bg-primary/10 ring-1 ring-primary text-foreground"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  {ar.label}
                </button>
              ))}
            </div>
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
}

// ── Logo Upload Sub-Component ──────────────────────────────────────────────

function LogoUpload({
  logoUrl,
  onUpload,
  disabled,
}: {
  logoUrl?: string;
  onUpload: (url: string) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(logoUrl || null);

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      setPreview(url);
      onUpload(url);
    },
    [onUpload],
  );

  return (
    <label className="block cursor-pointer">
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFile}
        disabled={disabled}
      />
      {preview ? (
        <div className="w-full h-20 rounded-lg border border-border bg-secondary/30 flex items-center justify-center overflow-hidden">
          <img src={preview} alt="Logo" className="max-h-full max-w-full object-contain p-2" />
        </div>
      ) : (
        <div className="w-full h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 transition-colors">
          <Upload className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Upload logo</span>
        </div>
      )}
    </label>
  );
}
