import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  Sparkles,
  Bath,
  TreePine,
  Car,
  Baby,
  Layers,
  Eye,
  RotateCw,
  Shield,
  Sunset,
  Sun,
  Moon,
  Eraser,
  CheckSquare,
  Square,
} from "lucide-react";
import { useStagingJobs, type StagingJob } from "@/hooks/useStagingJobs";

// ── Constants ──────────────────────────────────────────────────────────────

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

// ── MLS Label Export ───────────────────────────────────────────────────────

interface MlsLabelSettings {
  enabled: boolean;
  text: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
}

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

// ── Download helpers ───────────────────────────────────────────────────────

async function downloadImage(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function downloadAllAsZip(
  files: { url: string; filename: string }[],
  zipName: string,
) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  await Promise.all(
    files.map(async ({ url, filename }) => {
      const res = await fetch(url);
      if (!res.ok) return;
      const blob = await res.blob();
      zip.file(filename, blob);
    }),
  );
  const content = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(content);
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Before/After Slider ────────────────────────────────────────────────────

function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string;
  afterUrl: string;
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
      className="relative overflow-hidden rounded-lg border border-border select-none cursor-col-resize aspect-[4/3]"
      onMouseDown={() => { dragging.current = true; }}
      onTouchStart={() => { dragging.current = true; }}
    >
      <img src={afterUrl} alt="After" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        <img
          src={beforeUrl}
          alt="Before"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ minWidth: containerRef.current ? `${containerRef.current.offsetWidth}px` : "100%" }}
        />
      </div>
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
      <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full z-20">Before</span>
      <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full z-20">After</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STAGING FLOW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function StagingFlow() {
  const staging = useStagingJobs();
  const [step, setStep] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [mlsLabel, setMlsLabel] = useState<MlsLabelSettings>({
    enabled: true,
    text: "Virtually Staged",
    position: "bottom-left",
  });
  const [fullscreenJob, setFullscreenJob] = useState<StagingJob | null>(null);
  const [selectedDownloads, setSelectedDownloads] = useState<Set<string>>(new Set());
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [showStyleModal, setShowStyleModal] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    staging.addFiles(Array.from(e.dataTransfer.files));
  }, [staging]);

  const handleStage = async () => {
    const success = await staging.stagePhotos();
    if (success) setStep(3);
  };

  const handleRestageRoom = async (newRoom: string) => {
    setShowRoomModal(false);
    await staging.restageWithOptions(newRoom, undefined);
  };

  const handleRestageStyle = async (newStyle: string) => {
    setShowStyleModal(false);
    await staging.restageWithOptions(undefined, newStyle);
  };

  const resetToStep1 = () => {
    staging.reset();
    setStep(1);
    setSelectedDownloads(new Set());
  };

  // Toggle download selection for a specific variation
  const toggleDownloadSelection = (key: string) => {
    setSelectedDownloads((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAllForDownload = () => {
    const keys = new Set<string>();
    for (const job of staging.completedJobs) {
      job.staged_urls.forEach((_, i) => keys.add(`${job.id}-${i}`));
    }
    setSelectedDownloads(keys);
  };

  const deselectAllForDownload = () => setSelectedDownloads(new Set());

  // Download with MLS label
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
      } catch { /* fallback */ }
    }
    downloadImage(url, filename);
  };

  const handleDownloadSelected = async () => {
    if (selectedDownloads.size === 0) return;
    if (selectedDownloads.size === 1) {
      // Single download
      for (const key of selectedDownloads) {
        const [jobId, varIdx] = key.split("-");
        const job = staging.completedJobs.find((j) => j.id === jobId);
        if (job) {
          const url = job.staged_urls[parseInt(varIdx)];
          if (url) await downloadStagedImage(url, `propertymotion-staged-${staging.designStyle.toLowerCase()}-${jobId.slice(0, 8)}-v${parseInt(varIdx) + 1}.jpg`);
        }
      }
      return;
    }
    // Multi download as zip
    if (mlsLabel.enabled && mlsLabel.text.trim()) {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const key of selectedDownloads) {
        const [jobId, varIdx] = key.split("-");
        const job = staging.completedJobs.find((j) => j.id === jobId);
        if (!job) continue;
        const url = job.staged_urls[parseInt(varIdx)];
        if (!url) continue;
        const filename = `propertymotion-staged-${staging.designStyle.toLowerCase()}-${jobId.slice(0, 8)}-v${parseInt(varIdx) + 1}.jpg`;
        try {
          const blob = await exportWithMlsLabel(url, mlsLabel);
          zip.file(filename, blob);
        } catch {
          const res = await fetch(url);
          zip.file(filename, await res.blob());
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
      for (const key of selectedDownloads) {
        const [jobId, varIdx] = key.split("-");
        const job = staging.completedJobs.find((j) => j.id === jobId);
        if (!job) continue;
        const url = job.staged_urls[parseInt(varIdx)];
        if (!url) continue;
        downloadFiles.push({
          url,
          filename: `propertymotion-staged-${staging.designStyle.toLowerCase()}-${jobId.slice(0, 8)}-v${parseInt(varIdx) + 1}.jpg`,
        });
      }
      await downloadAllAsZip(downloadFiles, "propertymotion-staged.zip");
    }
  };

  const handleDownloadAll = async () => {
    if (mlsLabel.enabled && mlsLabel.text.trim()) {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const job of staging.completedJobs) {
        for (let i = 0; i < job.staged_urls.length; i++) {
          const filename = `propertymotion-staged-${staging.designStyle.toLowerCase()}-${job.id.slice(0, 8)}-v${i + 1}.jpg`;
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
      for (const job of staging.completedJobs) {
        job.staged_urls.forEach((url, i) => {
          downloadFiles.push({
            url,
            filename: `propertymotion-staged-${staging.designStyle.toLowerCase()}-${job.id.slice(0, 8)}-v${i + 1}.jpg`,
          });
        });
      }
      await downloadAllAsZip(downloadFiles, "propertymotion-staged.zip");
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Step Indicator ──────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {[
          { num: 1, label: "Upload" },
          { num: 2, label: "Configure" },
          { num: 3, label: "Results" },
        ].map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            {i > 0 && <div className={`w-8 h-0.5 ${step >= s.num ? "bg-primary" : "bg-border"}`} />}
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  step >= s.num
                    ? step === s.num
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/20 text-primary"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
              </div>
              <span className={`text-sm font-medium ${step >= s.num ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STEP 1 — Upload Photos                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Upload Room Photos</h2>
            <p className="text-sm text-muted-foreground mt-1">
              For best results: empty or lightly furnished rooms. Up to 5 photos.
            </p>
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
              onChange={(e) => e.target.files && staging.addFiles(Array.from(e.target.files))}
            />
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-secondary flex items-center justify-center">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground text-lg">
              {isDragging ? "Drop photos here" : "Drop room photos here or click to browse"}
            </p>
            <p className="text-sm text-muted-foreground mt-2">JPG, PNG, WEBP — Max 20MB per file</p>
          </label>

          {staging.files.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {staging.files.map((f, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-border">
                    <img src={f.preview} alt={f.name} className="aspect-square object-cover w-full" />
                    <button
                      onClick={() => staging.removeFile(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                      <p className="text-white text-xs truncate">{f.name}</p>
                      <p className="text-white/60 text-[10px]">{f.size}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="hero" onClick={() => setStep(2)}>
                Continue to Configure
                <ArrowRight className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STEP 2 — Configure with Preview                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
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
                    onClick={() => staging.setRoomType(room.value)}
                    className={`flex flex-col items-center gap-2 px-5 py-4 rounded-xl border-2 transition-all ${
                      staging.roomType === room.value
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
                  onClick={() => staging.setDesignStyle(style.value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border-2 transition-all overflow-hidden ${
                    staging.designStyle === style.value
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

          {/* Furniture Density — Coming Soon */}
          <div className="space-y-3 opacity-50 pointer-events-none">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" /> Furniture Density
              <span className="px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-semibold rounded-full uppercase tracking-wider">Coming Soon</span>
            </label>
            <div className="flex gap-3">
              {FURNITURE_DENSITIES.map((density) => (
                <button
                  key={density.value}
                  className={`flex-1 p-4 rounded-xl border-2 text-left ${
                    density.value === "medium" ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{density.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{density.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Declutter Toggle — Coming Soon */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card opacity-50">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Eraser className="w-4 h-4 text-muted-foreground" /> Declutter First
                <span className="px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-semibold rounded-full uppercase tracking-wider">Coming Soon</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Remove existing furniture & clutter before staging — best for partially furnished rooms
              </p>
            </div>
            <Switch checked={false} disabled />
          </div>

          {/* Exterior Lighting — Coming Soon */}
          <div className="space-y-3 opacity-50 pointer-events-none">
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Sunset className="w-4 h-4 text-muted-foreground" /> Exterior Lighting
              <span className="px-2 py-0.5 bg-muted text-muted-foreground text-[10px] font-semibold rounded-full uppercase tracking-wider">Coming Soon</span>
            </label>
            <div className="flex gap-3">
              {LIGHTING_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    className={`flex-1 p-4 rounded-xl border-2 text-left ${
                      opt.value === "standard" ? "border-primary bg-primary/5" : "border-border"
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

          {/* ── Preview Card (NEW) ──────────────────────────────── */}
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              Staging Preview
            </h3>
            <div className="flex gap-4 items-start">
              {/* Photo thumbnails */}
              <div className="flex gap-2 flex-shrink-0">
                {staging.files.slice(0, 3).map((f, i) => (
                  <div key={i} className="w-20 h-16 rounded-lg overflow-hidden border border-border">
                    <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                  </div>
                ))}
                {staging.files.length > 3 && (
                  <div className="w-20 h-16 rounded-lg border border-border bg-secondary flex items-center justify-center">
                    <span className="text-xs text-muted-foreground font-medium">+{staging.files.length - 3}</span>
                  </div>
                )}
              </div>
              {/* Summary */}
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary text-foreground text-xs font-medium rounded-full">
                    {(() => {
                      const room = ROOM_TYPES.find((r) => r.value === staging.roomType);
                      if (!room) return staging.roomType;
                      const Icon = room.icon;
                      return <><Icon className="w-3.5 h-3.5" /> {room.label}</>;
                    })()}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-secondary text-foreground text-xs font-medium rounded-full">
                    <Sparkles className="w-3.5 h-3.5" />
                    {DESIGN_STYLES.find((s) => s.value === staging.designStyle)?.label || staging.designStyle}
                  </span>
                  {mlsLabel.enabled && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-600 text-xs font-medium rounded-full">
                      <Shield className="w-3 h-3" /> MLS Label
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {staging.files.length} photo{staging.files.length !== 1 ? "s" : ""} will be virtually staged with 4 design variations each.
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="w-3 h-3" />
                  Processing takes ~30 seconds per photo
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <Button variant="hero" onClick={handleStage} disabled={staging.isProcessing} className="gap-2">
              {staging.isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Staging...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Submit for Virtual Staging
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* STEP 3 — Results with Variations Grid + Quick-Switch       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="space-y-6">
          {/* Header + Download Actions */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-foreground">Staging Results</h2>
            <div className="flex items-center gap-2">
              {staging.completedJobs.length > 0 && (
                <>
                  {selectedDownloads.size > 0 && (
                    <Button variant="hero" size="sm" onClick={handleDownloadSelected}>
                      <Download className="w-4 h-4" />
                      Download Selected ({selectedDownloads.size})
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                    <Archive className="w-4 h-4" />
                    Download All
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* ── Quick-Switch Buttons (NEW) ──────────────────────── */}
          {!staging.isProcessing && staging.completedJobs.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-secondary/50 border border-border">
              <span className="text-xs text-muted-foreground font-medium self-center mr-1">Quick re-stage:</span>
              <Button variant="outline" size="sm" onClick={() => setShowRoomModal(true)} className="gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Try Different Room
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowStyleModal(true)} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Try Different Style
              </Button>
            </div>
          )}

          {/* Re-staging loading indicator */}
          {staging.isProcessing && staging.jobs.some((j) => j.status === "pending" || j.status === "processing") && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <div>
                <p className="text-sm font-medium text-foreground">Staging in progress...</p>
                <p className="text-xs text-muted-foreground">This takes about 30 seconds per photo. You'll see variations appear below.</p>
              </div>
            </div>
          )}

          {/* Decor8 attribution */}
          {staging.completedJobs.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Images generated by Decor8 AI
            </p>
          )}

          {/* ── Results Grid ───────────────────────────────────── */}
          {staging.jobs.map((job) => (
            <div key={job.id} className="rounded-xl border border-border p-4 space-y-4">
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
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
                  {DESIGN_STYLES.find((s) => s.value === staging.designStyle)?.label || staging.designStyle}
                </span>
                <span className="px-2 py-0.5 bg-secondary text-foreground text-xs font-medium rounded-full">
                  {ROOM_TYPES.find((r) => r.value === staging.roomType)?.label || staging.roomType}
                </span>
                {mlsLabel.enabled && (
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-600 text-xs font-medium rounded-full flex items-center gap-1">
                    <Shield className="w-3 h-3" /> MLS Label
                  </span>
                )}
              </div>

              {/* Completed: Before/After + Variations Grid */}
              {job.status === "complete" && job.staged_urls.length > 0 ? (
                <>
                  {/* Before/After slider for selected variation */}
                  <BeforeAfterSlider
                    beforeUrl={job.original_url}
                    afterUrl={job.staged_urls[staging.getSelectedVariationIndex(job.id)]}
                  />

                  {/* Variations grid (4 side-by-side) */}
                  {job.staged_urls.length > 1 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Variations ({job.staged_urls.length})
                        </label>
                        <div className="flex gap-1">
                          <button
                            onClick={() => {
                              const allSelected = job.staged_urls.every((_, i) => selectedDownloads.has(`${job.id}-${i}`));
                              if (allSelected) {
                                setSelectedDownloads((prev) => {
                                  const next = new Set(prev);
                                  job.staged_urls.forEach((_, i) => next.delete(`${job.id}-${i}`));
                                  return next;
                                });
                              } else {
                                setSelectedDownloads((prev) => {
                                  const next = new Set(prev);
                                  job.staged_urls.forEach((_, i) => next.add(`${job.id}-${i}`));
                                  return next;
                                });
                              }
                            }}
                            className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            {job.staged_urls.every((_, i) => selectedDownloads.has(`${job.id}-${i}`))
                              ? <><CheckSquare className="w-3 h-3" /> Deselect all</>
                              : <><Square className="w-3 h-3" /> Select all</>
                            }
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {job.staged_urls.map((url, i) => {
                          const isSelected = staging.getSelectedVariationIndex(job.id) === i;
                          const isChecked = selectedDownloads.has(`${job.id}-${i}`);
                          return (
                            <button
                              key={i}
                              onClick={() => staging.selectVariation(job.id, i)}
                              className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                                isSelected
                                  ? "border-primary ring-2 ring-primary/20"
                                  : "border-border hover:border-primary/30"
                              }`}
                            >
                              <img src={url} alt={`Variation ${i + 1}`} className="aspect-[4/3] object-cover w-full" />
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-white text-xs font-medium">V{i + 1}</span>
                                  <span className="text-white/70 text-[10px]">
                                    {ROOM_TYPES.find((r) => r.value === staging.roomType)?.label} · {DESIGN_STYLES.find((s) => s.value === staging.designStyle)?.label}
                                  </span>
                                </div>
                              </div>
                              {/* Download checkbox */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleDownloadSelection(`${job.id}-${i}`);
                                }}
                                className={`absolute top-1.5 left-1.5 w-5 h-5 rounded flex items-center justify-center transition-all ${
                                  isChecked
                                    ? "bg-primary text-white"
                                    : "bg-black/50 text-white/60 opacity-0 group-hover:opacity-100"
                                }`}
                              >
                                {isChecked && <Check className="w-3 h-3" />}
                              </button>
                              {/* Individual download */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadStagedImage(url, `propertymotion-staged-${staging.designStyle.toLowerCase()}-${job.id.slice(0, 8)}-v${i + 1}.jpg`);
                                }}
                                className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-white/90 text-foreground hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Per-job actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadStagedImage(
                          job.staged_urls[staging.getSelectedVariationIndex(job.id)],
                          `propertymotion-staged-${staging.designStyle.toLowerCase()}-${job.id.slice(0, 8)}.jpg`,
                        )
                      }
                    >
                      <Download className="w-4 h-4" />
                      Download Selected
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setFullscreenJob(job)}>
                      <Eye className="w-4 h-4" />
                      Fullscreen
                    </Button>
                  </div>
                </>
              ) : job.status === "failed" ? (
                <div className="aspect-[4/3] bg-secondary rounded-lg flex flex-col items-center justify-center gap-3">
                  <AlertCircle className="w-8 h-8 text-destructive" />
                  <p className="text-sm text-destructive">{job.error_message || "Staging failed"}</p>
                  <Button variant="outline" size="sm" onClick={() => staging.retryJob(job.id)}>
                    <RotateCw className="w-4 h-4" /> Retry
                  </Button>
                </div>
              ) : (
                <div className="aspect-[4/3] bg-secondary rounded-lg flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                  <p className="text-sm text-muted-foreground">Generating 4 variations...</p>
                  <p className="text-xs text-muted-foreground">This takes about 30 seconds</p>
                </div>
              )}
            </div>
          ))}

          {/* Bottom navigation */}
          {!staging.isProcessing && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={resetToStep1}>
                <ImagePlus className="w-4 h-4" />
                Stage Another Room
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Room Selector Modal (Quick-Switch)                          */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={showRoomModal} onOpenChange={setShowRoomModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Try Different Room Type</DialogTitle>
            <DialogDescription>Select a new room type to re-stage your photos without re-uploading.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-4">
            {ROOM_TYPES.map((room) => {
              const Icon = room.icon;
              return (
                <button
                  key={room.value}
                  onClick={() => handleRestageRoom(room.value)}
                  className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border-2 transition-all ${
                    staging.roomType === room.value
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
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Style Selector Modal (Quick-Switch)                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Dialog open={showStyleModal} onOpenChange={setShowStyleModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Try Different Style</DialogTitle>
            <DialogDescription>Select a new design style to re-stage your photos without re-uploading.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 py-4">
            {DESIGN_STYLES.map((style) => (
              <button
                key={style.value}
                onClick={() => handleRestageStyle(style.value)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 transition-all overflow-hidden ${
                  staging.designStyle === style.value
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-border hover:border-primary/30"
                }`}
              >
                <div className={`w-full h-12 bg-gradient-to-br ${style.color}`} />
                <span className="text-xs font-medium text-foreground pb-2">{style.label}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* Fullscreen Comparison Dialog                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
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
                afterUrl={fullscreenJob.staged_urls[staging.getSelectedVariationIndex(fullscreenJob.id)]}
              />
              {fullscreenJob.staged_urls.length > 1 && (
                <div className="flex gap-2 justify-center">
                  {fullscreenJob.staged_urls.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => staging.selectVariation(fullscreenJob.id, i)}
                      className={`w-16 h-12 rounded-md overflow-hidden border-2 transition-all ${
                        staging.getSelectedVariationIndex(fullscreenJob.id) === i
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
