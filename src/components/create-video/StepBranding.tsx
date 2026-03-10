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
  Scissors,
  Volume2,
  Ban,
  ImageIcon,
  Pencil,
  User,
  BedDouble,
  Bath,
  Car,
  Ruler,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// Intro template options
const INTRO_TEMPLATES = [
  { id: "none", name: "None" },
  { id: "custom", name: "Custom Upload" },
  { id: "open-house", name: "Open House" },
  { id: "newly-listed", name: "Newly Listed" },
  { id: "elegant-classic", name: "Elegant Classic" },
  { id: "modern-luxe", name: "Modern Luxe" },
  { id: "minimal-focus", name: "Minimal Focus" },
  { id: "big-bold", name: "Big and Bold" },
  { id: "white-on-black", name: "White on Black" },
  { id: "simple-white", name: "Simple White" },
  { id: "modern-treehouse", name: "Modern Treehouse" },
  { id: "warm-elegance", name: "Warm Elegance" },
];

// Outro template options
const OUTRO_TEMPLATES = [
  { id: "none", name: "None" },
  { id: "custom", name: "Custom Upload" },
  { id: "classic", name: "Classic" },
  { id: "classic-dark", name: "Classic Dark" },
];

// All music tracks — IDs and filenames match actual Supabase Storage files
// Storage bucket: video-assets/music/
const MUSIC_TRACKS: { name: string; id: string; filename: string; duration: string }[] = [
  { name: "ambient-relaxing-1", id: "ambient-relaxing-1", filename: "ambient-relaxing-1", duration: "3:00" },
  { name: "ambient-relaxing-2", id: "ambient-relaxing-2", filename: "ambient-relaxing-2", duration: "3:25" },
  { name: "cinematic-epic-1", id: "cinematic-epic-1", filename: "cinematic-epic-1", duration: "2:45" },
  { name: "cinematic-epic-2", id: "cinematic-epic-2", filename: "cinematic-epic-2", duration: "3:12" },
  { name: "cinematic-epic-3", id: "cinematic-epic-3", filename: "cinematic-epic-3", duration: "2:30" },
  { name: "classical-elegant-1", id: "classical-elegant-1", filename: "classical-elegant-1", duration: "3:20" },
  { name: "classical-elegant-2", id: "classical-elegant-2", filename: "classical-elegant-2", duration: "3:45" },
  { name: "Lofi 2 .mp3", id: "lofi-2", filename: "Lofi 2 .mp3", duration: "3:00" },
  { name: "Luxury 1.mp3", id: "luxury-1", filename: "Luxury 1.mp3", duration: "2:58" },
  { name: "modern-chill-1", id: "modern-chill-1", filename: "modern-chill-1", duration: "2:40" },
  { name: "modern-chill-2", id: "modern-chill-2", filename: "modern-chill-2", duration: "2:55" },
  { name: "Upbeat 1 .mp3", id: "upbeat-1", filename: "Upbeat 1 .mp3", duration: "2:35" },
  { name: "upbeat-energetic-3.mp3", id: "upbeat-energetic-3", filename: "upbeat-energetic-3.mp3", duration: "2:42" },
];

const MUSIC_BASE_URL =
  "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/video-assets/music";

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
  lastImageUrl?: string;
  orientation: "portrait" | "landscape";
  onOrientationChange: (o: "portrait" | "landscape") => void;
}

export function StepBranding({
  settings,
  onChange,
  propertyDetails,
  onPropertyDetailsChange,
  previewImageUrl,
  lastImageUrl,
  orientation,
  onOrientationChange,
}: StepBrandingProps) {
  const [activeTab, setActiveTab] = useState("templates");
  const [templateStyleTab, setTemplateStyleTab] = useState<"intro" | "outro">("intro");
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [showOutroModal, setShowOutroModal] = useState(false);
  const [previewFocus, setPreviewFocus] = useState<"intro" | "outro">("intro");
  const [musicSearch, setMusicSearch] = useState("");
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const brandLogoInputRef = useRef<HTMLInputElement>(null);

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

    const tempAudio = new Audio(URL.createObjectURL(file));
    tempAudio.onloadedmetadata = () => {
      setAudioDuration(tempAudio.duration);
      updateSettings({
        musicTrack: file.name.replace(/\.[^.]+$/, ""),
        customAudioFile: file,
        customAudioUrl: null,
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

  const selectedIntroTemplate =
    INTRO_TEMPLATES.find((t) => t.id === settings.selectedTemplate) ||
    INTRO_TEMPLATES[0];

  const selectedOutroTemplate =
    OUTRO_TEMPLATES.find((t) => t.id === settings.outroTemplate) ||
    OUTRO_TEMPLATES[0];

  const updateSettings = (partial: Partial<CustomizationSettings>) => {
    onChange({ ...settings, ...partial });
  };

  const updateAgent = (partial: Partial<AgentInfo>) => {
    onChange({ ...settings, agentInfo: { ...settings.agentInfo, ...partial } });
  };

  // Handle brand logo upload
  const handleBrandLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      updateSettings({ brandLogo: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
    if (brandLogoInputRef.current) brandLogoInputRef.current.value = "";
  };

  // Handle agent photo upload
  const handleAgentPhotoSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      updateAgent({ photo: e.target?.result as string });
    };
    reader.readAsDataURL(file);
  };

  const agentPhotoInputRef = useRef<HTMLInputElement>(null);

  const TAB_LIST = [
    { id: "templates", icon: LayoutTemplate, label: "Templates" },
    { id: "music", icon: Music, label: "Music" },
    { id: "voiceover", icon: Mic, label: "Voiceover\nand Avatar" },
  ];

  // Sync previewFocus with templateStyleTab when on templates tab
  const handleTemplateStyleChange = (tab: "intro" | "outro") => {
    setTemplateStyleTab(tab);
    setPreviewFocus(tab);
  };

  const landUnit = settings.landSizeUnit || "m²";

  // Build address text from property details
  const getDetailsText = () => {
    const parts: string[] = [];
    if (propertyDetails.streetAddress) parts.push(propertyDetails.streetAddress);
    const line2 = [propertyDetails.suburb, propertyDetails.state].filter(Boolean).join(", ");
    if (line2) parts.push(line2);
    return parts.join(", ") || "";
  };

  // Intro overlay for preview — style depends on selected template
  const renderIntroOverlay = () => {
    if (settings.selectedTemplate === "none") return null;

    // Custom uploaded intro image — show as full overlay
    if (settings.selectedTemplate === "custom") {
      if (!settings.customIntroImage) {
        return (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <p className="text-white/60 text-xs">Upload an intro image</p>
          </div>
        );
      }
      return (
        <img
          src={settings.customIntroImage}
          alt="Custom intro overlay"
          className="absolute inset-0 w-full h-full object-cover"
        />
      );
    }

    const heading = settings.customTitle || selectedIntroTemplate.name.toUpperCase();
    const details = getDetailsText();
    const templateId = settings.selectedTemplate;

    // Helper: format price
    const fmtPrice = propertyDetails.price
      ? `$${Number(propertyDetails.price.replace(/[^0-9]/g, "")).toLocaleString()}`
      : "";
    const specsLine = [
      propertyDetails.bedrooms ? `${propertyDetails.bedrooms} Bed` : "",
      propertyDetails.bathrooms ? `${propertyDetails.bathrooms} Bath` : "",
      propertyDetails.carSpaces ? `${propertyDetails.carSpaces} Car` : "",
      propertyDetails.landSize ? `${propertyDetails.landSize}${landUnit}` : "",
    ].filter(Boolean).join("  •  ");

    // ── Open House style: dark navy banner, heading left | divider | details + price right ──
    if (templateId === "open-house") {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-[#2f4050]/90 px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-white font-black text-sm uppercase tracking-wide leading-none flex-shrink-0">
              {heading}
            </h3>
            <div className="w-px self-stretch bg-white/40 min-h-[24px]" />
            <div>
              <p className="text-white/80 text-[10px] leading-snug whitespace-pre-line">
                {details}
              </p>
              {fmtPrice && (
                <p className="text-yellow-400 text-xs font-bold mt-1">{fmtPrice}</p>
              )}
              {specsLine && (
                <p className="text-white/70 text-[9px] mt-0.5">{specsLine}</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── Newly Listed style: centered text over gradient, heading + italic address + price ──
    if (templateId === "newly-listed") {
      return (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex flex-col items-center justify-end pb-8 px-4">
          <h3 className="text-white font-bold text-2xl leading-tight mb-2" style={{ fontFamily: "serif" }}>
            {heading}
          </h3>
          <p className="text-white/85 text-sm italic text-center leading-relaxed whitespace-pre-line">
            {details}
          </p>
          {fmtPrice && (
            <p className="text-yellow-400 text-base font-bold mt-1">{fmtPrice}</p>
          )}
          {specsLine && (
            <p className="text-white/70 text-[10px] mt-1">{specsLine}</p>
          )}
        </div>
      );
    }

    // ── Big and Bold: large centered uppercase heading, address, price, specs ──
    if (templateId === "big-bold") {
      return (
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent flex flex-col items-center justify-end pb-8 px-4">
          <h3 className="text-white font-black text-3xl uppercase tracking-widest leading-none mb-2 text-center">
            {heading}
          </h3>
          <p className="text-white/80 text-xs text-center whitespace-pre-line tracking-wide">
            {details}
          </p>
          {fmtPrice && (
            <p className="text-yellow-400 text-base font-bold mt-1">{fmtPrice}</p>
          )}
          {specsLine && (
            <p className="text-white/70 text-[10px] mt-1">{specsLine}</p>
          )}
        </div>
      );
    }

    // ── White on Black: black bar, white text centered ──
    if (templateId === "white-on-black") {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-black py-4 px-5">
          <h3 className="text-white font-bold text-lg uppercase tracking-wider text-center mb-1">
            {heading}
          </h3>
          <p className="text-white/70 text-[11px] text-center whitespace-pre-line">
            {details}
          </p>
          {fmtPrice && (
            <p className="text-yellow-400 text-sm font-bold text-center mt-1">{fmtPrice}</p>
          )}
          {specsLine && (
            <p className="text-white/60 text-[9px] text-center mt-0.5">{specsLine}</p>
          )}
        </div>
      );
    }

    // ── Simple White: white bar, dark text centered ──
    if (templateId === "simple-white") {
      return (
        <div className="absolute bottom-0 left-0 right-0 bg-white py-4 px-5">
          <h3 className="text-gray-900 font-bold text-lg uppercase tracking-wider text-center mb-1">
            {heading}
          </h3>
          <p className="text-gray-500 text-[11px] text-center whitespace-pre-line">
            {details}
          </p>
          {fmtPrice && (
            <p className="text-gray-900 text-sm font-bold text-center mt-1">{fmtPrice}</p>
          )}
          {specsLine && (
            <p className="text-gray-400 text-[9px] text-center mt-0.5">{specsLine}</p>
          )}
        </div>
      );
    }

    // ── Modern Treehouse: subtle bottom gradient, minimal text ──
    if (templateId === "modern-treehouse") {
      return (
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex flex-col items-start justify-end pb-5 pl-5 pr-4">
          <h3 className="text-white font-semibold text-lg tracking-wide mb-1">
            {heading}
          </h3>
          <p className="text-white/70 text-[11px] whitespace-pre-line">
            {details}
          </p>
          {fmtPrice && (
            <p className="text-yellow-400 text-sm font-bold mt-1">{fmtPrice}</p>
          )}
          {specsLine && (
            <p className="text-white/60 text-[9px] mt-0.5">{specsLine}</p>
          )}
        </div>
      );
    }

    // ── Elegant Classic: centered serif heading, address, price, frosted specs pill ──
    if (templateId === "elegant-classic") {
      const price = propertyDetails.price ? `$${Number(propertyDetails.price.replace(/[^0-9]/g, "")).toLocaleString()}` : "";
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <h3 className="text-white text-3xl italic leading-tight mb-2 drop-shadow-lg" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            {heading}
          </h3>
          <p className="text-white/90 text-xs text-center whitespace-pre-line drop-shadow-md mb-1">
            {details}
          </p>
          {price && (
            <p className="text-white font-bold text-base italic drop-shadow-md mb-3">
              {price}
            </p>
          )}
          {/* Frosted glass specs pill */}
          <div className="flex items-center gap-3 bg-white/25 backdrop-blur-md rounded-full px-4 py-1.5">
            <span className="text-white text-[11px] font-semibold">{propertyDetails.bedrooms} bed</span>
            <span className="text-white text-[11px] font-semibold">{propertyDetails.bathrooms} bath</span>
            <span className="text-white text-[11px] font-semibold">{propertyDetails.carSpaces} car</span>
          </div>
          {propertyDetails.landSize && (
            <div className="bg-white/25 backdrop-blur-md rounded-full px-3 py-1 mt-1.5">
              <span className="text-white text-[10px] font-semibold">{propertyDetails.landSize}{landUnit}</span>
            </div>
          )}
        </div>
      );
    }

    // ── Modern Luxe: large bold heading top-left, address below, bottom bar with specs + price ──
    if (templateId === "modern-luxe") {
      const price = propertyDetails.price ? `$${Number(propertyDetails.price.replace(/[^0-9]/g, "")).toLocaleString()}` : "";
      return (
        <div className="absolute inset-0">
          {/* Top area: heading + address */}
          <div className="absolute top-[30%] left-4 right-4">
            <h3 className="text-white font-black text-3xl italic leading-none drop-shadow-lg">
              {heading}
            </h3>
            <p className="text-white/85 text-xs mt-1.5 whitespace-pre-line drop-shadow-md">
              {details}
            </p>
          </div>
          {/* Bottom bar: specs left, price right */}
          <div className="absolute bottom-0 left-0 right-0 bg-white/15 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-white text-[11px] font-semibold">{propertyDetails.bedrooms} bed</span>
              <span className="text-white text-[11px] font-semibold">{propertyDetails.bathrooms} bath</span>
              <span className="text-white text-[11px] font-semibold">{propertyDetails.carSpaces} car</span>
              {propertyDetails.landSize && (
                <span className="text-white text-[11px] font-semibold">{propertyDetails.landSize}{landUnit}</span>
              )}
            </div>
            {price && (
              <span className="text-white text-sm font-bold">{price}</span>
            )}
          </div>
        </div>
      );
    }

    // ── Minimal Focus: centered uppercase heading, frosted glass address box + price ──
    if (templateId === "minimal-focus") {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
          <h3 className="text-white font-bold text-xl uppercase tracking-widest leading-none mb-3 drop-shadow-lg">
            {heading}
          </h3>
          <div className="border border-white/40 bg-white/10 backdrop-blur-sm rounded px-4 py-2.5">
            <p className="text-white/90 text-xs text-center whitespace-pre-line leading-relaxed">
              {details}
            </p>
            {fmtPrice && (
              <p className="text-yellow-400 text-sm font-bold text-center mt-1.5">{fmtPrice}</p>
            )}
            {specsLine && (
              <p className="text-white/70 text-[9px] text-center mt-1">{specsLine}</p>
            )}
          </div>
        </div>
      );
    }

    // ── Warm Elegance: transparent dark vignette overlay, serif title, stats pill ──
    if (templateId === "warm-elegance") {
      const price = propertyDetails.price ? `$${Number(propertyDetails.price.replace(/[^0-9]/g, "")).toLocaleString()}` : "";
      const isLandscape = orientation === "landscape";

      if (isLandscape) {
        return (
          <div className="absolute inset-0 overflow-hidden">
            {/* Dark top vignette */}
            <div className="absolute top-0 left-0 right-0 h-[37%]" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.40), transparent)" }} />
            {/* Dark bottom fade */}
            <div className="absolute bottom-0 left-0 right-0 h-[65%]" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.60) 40%, transparent 100%)" }} />
            <div className="absolute top-[35%] left-0 right-0 text-center px-4">
              <h3 className="text-white/95 text-3xl italic leading-tight" style={{ fontFamily: "Georgia, serif", letterSpacing: "1px", textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
                {heading}
              </h3>
              <p className="text-white/60 text-[10px] uppercase mt-2 whitespace-pre-line" style={{ letterSpacing: "3px" }}>
                {details}
              </p>
              {price && (
                <p className="text-white/90 text-lg mt-2" style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
                  {price}
                </p>
              )}
              <div className="mx-auto mt-2 w-[20%] h-px bg-white/20" />
            </div>
            {/* Stats pill with icons — warm golden tint */}
            <div className="absolute bottom-[13%] left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-full border border-white/15" style={{ background: "rgba(160,130,90,0.45)", backdropFilter: "blur(8px)" }}>
              <span className="flex items-center gap-1.5 text-white/90 text-xs">
                <BedDouble className="w-4 h-4 text-white/75" strokeWidth={1.5} />
                {propertyDetails.bedrooms}
              </span>
              <div className="w-px h-5 bg-white/20" />
              <span className="flex items-center gap-1.5 text-white/90 text-xs">
                <Bath className="w-4 h-4 text-white/75" strokeWidth={1.5} />
                {propertyDetails.bathrooms}
              </span>
              <div className="w-px h-5 bg-white/20" />
              <span className="flex items-center gap-1.5 text-white/90 text-xs">
                <Car className="w-4 h-4 text-white/75" strokeWidth={1.5} />
                {propertyDetails.carSpaces}
              </span>
            </div>
            {/* Land size pill below */}
            {propertyDetails.landSize && (
              <div className="absolute bottom-[7%] left-1/2 -translate-x-1/2 px-5 py-2 rounded-full border border-white/15" style={{ background: "rgba(160,130,90,0.45)", backdropFilter: "blur(8px)" }}>
                <span className="text-white/90 text-[11px]">{propertyDetails.landSize}{landUnit}</span>
              </div>
            )}
          </div>
        );
      }

      return (
        <div className="absolute inset-0 overflow-hidden">
          {/* Dark top vignette */}
          <div className="absolute top-0 left-0 right-0 h-[21%]" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.40), transparent)" }} />
          {/* Dark bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-[57%]" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.60) 40%, transparent 100%)" }} />
          <div className="absolute top-[43%] left-0 right-0 text-center px-4">
            <h3 className="text-white/95 text-3xl italic leading-tight" style={{ fontFamily: "Georgia, serif", letterSpacing: "1px", textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
              {heading}
            </h3>
            <p className="text-white/60 text-[10px] uppercase mt-3 whitespace-pre-line" style={{ letterSpacing: "3px" }}>
              {details}
            </p>
            {price && (
              <p className="text-white/90 text-lg mt-3" style={{ fontFamily: "Georgia, serif", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
                {price}
              </p>
            )}
            <div className="mx-auto mt-3 w-[37%] h-px bg-white/20" />
          </div>
          {/* Stats pill with icons — warm golden tint */}
          <div className="absolute bottom-[12.5%] left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 rounded-full border border-white/15" style={{ background: "rgba(160,130,90,0.45)", backdropFilter: "blur(8px)" }}>
            <span className="flex items-center gap-1.5 text-white/90 text-xs">
              <BedDouble className="w-4 h-4 text-white/75" strokeWidth={1.5} />
              {propertyDetails.bedrooms}
            </span>
            <div className="w-px h-5 bg-white/20" />
            <span className="flex items-center gap-1.5 text-white/90 text-xs">
              <Bath className="w-4 h-4 text-white/75" strokeWidth={1.5} />
              {propertyDetails.bathrooms}
            </span>
            <div className="w-px h-5 bg-white/20" />
            <span className="flex items-center gap-1.5 text-white/90 text-xs">
              <Car className="w-4 h-4 text-white/75" strokeWidth={1.5} />
              {propertyDetails.carSpaces}
            </span>
          </div>
          {/* Land size pill below */}
          {propertyDetails.landSize && (
            <div className="absolute bottom-[7%] left-1/2 -translate-x-1/2 px-5 py-2 rounded-full border border-white/15" style={{ background: "rgba(160,130,90,0.45)", backdropFilter: "blur(8px)" }}>
              <span className="text-white/90 text-[11px]">{propertyDetails.landSize}{landUnit}</span>
            </div>
          )}
        </div>
      );
    }

    // ── Default fallback: Open House style ──
    return (
      <div className="absolute bottom-0 left-0 right-0 bg-[#2b3a4a]/90 px-5 py-4">
        <div className="flex items-center gap-4">
          <h3 className="text-white font-black text-xl uppercase tracking-wide leading-none flex-shrink-0">
            {heading}
          </h3>
          <div className="w-px self-stretch bg-white/40" />
          <div>
            <p className="text-white/90 text-[11px] leading-relaxed whitespace-pre-line">
              {details}
            </p>
            {fmtPrice && (
              <p className="text-yellow-400 text-sm font-bold mt-1">{fmtPrice}</p>
            )}
            {specsLine && (
              <p className="text-white/70 text-[10px] mt-0.5">{specsLine}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Outro card preview
  const renderOutroPreview = () => {
    if (settings.outroTemplate === "none") {
      return (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
          No outro template
        </div>
      );
    }

    // Custom uploaded outro image
    if (settings.outroTemplate === "custom") {
      if (!settings.customOutroImage) {
        return (
          <div className="w-full h-full flex items-center justify-center bg-black/10">
            <p className="text-muted-foreground text-xs">Upload an outro image</p>
          </div>
        );
      }
      return (
        <img
          src={settings.customOutroImage}
          alt="Custom outro"
          className="w-full h-full object-cover"
        />
      );
    }

    const isDark = settings.outroTemplate === "classic-dark";
    const bg = isDark ? "bg-black" : "bg-white";
    const textColor = isDark ? "text-white" : "text-foreground";
    const subtextColor = isDark ? "text-white/70" : "text-muted-foreground";

    return (
      <div className={`w-full h-full ${bg} flex flex-col items-center justify-center px-4 py-6`}>
        {/* Agent photo */}
        {settings.showProfilePhoto && (
          <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary mb-3 flex-shrink-0">
            {settings.agentInfo.photo ? (
              <img
                src={settings.agentInfo.photo}
                alt="Agent"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User className={`w-6 h-6 ${subtextColor}`} />
              </div>
            )}
          </div>
        )}

        {/* Agent name & phone */}
        <p className={`text-sm font-bold ${textColor}`}>
          {settings.agentInfo.name || "Agent Name"}
        </p>
        {settings.agentInfo.phone && (
          <p className={`text-xs ${subtextColor} mt-0.5`}>
            {settings.agentInfo.phone}
          </p>
        )}

        {/* Brand logo */}
        {settings.showBrandLogo && settings.brandLogo && (
          <img
            src={settings.brandLogo}
            alt="Brand"
            className="h-8 object-contain mt-3"
          />
        )}

        {/* Outro text */}
        {settings.outroText && (
          <p className={`text-xs ${subtextColor} mt-3 text-center`}>
            {settings.outroText}
          </p>
        )}
      </div>
    );
  };

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

            {/* Template style label */}
            <Label className="text-sm font-medium">Template style</Label>

            {/* Intro / Outro toggle */}
            <div className="inline-flex items-center border border-border rounded-lg overflow-hidden mt-2 mb-4">
              <button
                onClick={() => handleTemplateStyleChange("intro")}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                  templateStyleTab === "intro"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Intro
              </button>
              <button
                onClick={() => handleTemplateStyleChange("outro")}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                  templateStyleTab === "outro"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Outro
              </button>
            </div>

            {/* INTRO settings */}
            {templateStyleTab === "intro" && (
              <div className="space-y-5">
                {/* Intro template dropdown */}
                <Select
                  value={settings.selectedTemplate}
                  onValueChange={(v) => updateSettings({ selectedTemplate: v, selectedLayout: v })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue>{selectedIntroTemplate.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {INTRO_TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Custom intro upload */}
                {settings.selectedTemplate === "custom" && (
                  <div>
                    <Label className="text-sm font-medium">Upload Intro Image</Label>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                      Upload a 1080×1920 PNG/JPG image for your intro overlay.
                    </p>
                    {settings.customIntroImage ? (
                      <div className="relative inline-block">
                        <img
                          src={settings.customIntroImage}
                          alt="Custom intro"
                          className="w-32 h-56 object-cover rounded-lg border border-border"
                        />
                        <button
                          onClick={() => updateSettings({ customIntroImage: null })}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                        <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Click to upload</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => updateSettings({ customIntroImage: reader.result as string });
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}

                {settings.selectedTemplate !== "custom" && (
                  <>
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

                    <div className="h-px bg-border" />

                    {/* Property Details */}
                    <div className="space-y-4">
                      <p className="text-xs text-muted-foreground">
                        Property details shown on the intro overlay.
                      </p>

                      {/* Street Address / Suburb / State */}
                      <div className="grid grid-cols-[1fr_0.7fr_0.3fr] gap-2">
                        <div>
                          <Label className="text-xs">Street Address</Label>
                          <Input
                            placeholder="27 Alamanda Blvd"
                            value={propertyDetails.streetAddress}
                            onChange={(e) => onPropertyDetailsChange({ ...propertyDetails, streetAddress: e.target.value })}
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Suburb</Label>
                          <Input
                            placeholder="Point Cook"
                            value={propertyDetails.suburb}
                            onChange={(e) => onPropertyDetailsChange({ ...propertyDetails, suburb: e.target.value })}
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">State</Label>
                          <Input
                            placeholder="VIC"
                            value={propertyDetails.state}
                            onChange={(e) => onPropertyDetailsChange({ ...propertyDetails, state: e.target.value })}
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                      </div>

                      {/* Price */}
                      <div>
                        <Label className="text-xs">Price</Label>
                        <Input
                          placeholder="500000"
                          value={propertyDetails.price}
                          onChange={(e) => onPropertyDetailsChange({ ...propertyDetails, price: e.target.value })}
                          className="mt-1 h-9 text-sm"
                        />
                      </div>

                      {/* Bedrooms */}
                      <div>
                        <Label className="text-xs">Bedrooms</Label>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {[0, 1, 2, 3, 4, "5+"].map((n) => {
                            const val = n === "5+" ? 5 : (n as number);
                            const isSelected = propertyDetails.bedrooms === val;
                            return (
                              <button
                                key={String(n)}
                                onClick={() => onPropertyDetailsChange({ ...propertyDetails, bedrooms: val })}
                                className={`w-9 h-9 rounded-full text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-border text-muted-foreground hover:border-primary/50"
                                }`}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Bathrooms */}
                      <div>
                        <Label className="text-xs">Bathrooms</Label>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {[0, 1, 2, 3, 4, "5+"].map((n) => {
                            const val = n === "5+" ? 5 : (n as number);
                            const isSelected = propertyDetails.bathrooms === val;
                            return (
                              <button
                                key={String(n)}
                                onClick={() => onPropertyDetailsChange({ ...propertyDetails, bathrooms: val })}
                                className={`w-9 h-9 rounded-full text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-border text-muted-foreground hover:border-primary/50"
                                }`}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Car Spaces */}
                      <div>
                        <Label className="text-xs">Car Spaces</Label>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {[0, 1, 2, 3, 4, "5+"].map((n) => {
                            const val = n === "5+" ? 5 : (n as number);
                            const isSelected = propertyDetails.carSpaces === val;
                            return (
                              <button
                                key={String(n)}
                                onClick={() => onPropertyDetailsChange({ ...propertyDetails, carSpaces: val })}
                                className={`w-9 h-9 rounded-full text-xs font-medium transition-colors ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-border text-muted-foreground hover:border-primary/50"
                                }`}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Land Size + Unit */}
                      <div className="grid grid-cols-[1fr_0.5fr] gap-2">
                        <div>
                          <Label className="text-xs">Land Size</Label>
                          <Input
                            placeholder="512"
                            value={propertyDetails.landSize}
                            onChange={(e) => onPropertyDetailsChange({ ...propertyDetails, landSize: e.target.value })}
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Unit</Label>
                          <Select
                            value={settings.landSizeUnit || "m²"}
                            onValueChange={(v) => updateSettings({ landSizeUnit: v })}
                          >
                            <SelectTrigger className="mt-1 h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="m²">m²</SelectItem>
                              <SelectItem value="sqft">sqft</SelectItem>
                              <SelectItem value="acres">acres</SelectItem>
                              <SelectItem value="ha">ha</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* OUTRO settings */}
            {templateStyleTab === "outro" && (
              <div className="space-y-5">
                {/* Outro template dropdown */}
                <Select
                  value={settings.outroTemplate}
                  onValueChange={(v) => updateSettings({ outroTemplate: v })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue>{selectedOutroTemplate.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {OUTRO_TEMPLATES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Custom outro upload */}
                {settings.outroTemplate === "custom" && (
                  <div>
                    <Label className="text-sm font-medium">Upload Outro Image</Label>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                      Upload a 1080×1920 PNG/JPG image for your outro card.
                    </p>
                    {settings.customOutroImage ? (
                      <div className="relative inline-block">
                        <img
                          src={settings.customOutroImage}
                          alt="Custom outro"
                          className="w-32 h-56 object-cover rounded-lg border border-border"
                        />
                        <button
                          onClick={() => updateSettings({ customOutroImage: null })}
                          className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                        <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Click to upload</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => updateSettings({ customOutroImage: reader.result as string });
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    )}
                  </div>
                )}

                {settings.outroTemplate !== "none" && settings.outroTemplate !== "custom" && (
                  <>
                    {/* Profile photo & Brand logo toggles */}
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Profile photo</Label>
                        <Switch
                          checked={settings.showProfilePhoto}
                          onCheckedChange={(v) => updateSettings({ showProfilePhoto: v })}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Brand logo</Label>
                        <Switch
                          checked={settings.showBrandLogo}
                          onCheckedChange={(v) => updateSettings({ showBrandLogo: v })}
                        />
                      </div>
                    </div>

                    {/* Photo & Logo upload area */}
                    <div className="flex gap-4">
                      {/* Agent photo */}
                      <div
                        className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-dashed border-border hover:border-primary/50 cursor-pointer flex-shrink-0 flex items-center justify-center bg-secondary/50"
                        onClick={() => agentPhotoInputRef.current?.click()}
                      >
                        <input
                          ref={agentPhotoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleAgentPhotoSelect(file);
                          }}
                        />
                        {settings.agentInfo.photo ? (
                          <>
                            <img
                              src={settings.agentInfo.photo}
                              alt="Agent"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-background border border-border flex items-center justify-center">
                              <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                            </div>
                          </>
                        ) : (
                          <div className="text-center">
                            <User className="w-6 h-6 text-muted-foreground mx-auto" />
                          </div>
                        )}
                      </div>

                      {/* Brand logo */}
                      <div
                        className="relative w-24 h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 cursor-pointer flex items-center justify-center bg-secondary/50"
                        onClick={() => brandLogoInputRef.current?.click()}
                      >
                        <input
                          ref={brandLogoInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleBrandLogoUpload}
                        />
                        {settings.brandLogo ? (
                          <>
                            <img
                              src={settings.brandLogo}
                              alt="Brand logo"
                              className="max-w-full max-h-full object-contain p-1"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSettings({ brandLogo: null });
                              }}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-background border border-border flex items-center justify-center"
                            >
                              <X className="w-2.5 h-2.5 text-muted-foreground" />
                            </button>
                          </>
                        ) : (
                          <div className="text-center">
                            <ImageIcon className="w-5 h-5 text-muted-foreground mx-auto" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Outro text */}
                    <div>
                      <Label htmlFor="outro-text">Outro text</Label>
                      <Textarea
                        id="outro-text"
                        placeholder="Outro Text"
                        value={settings.outroText}
                        onChange={(e) => updateSettings({ outroText: e.target.value })}
                        rows={3}
                        className="mt-1.5 text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
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

                {/* Track list */}
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

        {/* Voiceover & Avatar tab */}
        {activeTab === "voiceover" && (
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Mic className="w-4 h-4 text-primary" />
              Voiceover & Avatar
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
      <div className="w-[40%] min-w-[360px] flex-shrink-0">
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

        {/* Preview area with pills */}
        <div className="flex gap-3">
          {/* Preview image/outro */}
          <div
            className={`bg-secondary rounded-xl overflow-hidden border border-border flex-1 relative shadow-lg ${
              orientation === "portrait" ? "aspect-[9/16]" : "aspect-video"
            }`}
          >
            {previewFocus === "intro" ? (
              <>
                {previewImageUrl ? (
                  <img
                    src={previewImageUrl}
                    alt="Preview"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-700 to-slate-900" />
                )}
                {renderIntroOverlay()}
              </>
            ) : (
              /* Outro preview */
              renderOutroPreview()
            )}
          </div>

          {/* Right-side Intro/Outro pills */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <button
              onClick={() => {
                setPreviewFocus("intro");
                setTemplateStyleTab("intro");
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                previewFocus === "intro"
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              <LayoutTemplate className="w-3 h-3" />
              <span>
                Intro:{" "}
                <span className="text-primary">{selectedIntroTemplate.name}</span>
              </span>
            </button>
            <button
              onClick={() => {
                setPreviewFocus("outro");
                setTemplateStyleTab("outro");
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                previewFocus === "outro"
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              <LayoutTemplate className="w-3 h-3" />
              <span>
                Outro:{" "}
                <span className="text-primary">{selectedOutroTemplate.name}</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Intro template selection modal */}
      <Dialog open={showIntroModal} onOpenChange={setShowIntroModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4" />
              Select intro template
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-3 mt-2">
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
                    setShowIntroModal(false);
                  }}
                  className={`rounded-xl border-2 overflow-hidden transition-all ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="aspect-[9/16] bg-secondary flex items-center justify-center relative">
                    {template.id === "none" ? (
                      <Ban className="w-8 h-8 text-muted-foreground" />
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

      {/* Outro template selection modal */}
      <Dialog open={showOutroModal} onOpenChange={setShowOutroModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4" />
              Select outro template
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4 mt-2">
            {OUTRO_TEMPLATES.map((template) => {
              const isSelected = settings.outroTemplate === template.id;
              const isDark = template.id === "classic-dark";
              return (
                <button
                  key={template.id}
                  onClick={() => {
                    updateSettings({ outroTemplate: template.id });
                    setShowOutroModal(false);
                  }}
                  className={`rounded-xl border-2 overflow-hidden transition-all ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className={`aspect-[3/4] flex items-center justify-center ${
                    template.id === "none" ? "bg-secondary" :
                    isDark ? "bg-black" : "bg-white"
                  }`}>
                    {template.id === "none" ? (
                      <Ban className="w-8 h-8 text-muted-foreground" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 px-3">
                        <div className={`w-10 h-10 rounded-full ${isDark ? "bg-gray-700" : "bg-secondary"} flex items-center justify-center`}>
                          <User className={`w-5 h-5 ${isDark ? "text-gray-400" : "text-muted-foreground"}`} />
                        </div>
                        <p className={`text-[10px] font-bold ${isDark ? "text-white" : "text-foreground"}`}>
                          {settings.agentInfo.name || "Agent Name"}
                        </p>
                        <p className={`text-[8px] ${isDark ? "text-gray-400" : "text-muted-foreground"}`}>
                          {settings.agentInfo.phone || "(415) 555-0137"}
                        </p>
                      </div>
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
