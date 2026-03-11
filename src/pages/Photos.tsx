import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Upload,
  X,
  Download,
  Archive,
  Loader2,
  Check,
  AlertCircle,
  RotateCcw,
  Sofa,
  BedDouble,
  CookingPot,
  UtensilsCrossed,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  ImagePlus,
  Sun,
  Contrast,
  Droplets,
  Thermometer,
  Sparkles,
  Type,
  Palette,
  Eraser,
  Bath,
  TreePine,
  Car,
  Baby,
  Layers,
  Eye,
  SlidersHorizontal,
  RotateCw,
  Shield,
  Moon,
  Sunset,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface PhotoJob {
  id: string;
  original_url: string;
  enhanced_url: string | null;
  sky_url: string | null;
  staged_urls: string[];
  status: "pending" | "processing" | "complete" | "failed";
  error_message: string | null;
  job_type: "enhance" | "stage";
  enhancements: { enhance?: boolean; sky?: boolean; sky_type?: string };
  stage_options: { room_type?: string; style?: string; furniture_density?: string; declutter?: boolean; lighting?: string };
}

interface MlsLabelSettings {
  enabled: boolean;
  text: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

interface UploadedFile {
  file: File;
  preview: string;
  name: string;
  size: string;
}

interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  sharpness: number;
  vignette: number;
}

interface WatermarkSettings {
  text: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  opacity: number;
  fontSize: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  sharpness: 0,
  vignette: 0,
};

const PRESET_FILTERS = [
  { name: "None", adjustments: { ...DEFAULT_ADJUSTMENTS } },
  { name: "Bright & Airy", adjustments: { brightness: 15, contrast: 5, saturation: -10, warmth: 5, sharpness: 0, vignette: 0 } },
  { name: "Warm Glow", adjustments: { brightness: 5, contrast: 10, saturation: 15, warmth: 25, sharpness: 0, vignette: 10 } },
  { name: "Cool & Crisp", adjustments: { brightness: 5, contrast: 15, saturation: 5, warmth: -15, sharpness: 10, vignette: 0 } },
  { name: "Twilight", adjustments: { brightness: -10, contrast: 20, saturation: 20, warmth: -20, sharpness: 5, vignette: 20 } },
  { name: "Magazine", adjustments: { brightness: 10, contrast: 20, saturation: 10, warmth: 0, sharpness: 15, vignette: 5 } },
  { name: "HDR Pop", adjustments: { brightness: 0, contrast: 30, saturation: 25, warmth: 5, sharpness: 20, vignette: 0 } },
  { name: "Soft Focus", adjustments: { brightness: 10, contrast: -10, saturation: -5, warmth: 10, sharpness: -20, vignette: 15 } },
];

const ADJUSTMENT_CONTROLS: { key: keyof ImageAdjustments; label: string; icon: typeof Sun; min: number; max: number }[] = [
  { key: "brightness", label: "Brightness", icon: Sun, min: -50, max: 50 },
  { key: "contrast", label: "Contrast", icon: Contrast, min: -50, max: 50 },
  { key: "saturation", label: "Saturation", icon: Droplets, min: -50, max: 50 },
  { key: "warmth", label: "Warmth", icon: Thermometer, min: -50, max: 50 },
  { key: "sharpness", label: "Sharpness", icon: Sparkles, min: -30, max: 30 },
  { key: "vignette", label: "Vignette", icon: Eye, min: 0, max: 50 },
];

const SKY_OPTIONS = [
  { value: "DAY", label: "Blue Sky" },
  { value: "DUSK", label: "Dusk" },
  { value: "NIGHT", label: "Night" },
];

const ROOM_TYPES = [
  { value: "LIVINGROOM", label: "Living", icon: Sofa },
  { value: "BEDROOM", label: "Bed", icon: BedDouble },
  { value: "KITCHEN", label: "Kitchen", icon: CookingPot },
  { value: "DININGROOM", label: "Dining", icon: UtensilsCrossed },
  { value: "OFFICE", label: "Office", icon: Briefcase },
  { value: "BATHROOM", label: "Bath", icon: Bath },
  { value: "BACK_PATIO", label: "Patio", icon: TreePine },
  { value: "GARAGE", label: "Garage", icon: Car },
  { value: "KIDSROOM", label: "Kids Room", icon: Baby },
];

const DESIGN_STYLES = [
  { value: "MODERN", label: "Modern", color: "from-slate-400 to-slate-600" },
  { value: "SCANDINAVIAN", label: "Scandi", color: "from-amber-100 to-stone-300" },
  { value: "LUXEMODERN", label: "Luxury", color: "from-yellow-600 to-amber-800" },
  { value: "FARMHOUSE", label: "Farmhouse", color: "from-green-300 to-emerald-500" },
  { value: "MINIMALIST", label: "Minimal", color: "from-gray-100 to-gray-300" },
  { value: "INDUSTRIAL", label: "Industrial", color: "from-zinc-500 to-zinc-700" },
  { value: "COASTAL", label: "Coastal", color: "from-sky-200 to-blue-400" },
  { value: "ARTDECO", label: "Art Deco", color: "from-yellow-400 to-orange-600" },
  { value: "BOHO", label: "Boho", color: "from-rose-300 to-orange-400" },
  { value: "CONTEMPORARY", label: "Contemp.", color: "from-violet-300 to-purple-500" },
];

const FURNITURE_DENSITIES = [
  { value: "light", label: "Light", description: "Minimal furniture, spacious feel" },
  { value: "medium", label: "Medium", description: "Balanced, well-furnished" },
  { value: "full", label: "Full", description: "Fully furnished, lived-in look" },
];

const LIGHTING_OPTIONS = [
  { value: "standard", label: "Standard", icon: Sun, description: "Original lighting" },
  { value: "golden_hour", label: "Golden Hour", icon: Sunset, description: "Warm sunset tones — 76% more views" },
  { value: "twilight", label: "Twilight", icon: Moon, description: "Dramatic dusk exterior lighting" },
];

const WATERMARK_POSITIONS = [
  { value: "top-left" as const, label: "Top Left" },
  { value: "top-right" as const, label: "Top Right" },
  { value: "bottom-left" as const, label: "Bottom Left" },
  { value: "bottom-right" as const, label: "Bottom Right" },
  { value: "center" as const, label: "Center" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// ── CSS Filter Helper ──────────────────────────────────────────────────────

function adjustmentsToCSS(adj: ImageAdjustments): string {
  const filters: string[] = [];
  filters.push(`brightness(${1 + adj.brightness / 100})`);
  filters.push(`contrast(${1 + adj.contrast / 100})`);
  filters.push(`saturate(${1 + adj.saturation / 100})`);
  // Warmth via hue-rotate + sepia combo
  if (adj.warmth > 0) {
    filters.push(`sepia(${adj.warmth / 100})`);
  } else if (adj.warmth < 0) {
    filters.push(`hue-rotate(${adj.warmth * 2}deg)`);
  }
  // Sharpness approximated via contrast boost (true unsharp mask needs canvas)
  if (adj.sharpness > 0) {
    filters.push(`contrast(${1 + adj.sharpness / 200})`);
  } else if (adj.sharpness < 0) {
    filters.push(`blur(${Math.abs(adj.sharpness) / 30}px)`);
  }
  return filters.join(" ");
}

// ── Before/After Slider ────────────────────────────────────────────────────

function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  large = false,
  afterFilter,
  vignetteAmount,
}: {
  beforeUrl: string;
  afterUrl: string;
  large?: boolean;
  afterFilter?: string;
  vignetteAmount?: number;
}) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current || !dragging.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setPosition((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const onUp = () => { dragging.current = false; };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [handleMove]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg border border-border select-none cursor-col-resize ${
        large ? "aspect-[4/3]" : "aspect-[4/3]"
      }`}
      onMouseDown={() => { dragging.current = true; }}
      onTouchStart={() => { dragging.current = true; }}
    >
      {/* After (full) */}
      <img
        src={afterUrl}
        alt="After"
        className="absolute inset-0 w-full h-full object-cover"
        style={afterFilter ? { filter: afterFilter } : undefined}
      />
      {/* Vignette overlay on after side */}
      {vignetteAmount && vignetteAmount > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${vignetteAmount / 100}) 100%)`,
          }}
        />
      )}
      {/* Before (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img
          src={beforeUrl}
          alt="Before"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ minWidth: containerRef.current ? `${containerRef.current.offsetWidth}px` : "100%" }}
        />
      </div>
      {/* Divider */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
          <div className="flex gap-0.5">
            <ArrowLeft className="w-3 h-3 text-foreground" />
            <ArrowRight className="w-3 h-3 text-foreground" />
          </div>
        </div>
      </div>
      {/* Labels */}
      <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full z-20">Before</span>
      <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full z-20">After</span>
    </div>
  );
}

// ── Download helpers ───────────────────────────────────────────────────────

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadAllAsZip(
  files: { url: string; filename: string }[],
  zipName: string
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  await Promise.all(
    files.map(async ({ url, filename }) => {
      const res = await fetch(url);
      const blob = await res.blob();
      zip.file(filename, blob);
    })
  );
  const content = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(content);
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Canvas Export with Adjustments + Watermark ─────────────────────────────

async function exportImageWithEdits(
  imageUrl: string,
  adjustments: ImageAdjustments,
  watermark: WatermarkSettings | null,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context unavailable"));

      // Apply CSS filter equivalent
      ctx.filter = adjustmentsToCSS(adjustments);
      ctx.drawImage(img, 0, 0);
      ctx.filter = "none";

      // Vignette
      if (adjustments.vignette > 0) {
        const gradient = ctx.createRadialGradient(
          canvas.width / 2, canvas.height / 2, canvas.width * 0.3,
          canvas.width / 2, canvas.height / 2, canvas.width * 0.7,
        );
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(1, `rgba(0,0,0,${adjustments.vignette / 100})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Watermark
      if (watermark && watermark.text.trim()) {
        ctx.globalAlpha = watermark.opacity / 100;
        ctx.font = `${watermark.fontSize}px sans-serif`;
        ctx.fillStyle = "white";
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 2;

        const metrics = ctx.measureText(watermark.text);
        const textW = metrics.width;
        const textH = watermark.fontSize;
        const pad = 30;
        let x = pad;
        let y = textH + pad;

        switch (watermark.position) {
          case "top-right": x = canvas.width - textW - pad; y = textH + pad; break;
          case "bottom-left": x = pad; y = canvas.height - pad; break;
          case "bottom-right": x = canvas.width - textW - pad; y = canvas.height - pad; break;
          case "center": x = (canvas.width - textW) / 2; y = canvas.height / 2; break;
        }

        ctx.strokeText(watermark.text, x, y);
        ctx.fillText(watermark.text, x, y);
        ctx.globalAlpha = 1;
      }

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.95,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });
}

// ── MLS Compliance Label Export ──────────────────────────────────────────

async function exportWithMlsLabel(
  imageUrl: string,
  label: MlsLabelSettings,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas context unavailable"));

      ctx.drawImage(img, 0, 0);

      // Render MLS compliance label
      const fontSize = Math.max(14, Math.round(canvas.width * 0.018));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const text = label.text;
      const metrics = ctx.measureText(text);
      const padX = fontSize * 0.8;
      const padY = fontSize * 0.5;
      const bgW = metrics.width + padX * 2;
      const bgH = fontSize + padY * 2;
      const margin = fontSize;

      let x = margin;
      let y = margin;
      if (label.position === "top-right") x = canvas.width - bgW - margin;
      if (label.position === "bottom-left") y = canvas.height - bgH - margin;
      if (label.position === "bottom-right") { x = canvas.width - bgW - margin; y = canvas.height - bgH - margin; }

      // Semi-transparent background pill
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      const radius = fontSize * 0.3;
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + bgW - radius, y);
      ctx.quadraticCurveTo(x + bgW, y, x + bgW, y + radius);
      ctx.lineTo(x + bgW, y + bgH - radius);
      ctx.quadraticCurveTo(x + bgW, y + bgH, x + bgW - radius, y + bgH);
      ctx.lineTo(x + radius, y + bgH);
      ctx.quadraticCurveTo(x, y + bgH, x, y + bgH - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      // White text
      ctx.fillStyle = "white";
      ctx.fillText(text, x + padX, y + padY + fontSize * 0.82);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/jpeg",
        0.95,
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageUrl;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function Photos() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "edit";

  const setTab = (tab: string) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <DashboardLayout>
      <div className="p-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">Photos</h1>

        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="edit">Photo Edit</TabsTrigger>
            <TabsTrigger value="staging">Virtual Staging</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="mt-6">
            <PhotoEditTab />
          </TabsContent>
          <TabsContent value="staging" className="mt-6">
            <VirtualStagingTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1: PHOTO EDIT — Enhanced with manual controls, presets, watermarks
// ═══════════════════════════════════════════════════════════════════════════

function PhotoEditTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Upload state
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // AI Enhancement options
  const [enhanceEnabled, setEnhanceEnabled] = useState(true);
  const [skyEnabled, setSkyEnabled] = useState(false);
  const [skyType, setSkyType] = useState("blue_sky");

  // Manual adjustments
  const [adjustments, setAdjustments] = useState<ImageAdjustments>({ ...DEFAULT_ADJUSTMENTS });
  const [activePreset, setActivePreset] = useState("None");
  const [showManualControls, setShowManualControls] = useState(false);

  // Watermark
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermark, setWatermark] = useState<WatermarkSettings>({
    text: "",
    position: "bottom-right",
    opacity: 60,
    fontSize: 48,
  });

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobs, setJobs] = useState<PhotoJob[]>([]);

  // Edit mode — when viewing results, allow further adjustments
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  // File handling
  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter(
      (f) => (f.type === "image/jpeg" || f.type === "image/png" || f.type === "image/webp") && f.size <= 20 * 1024 * 1024
    );
    setFiles((prev) => {
      const combined = [...prev, ...valid.map((f) => ({
        file: f,
        preview: URL.createObjectURL(f),
        name: f.name,
        size: formatFileSize(f.size),
      }))];
      return combined.slice(0, 20);
    });
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  // Apply preset
  const applyPreset = (preset: typeof PRESET_FILTERS[number]) => {
    setActivePreset(preset.name);
    setAdjustments({ ...preset.adjustments });
  };

  // Reset adjustments
  const resetAdjustments = () => {
    setAdjustments({ ...DEFAULT_ADJUSTMENTS });
    setActivePreset("None");
  };

  // CSS filter string for live preview
  const cssFilter = useMemo(() => adjustmentsToCSS(adjustments), [adjustments]);
  const hasAdjustments = useMemo(
    () => Object.values(adjustments).some((v) => v !== 0),
    [adjustments],
  );

  // Process photos
  const handleEnhance = async () => {
    if (!user?.id || files.length === 0 || (!enhanceEnabled && !skyEnabled && !hasAdjustments && !watermarkEnabled)) return;
    setIsProcessing(true);
    setJobs([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // If only manual adjustments (no AI), export locally
      if (!enhanceEnabled && !skyEnabled) {
        const localJobs: PhotoJob[] = [];
        for (const f of files) {
          const blob = await exportImageWithEdits(
            f.preview,
            adjustments,
            watermarkEnabled ? watermark : null,
          );
          const url = URL.createObjectURL(blob);
          localJobs.push({
            id: crypto.randomUUID(),
            original_url: f.preview,
            enhanced_url: url,
            sky_url: null,
            staged_urls: [],
            status: "complete",
            error_message: null,
            job_type: "enhance",
            enhancements: {},
            stage_options: {},
          });
        }
        setJobs(localJobs);
        setIsProcessing(false);
        return;
      }

      // Upload all files to storage
      const uploadedJobs: PhotoJob[] = [];
      for (const f of files) {
        const ext = f.file.name.split(".").pop() || "jpg";
        const path = `originals/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("property-photos")
          .upload(path, f.file, { cacheControl: "3600" });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("property-photos").getPublicUrl(path);

        // Create job record
        const { data: job, error: jobError } = await supabase
          .from("photo_jobs")
          .insert({
            user_id: user.id,
            job_type: "enhance",
            original_url: urlData.publicUrl,
            status: "pending",
            enhancements: { enhance: enhanceEnabled, sky: skyEnabled, sky_type: skyType },
          })
          .select()
          .single();
        if (jobError) throw jobError;

        uploadedJobs.push({
          id: job.id,
          original_url: job.original_url,
          enhanced_url: null,
          sky_url: null,
          staged_urls: [],
          status: "pending",
          error_message: null,
          job_type: "enhance",
          enhancements: job.enhancements,
          stage_options: {},
        });
      }

      setJobs(uploadedJobs);

      // Call edge function for each job
      for (const job of uploadedJobs) {
        invokeEdgeFunction("enhance-photo", { body: { job_id: job.id } }).catch(console.error);
      }

      // Subscribe to realtime updates
      const channel = supabase
        .channel("photo-jobs-enhance")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "photo_jobs",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const updated = payload.new as Record<string, unknown>;
            setJobs((prev) =>
              prev.map((j) =>
                j.id === updated.id
                  ? {
                      ...j,
                      status: updated.status as PhotoJob["status"],
                      enhanced_url: (updated.enhanced_url as string) || null,
                      sky_url: (updated.sky_url as string) || null,
                      error_message: (updated.error_message as string) || null,
                    }
                  : j
              )
            );
          }
        )
        .subscribe();

      // Poll fallback
      const pollIds = new Set(uploadedJobs.map((j) => j.id));
      const pollInterval = setInterval(async () => {
        if (pollIds.size === 0) {
          clearInterval(pollInterval);
          return;
        }
        const { data } = await supabase
          .from("photo_jobs")
          .select("*")
          .in("id", Array.from(pollIds));
        if (data) {
          for (const row of data) {
            if (row.status === "complete" || row.status === "failed") {
              pollIds.delete(row.id);
            }
            setJobs((prev) =>
              prev.map((j) =>
                j.id === row.id
                  ? { ...j, status: row.status, enhanced_url: row.enhanced_url, sky_url: row.sky_url, error_message: row.error_message }
                  : j
              )
            );
          }
        }
        if (pollIds.size === 0) {
          clearInterval(pollInterval);
          channel.unsubscribe();
          setIsProcessing(false);
        }
      }, 3000);
    } catch (err) {
      console.error("Enhance error:", err);
      toast({ title: "Error", description: "Failed to start enhancement", variant: "destructive" });
      setIsProcessing(false);
    }
  };

  const completedJobs = jobs.filter((j) => j.status === "complete");
  const canDownloadAll = completedJobs.length > 1;

  const handleDownloadAll = async () => {
    const downloadFiles = completedJobs.map((j) => ({
      url: j.sky_url || j.enhanced_url || j.original_url,
      filename: `propertymotion-enhanced-${j.id.slice(0, 8)}.jpg`,
    }));
    await downloadAllAsZip(downloadFiles, "propertymotion-enhanced.zip");
  };

  // Download a single result with manual adjustments applied
  const handleDownloadWithEdits = async (job: PhotoJob) => {
    try {
      const sourceUrl = job.sky_url || job.enhanced_url || job.original_url;
      if (hasAdjustments || watermarkEnabled) {
        const blob = await exportImageWithEdits(sourceUrl, adjustments, watermarkEnabled ? watermark : null);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `propertymotion-edited-${job.id.slice(0, 8)}.jpg`;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        downloadImage(sourceUrl, `propertymotion-enhanced-${job.id.slice(0, 8)}.jpg`);
      }
    } catch {
      toast({ title: "Error", description: "Failed to export image", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      {/* Upload Zone */}
      {jobs.length === 0 && (
        <>
          <label
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            className={`block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/50 hover:bg-secondary/30"
            }`}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
            />
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-secondary flex items-center justify-center">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground text-lg">
              {isDragging ? "Drop photos here" : "Drop your listing photos here or click to browse"}
            </p>
            <p className="text-sm text-muted-foreground mt-2">JPG, PNG, WEBP — Max 20MB per file, up to 20 files</p>
          </label>

          {/* Thumbnail grid */}
          {files.length > 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {files.map((f, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-border">
                    <img
                      src={f.preview}
                      alt={f.name}
                      className="aspect-square object-cover w-full"
                      style={hasAdjustments ? { filter: cssFilter } : undefined}
                    />
                    {adjustments.vignette > 0 && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${adjustments.vignette / 100}) 100%)`,
                        }}
                      />
                    )}
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 px-2 py-1">
                      <p className="text-[10px] text-white truncate">{f.name}</p>
                      <p className="text-[10px] text-white/70">{f.size}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── AI Enhancement Options ────────────────────────────── */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> AI Enhancement
                </h3>
                {/* Auto Enhance */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                  <div>
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <span className="text-primary">✦</span> Auto Enhance
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Colour, HDR, exposure & perspective correction — ~30 sec
                    </p>
                  </div>
                  <Switch checked={enhanceEnabled} onCheckedChange={setEnhanceEnabled} />
                </div>

                {/* Sky Replacement */}
                <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <span className="text-blue-400">☁</span> Sky Replacement
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Replace grey skies with clear blue sky — ~15 sec
                      </p>
                    </div>
                    <Switch checked={skyEnabled} onCheckedChange={setSkyEnabled} />
                  </div>
                  {skyEnabled && (
                    <div className="flex gap-2">
                      {SKY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setSkyType(opt.value)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                            skyType === opt.value
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-foreground hover:bg-accent"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Manual Adjustments ──────────────────────────────── */}
              <div className="space-y-3">
                <button
                  onClick={() => setShowManualControls(!showManualControls)}
                  className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Manual Adjustments
                  <span className={`text-xs transition-transform ${showManualControls ? "rotate-180" : ""}`}>▼</span>
                  {hasAdjustments && (
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">Active</span>
                  )}
                </button>

                {showManualControls && (
                  <div className="space-y-4 p-4 rounded-xl border border-border bg-card">
                    {/* Preset Filters */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Presets</label>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {PRESET_FILTERS.map((preset) => (
                          <button
                            key={preset.name}
                            onClick={() => applyPreset(preset)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                              activePreset === preset.name
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "bg-secondary text-foreground hover:bg-accent"
                            }`}
                          >
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sliders */}
                    <div className="space-y-3">
                      {ADJUSTMENT_CONTROLS.map((ctrl) => {
                        const Icon = ctrl.icon;
                        return (
                          <div key={ctrl.key} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                                {ctrl.label}
                              </label>
                              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                                {adjustments[ctrl.key] > 0 ? "+" : ""}{adjustments[ctrl.key]}
                              </span>
                            </div>
                            <Slider
                              min={ctrl.min}
                              max={ctrl.max}
                              step={1}
                              value={[adjustments[ctrl.key]]}
                              onValueChange={([v]) => {
                                setAdjustments((prev) => ({ ...prev, [ctrl.key]: v }));
                                setActivePreset("None");
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Reset */}
                    {hasAdjustments && (
                      <Button variant="ghost" size="sm" onClick={resetAdjustments} className="text-xs">
                        <RotateCcw className="w-3 h-3" />
                        Reset All
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Watermark ──────────────────────────────────────── */}
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Type className="w-4 h-4 text-muted-foreground" /> Text Overlay / Watermark
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Add branding text to your photos
                    </p>
                  </div>
                  <Switch checked={watermarkEnabled} onCheckedChange={setWatermarkEnabled} />
                </div>
                {watermarkEnabled && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={watermark.text}
                      onChange={(e) => setWatermark((prev) => ({ ...prev, text: e.target.value }))}
                      placeholder="Your Agency Name"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Position</label>
                        <div className="flex flex-wrap gap-1.5">
                          {WATERMARK_POSITIONS.map((pos) => (
                            <button
                              key={pos.value}
                              onClick={() => setWatermark((prev) => ({ ...prev, position: pos.value }))}
                              className={`px-2 py-1 rounded text-xs transition-colors ${
                                watermark.position === pos.value
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-foreground hover:bg-accent"
                              }`}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Opacity: {watermark.opacity}%</label>
                          <Slider
                            min={10}
                            max={100}
                            step={5}
                            value={[watermark.opacity]}
                            onValueChange={([v]) => setWatermark((prev) => ({ ...prev, opacity: v }))}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Size: {watermark.fontSize}px</label>
                          <Slider
                            min={16}
                            max={120}
                            step={4}
                            value={[watermark.fontSize]}
                            onValueChange={([v]) => setWatermark((prev) => ({ ...prev, fontSize: v }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button */}
              <Button
                variant="hero"
                size="lg"
                onClick={handleEnhance}
                disabled={files.length === 0 || (!enhanceEnabled && !skyEnabled && !hasAdjustments && !watermarkEnabled) || isProcessing}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {enhanceEnabled || skyEnabled
                      ? `Enhance ${files.length} Photo${files.length !== 1 ? "s" : ""}`
                      : `Export ${files.length} Photo${files.length !== 1 ? "s" : ""} with Edits`
                    }
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Results */}
      {jobs.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Results</h2>
            <div className="flex gap-2">
              {hasAdjustments && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 bg-primary/10 text-primary text-xs font-semibold rounded-full">
                  <SlidersHorizontal className="w-3 h-3" /> Edits Applied
                </span>
              )}
              {canDownloadAll && (
                <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                  <Archive className="w-4 h-4" />
                  Download All
                </Button>
              )}
            </div>
          </div>

          {/* Manual controls panel for post-AI refinement */}
          {completedJobs.length > 0 && (
            <div className="space-y-3">
              <button
                onClick={() => setShowManualControls(!showManualControls)}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Palette className="w-4 h-4" />
                Fine-tune results
                <span className={`text-xs transition-transform ${showManualControls ? "rotate-180" : ""}`}>▼</span>
              </button>

              {showManualControls && (
                <div className="p-4 rounded-xl border border-border bg-card space-y-4">
                  {/* Presets */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {PRESET_FILTERS.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => applyPreset(preset)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                          activePreset === preset.name
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground hover:bg-accent"
                        }`}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>

                  {/* Sliders */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    {ADJUSTMENT_CONTROLS.map((ctrl) => {
                      const Icon = ctrl.icon;
                      return (
                        <div key={ctrl.key} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              {ctrl.label}
                            </label>
                            <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                              {adjustments[ctrl.key] > 0 ? "+" : ""}{adjustments[ctrl.key]}
                            </span>
                          </div>
                          <Slider
                            min={ctrl.min}
                            max={ctrl.max}
                            step={1}
                            value={[adjustments[ctrl.key]]}
                            onValueChange={([v]) => {
                              setAdjustments((prev) => ({ ...prev, [ctrl.key]: v }));
                              setActivePreset("None");
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Watermark toggle in results view */}
                  <div className="flex items-center gap-3 pt-2 border-t border-border">
                    <Switch checked={watermarkEnabled} onCheckedChange={setWatermarkEnabled} />
                    <span className="text-xs font-medium text-foreground">Watermark</span>
                    {watermarkEnabled && (
                      <input
                        type="text"
                        value={watermark.text}
                        onChange={(e) => setWatermark((prev) => ({ ...prev, text: e.target.value }))}
                        placeholder="Your Agency Name"
                        className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs"
                      />
                    )}
                  </div>

                  {hasAdjustments && (
                    <Button variant="ghost" size="sm" onClick={resetAdjustments} className="text-xs">
                      <RotateCcw className="w-3 h-3" /> Reset
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-6">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-xl border border-border p-4 space-y-3">
                {/* Status badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {job.status === "complete" && (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 bg-success/10 text-success text-xs font-semibold rounded-full">
                        <Check className="w-3 h-3" /> Enhanced
                      </span>
                    )}
                    {job.status === "processing" && (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 bg-primary/10 text-primary text-xs font-semibold rounded-full animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" /> Processing...
                      </span>
                    )}
                    {job.status === "pending" && (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 bg-secondary text-muted-foreground text-xs font-semibold rounded-full">
                        <Loader2 className="w-3 h-3 animate-spin" /> Queued
                      </span>
                    )}
                    {job.status === "failed" && (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 bg-destructive/10 text-destructive text-xs font-semibold rounded-full">
                        <AlertCircle className="w-3 h-3" /> Failed
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {job.status === "complete" && (
                      <Button variant="outline" size="sm" onClick={() => handleDownloadWithEdits(job)}>
                        <Download className="w-4 h-4" />
                        {hasAdjustments || watermarkEnabled ? "Export with Edits" : "Download"}
                      </Button>
                    )}

                    {job.status === "failed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          invokeEdgeFunction("enhance-photo", { body: { job_id: job.id } }).catch(console.error);
                          setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: "processing", error_message: null } : j));
                        }}
                      >
                        <RotateCcw className="w-4 h-4" />
                        Retry
                      </Button>
                    )}
                  </div>
                </div>

                {/* Before/After */}
                {job.status === "complete" && (job.enhanced_url || job.sky_url) ? (
                  <div className="relative group">
                    <BeforeAfterSlider
                      beforeUrl={job.original_url}
                      afterUrl={job.sky_url || job.enhanced_url!}
                      afterFilter={hasAdjustments ? cssFilter : undefined}
                      vignetteAmount={adjustments.vignette}
                    />
                    <button
                      onClick={() => handleDownloadWithEdits(job)}
                      className="absolute top-2 right-10 p-1.5 rounded-md bg-white/90 text-foreground hover:bg-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="aspect-[4/3] bg-secondary rounded-lg flex items-center justify-center">
                    {job.status === "failed" ? (
                      <p className="text-sm text-destructive">{job.error_message || "Enhancement failed"}</p>
                    ) : (
                      <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Start over */}
          {!isProcessing && (
            <Button variant="outline" onClick={() => { setJobs([]); setFiles([]); resetAdjustments(); }}>
              <ImagePlus className="w-4 h-4" />
              Enhance More Photos
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2: VIRTUAL STAGING — Enhanced with more rooms, styles, density, declutter
// ═══════════════════════════════════════════════════════════════════════════

function VirtualStagingTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [roomType, setRoomType] = useState("LIVINGROOM");
  const [designStyle, setDesignStyle] = useState("MODERN");
  const [furnitureDensity, setFurnitureDensity] = useState("medium");
  const [declutterEnabled, setDeclutterEnabled] = useState(false);
  const [lighting, setLighting] = useState("standard");
  const [mlsLabel, setMlsLabel] = useState<MlsLabelSettings>({
    enabled: true,
    text: "Virtually Staged",
    position: "bottom-left",
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobs, setJobs] = useState<PhotoJob[]>([]);

  // Variation viewer state
  const [selectedVariation, setSelectedVariation] = useState<Record<string, number>>({});
  const [fullscreenJob, setFullscreenJob] = useState<PhotoJob | null>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter(
      (f) => (f.type === "image/jpeg" || f.type === "image/png" || f.type === "image/webp") && f.size <= 20 * 1024 * 1024
    );
    setFiles((prev) => {
      const combined = [...prev, ...valid.map((f) => ({
        file: f,
        preview: URL.createObjectURL(f),
        name: f.name,
        size: formatFileSize(f.size),
      }))];
      return combined.slice(0, 5);
    });
  }, []);

  const removeFile = (index: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  }, [addFiles]);

  const getSelectedVariationIndex = (jobId: string) => selectedVariation[jobId] ?? 0;

  const handleStage = async () => {
    if (!user?.id || files.length === 0) return;
    setIsProcessing(true);
    setJobs([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const uploadedJobs: PhotoJob[] = [];

      for (const f of files) {
        const ext = f.file.name.split(".").pop() || "jpg";
        const path = `originals/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("property-photos")
          .upload(path, f.file, { cacheControl: "3600" });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("property-photos").getPublicUrl(path);

        const { data: job, error: jobError } = await supabase
          .from("photo_jobs")
          .insert({
            user_id: user.id,
            job_type: "stage",
            original_url: urlData.publicUrl,
            status: "pending",
            stage_options: {
              room_type: roomType,
              style: designStyle,
              furniture_density: furnitureDensity,
              declutter: declutterEnabled,
              ...(lighting !== "standard" && { lighting }),
            },
          })
          .select()
          .single();
        if (jobError) throw jobError;

        uploadedJobs.push({
          id: job.id,
          original_url: job.original_url,
          enhanced_url: null,
          sky_url: null,
          staged_urls: [],
          status: "pending",
          error_message: null,
          job_type: "stage",
          enhancements: {},
          stage_options: job.stage_options,
        });
      }

      setJobs(uploadedJobs);
      setStep(3);

      // Call edge function for each
      for (const job of uploadedJobs) {
        invokeEdgeFunction("stage-room", { body: { job_id: job.id } }).catch(console.error);
      }

      // Realtime + polling
      const channel = supabase
        .channel("photo-jobs-staging")
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "photo_jobs",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const updated = payload.new as Record<string, unknown>;
            setJobs((prev) =>
              prev.map((j) =>
                j.id === updated.id
                  ? {
                      ...j,
                      status: updated.status as PhotoJob["status"],
                      staged_urls: (updated.staged_urls as string[]) || [],
                      error_message: (updated.error_message as string) || null,
                    }
                  : j
              )
            );
          }
        )
        .subscribe();

      const pollIds = new Set(uploadedJobs.map((j) => j.id));
      const pollInterval = setInterval(async () => {
        if (pollIds.size === 0) {
          clearInterval(pollInterval);
          return;
        }
        const { data } = await supabase.from("photo_jobs").select("*").in("id", Array.from(pollIds));
        if (data) {
          for (const row of data) {
            if (row.status === "complete" || row.status === "failed") pollIds.delete(row.id);
            setJobs((prev) =>
              prev.map((j) =>
                j.id === row.id
                  ? { ...j, status: row.status, staged_urls: row.staged_urls || [], error_message: row.error_message }
                  : j
              )
            );
          }
        }
        if (pollIds.size === 0) {
          clearInterval(pollInterval);
          channel.unsubscribe();
          setIsProcessing(false);
        }
      }, 3000);
    } catch (err) {
      console.error("Staging error:", err);
      toast({ title: "Error", description: "Failed to start staging", variant: "destructive" });
      setIsProcessing(false);
    }
  };

  const resetToStep1 = () => {
    setStep(1);
    setFiles([]);
    setJobs([]);
    setIsProcessing(false);
    setSelectedVariation({});
  };

  const completedJobs = jobs.filter((j) => j.status === "complete");

  // Download with MLS label applied
  const downloadStagedImage = async (url: string, filename: string) => {
    if (mlsLabel.enabled && mlsLabel.text.trim()) {
      try {
        const blob = await exportWithMlsLabel(url, mlsLabel);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
        return;
      } catch { /* fallback to direct download */ }
    }
    downloadImage(url, filename);
  };

  const handleDownloadAll = async () => {
    if (mlsLabel.enabled && mlsLabel.text.trim()) {
      // Download with MLS labels applied
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const job of completedJobs) {
        for (let i = 0; i < job.staged_urls.length; i++) {
          const filename = `propertymotion-staged-${designStyle.toLowerCase()}-${job.id.slice(0, 8)}-v${i + 1}.jpg`;
          try {
            const blob = await exportWithMlsLabel(job.staged_urls[i], mlsLabel);
            zip.file(filename, blob);
          } catch {
            const res = await fetch(job.staged_urls[i]);
            zip.file(filename, await res.blob());
          }
        }
      }
      const content = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = "propertymotion-staged.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      const downloadFiles: { url: string; filename: string }[] = [];
      for (const job of completedJobs) {
        job.staged_urls.forEach((url, i) => {
          downloadFiles.push({
            url,
            filename: `propertymotion-staged-${designStyle.toLowerCase()}-${job.id.slice(0, 8)}-v${i + 1}.jpg`,
          });
        });
      }
      await downloadAllAsZip(downloadFiles, "propertymotion-staged.zip");
    }
  };

  return (
    <div className="space-y-8">
      {/* STEP 1 — Upload */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Upload Room Photos</h2>
            <p className="text-sm text-muted-foreground mt-1">For best results: empty or lightly furnished rooms. Up to 5 photos.</p>
          </div>

          <label
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            className={`block border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/50 hover:bg-secondary/30"
            }`}
          >
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))}
            />
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-secondary flex items-center justify-center">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground text-lg">
              {isDragging ? "Drop photos here" : "Drop room photos here or click to browse"}
            </p>
            <p className="text-sm text-muted-foreground mt-2">JPG, PNG, WEBP — Max 20MB per file</p>
          </label>

          {files.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {files.map((f, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-border">
                    <img src={f.preview} alt={f.name} className="aspect-square object-cover w-full" />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="hero" onClick={() => setStep(2)}>
                Continue
                <ArrowRight className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      )}

      {/* STEP 2 — Configure */}
      {step === 2 && (
        <div className="space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Configure Staging</h2>
            <p className="text-sm text-muted-foreground mt-1">Choose the room type, design style, and staging options.</p>
          </div>

          {/* Room Type */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Room Type</label>
            <div className="flex flex-wrap gap-3">
              {ROOM_TYPES.map((room) => {
                const Icon = room.icon;
                return (
                  <button
                    key={room.value}
                    onClick={() => setRoomType(room.value)}
                    className={`flex flex-col items-center gap-2 px-5 py-4 rounded-xl border-2 transition-all ${
                      roomType === room.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-xs font-medium">{room.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Design Style */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">Design Style</label>
            <div className="flex flex-wrap gap-3">
              {DESIGN_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() => setDesignStyle(style.value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 transition-all overflow-hidden ${
                    designStyle === style.value
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className={`w-24 h-16 bg-gradient-to-br ${style.color}`} />
                  <span className="text-xs font-medium text-foreground pb-2">{style.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Furniture Density */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" /> Furniture Density
            </label>
            <div className="flex gap-3">
              {FURNITURE_DENSITIES.map((density) => (
                <button
                  key={density.value}
                  onClick={() => setFurnitureDensity(density.value)}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all text-left ${
                    furnitureDensity === density.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{density.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{density.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Declutter Toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Eraser className="w-4 h-4 text-muted-foreground" /> Declutter First
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Remove existing furniture & clutter before staging — best for partially furnished rooms
              </p>
            </div>
            <Switch checked={declutterEnabled} onCheckedChange={setDeclutterEnabled} />
          </div>

          {/* Exterior Lighting */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Sunset className="w-4 h-4 text-muted-foreground" /> Exterior Lighting
            </label>
            <div className="flex gap-3">
              {LIGHTING_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setLighting(opt.value)}
                    className={`flex-1 p-4 rounded-xl border-2 transition-all text-left ${
                      lighting === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Icon className="w-4 h-4" /> {opt.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* MLS Compliance Label */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" /> MLS Compliance Label
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Auto-applies "Virtually Staged" label on downloads — required in CA (AB 723), best practice everywhere
                </p>
              </div>
              <Switch checked={mlsLabel.enabled} onCheckedChange={(v) => setMlsLabel((prev) => ({ ...prev, enabled: v }))} />
            </div>
            {mlsLabel.enabled && (
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Label Text</label>
                  <input
                    type="text"
                    value={mlsLabel.text}
                    onChange={(e) => setMlsLabel((prev) => ({ ...prev, text: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Position</label>
                  <div className="flex gap-1.5">
                    {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setMlsLabel((prev) => ({ ...prev, position: pos }))}
                        className={`px-2 py-1.5 rounded text-xs transition-colors ${
                          mlsLabel.position === pos
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground hover:bg-accent"
                        }`}
                      >
                        {pos.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button variant="hero" onClick={handleStage} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Staging...
                </>
              ) : (
                <>Stage {files.length} Room{files.length !== 1 ? "s" : ""}</>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Estimated time: ~45 seconds per room</p>
        </div>
      )}

      {/* STEP 3 — Results */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Staging Results</h2>
            {completedJobs.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                <Archive className="w-4 h-4" />
                Download All Variations
              </Button>
            )}
          </div>

          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl border border-border p-4 space-y-4">
              {/* Status */}
              <div className="flex items-center gap-2">
                {job.status === "complete" && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 bg-success/10 text-success text-xs font-semibold rounded-full">
                    <Check className="w-3 h-3" /> Staged
                  </span>
                )}
                {(job.status === "processing" || job.status === "pending") && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 bg-primary/10 text-primary text-xs font-semibold rounded-full animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> {job.status === "pending" ? "Queued" : "Staging..."}
                  </span>
                )}
                {job.status === "failed" && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 bg-destructive/10 text-destructive text-xs font-semibold rounded-full">
                    <AlertCircle className="w-3 h-3" /> Failed
                  </span>
                )}
                <span className="px-2 py-0.5 bg-secondary text-foreground text-xs font-medium rounded-full">
                  {DESIGN_STYLES.find((s) => s.value === designStyle)?.label || designStyle}
                </span>
                <span className="px-2 py-0.5 bg-secondary text-foreground text-xs font-medium rounded-full">
                  {ROOM_TYPES.find((r) => r.value === roomType)?.label || roomType}
                </span>
                {declutterEnabled && (
                  <span className="px-2 py-0.5 bg-orange-500/10 text-orange-600 text-xs font-medium rounded-full">
                    Decluttered
                  </span>
                )}
                {lighting !== "standard" && (
                  <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 text-xs font-medium rounded-full">
                    {LIGHTING_OPTIONS.find((l) => l.value === lighting)?.label}
                  </span>
                )}
                {mlsLabel.enabled && (
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-600 text-xs font-medium rounded-full flex items-center gap-1">
                    <Shield className="w-3 h-3" /> MLS Label
                  </span>
                )}
              </div>

              {/* Before/After for SELECTED variation */}
              {job.status === "complete" && job.staged_urls.length > 0 ? (
                <>
                  <BeforeAfterSlider
                    beforeUrl={job.original_url}
                    afterUrl={job.staged_urls[getSelectedVariationIndex(job.id)]}
                    large
                  />

                  {/* Variation selector — thumbnails with selection */}
                  {job.staged_urls.length > 1 && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Variations ({job.staged_urls.length})
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {job.staged_urls.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedVariation((prev) => ({ ...prev, [job.id]: i }))}
                            className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                              getSelectedVariationIndex(job.id) === i
                                ? "border-primary ring-2 ring-primary/20"
                                : "border-border hover:border-primary/30"
                            }`}
                          >
                            <img src={url} alt={`Variation ${i + 1}`} className="aspect-[4/3] object-cover w-full" />
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                              <span className="text-white text-xs font-medium">V{i + 1}</span>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadStagedImage(url, `propertymotion-staged-${designStyle.toLowerCase()}-${job.id.slice(0, 8)}-v${i + 1}.jpg`);
                              }}
                              className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-white/90 text-foreground hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions for this job */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadStagedImage(
                          job.staged_urls[getSelectedVariationIndex(job.id)],
                          `propertymotion-staged-${designStyle.toLowerCase()}-${job.id.slice(0, 8)}.jpg`,
                        )
                      }
                    >
                      <Download className="w-4 h-4" />
                      Download Selected
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFullscreenJob(job)}
                    >
                      <Eye className="w-4 h-4" />
                      Fullscreen
                    </Button>
                  </div>
                </>
              ) : job.status === "failed" ? (
                <div className="aspect-[4/3] bg-secondary rounded-lg flex flex-col items-center justify-center gap-3">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                  <p className="text-sm text-destructive">{job.error_message || "Staging failed"}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      invokeEdgeFunction("stage-room", { body: { job_id: job.id } }).catch(console.error);
                      setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: "processing", error_message: null } : j));
                    }}
                  >
                    <RotateCw className="w-4 h-4" /> Retry
                  </Button>
                </div>
              ) : (
                <div className="aspect-[4/3] bg-secondary rounded-lg flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                </div>
              )}
            </div>
          ))}

          {/* Navigation buttons */}
          {!isProcessing && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                <RotateCcw className="w-4 h-4" />
                Try Different Style
              </Button>
              <Button variant="outline" onClick={resetToStep1}>
                <ImagePlus className="w-4 h-4" />
                Stage Another Room
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen comparison dialog */}
      <Dialog open={!!fullscreenJob} onOpenChange={() => setFullscreenJob(null)}>
        <DialogContent className="max-w-5xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Before / After Comparison</DialogTitle>
            <DialogDescription>Drag the slider to compare original and staged versions.</DialogDescription>
          </DialogHeader>
          {fullscreenJob && fullscreenJob.staged_urls.length > 0 && (
            <div className="space-y-4">
              <BeforeAfterSlider
                beforeUrl={fullscreenJob.original_url}
                afterUrl={fullscreenJob.staged_urls[getSelectedVariationIndex(fullscreenJob.id)]}
                large
              />
              {fullscreenJob.staged_urls.length > 1 && (
                <div className="flex gap-2 justify-center">
                  {fullscreenJob.staged_urls.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedVariation((prev) => ({ ...prev, [fullscreenJob.id]: i }))}
                      className={`w-16 h-12 rounded-md overflow-hidden border-2 transition-all ${
                        getSelectedVariationIndex(fullscreenJob.id) === i
                          ? "border-primary"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <img src={url} alt={`V${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
