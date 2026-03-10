import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
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
  stage_options: { room_type?: string; style?: string };
}

interface UploadedFile {
  file: File;
  preview: string;
  name: string;
  size: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SKY_OPTIONS = [
  { value: "blue_sky", label: "Blue Sky" },
  { value: "golden_hour", label: "Golden Hour" },
  { value: "twilight", label: "Twilight" },
];

const ROOM_TYPES = [
  { value: "LIVINGROOM", label: "Living", icon: Sofa },
  { value: "BEDROOM", label: "Bed", icon: BedDouble },
  { value: "KITCHEN", label: "Kitchen", icon: CookingPot },
  { value: "DININGROOM", label: "Dining", icon: UtensilsCrossed },
  { value: "OFFICE", label: "Office", icon: Briefcase },
];

const DESIGN_STYLES = [
  { value: "MODERN", label: "Modern", color: "from-slate-400 to-slate-600" },
  { value: "SCANDINAVIAN", label: "Scandi", color: "from-amber-100 to-stone-300" },
  { value: "LUXURY", label: "Luxury", color: "from-yellow-600 to-amber-800" },
  { value: "FARMHOUSE", label: "Farmhouse", color: "from-green-300 to-emerald-500" },
  { value: "MINIMALIST", label: "Minimalist", color: "from-gray-100 to-gray-300" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// ── Before/After Slider ────────────────────────────────────────────────────

function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  large = false,
}: {
  beforeUrl: string;
  afterUrl: string;
  large?: boolean;
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
      <img src={afterUrl} alt="After" className="absolute inset-0 w-full h-full object-cover" />
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
      <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">Before</span>
      <span className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">After</span>
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
// TAB 1: PHOTO EDIT
// ═══════════════════════════════════════════════════════════════════════════

function PhotoEditTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Upload state
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Enhancement options
  const [enhanceEnabled, setEnhanceEnabled] = useState(true);
  const [skyEnabled, setSkyEnabled] = useState(false);
  const [skyType, setSkyType] = useState("blue_sky");

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobs, setJobs] = useState<PhotoJob[]>([]);

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

  // Process photos
  const handleEnhance = async () => {
    if (!user?.id || files.length === 0 || (!enhanceEnabled && !skyEnabled)) return;
    setIsProcessing(true);
    setJobs([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

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
        supabase.functions.invoke("enhance-photo", { body: { job_id: job.id } }).catch(console.error);
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

      // Poll fallback for each job
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {files.map((f, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-border">
                    <img src={f.preview} alt={f.name} className="aspect-square object-cover w-full" />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-destructive text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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

              {/* Enhancement Options */}
              <div className="space-y-3">
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

              {/* Action Button */}
              <Button
                variant="hero"
                size="lg"
                onClick={handleEnhance}
                disabled={files.length === 0 || (!enhanceEnabled && !skyEnabled) || isProcessing}
                className="w-full"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>Enhance {files.length} Photo{files.length !== 1 ? "s" : ""}</>
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
            {canDownloadAll && (
              <Button variant="outline" size="sm" onClick={handleDownloadAll}>
                <Archive className="w-4 h-4" />
                Download All Enhanced
              </Button>
            )}
          </div>

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

                  {job.status === "complete" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        downloadImage(
                          job.sky_url || job.enhanced_url || job.original_url,
                          `propertymotion-enhanced-${job.id.slice(0, 8)}.jpg`
                        )
                      }
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  )}

                  {job.status === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        supabase.functions.invoke("enhance-photo", { body: { job_id: job.id } }).catch(console.error);
                        setJobs((prev) => prev.map((j) => j.id === job.id ? { ...j, status: "processing", error_message: null } : j));
                      }}
                    >
                      <RotateCcw className="w-4 h-4" />
                      Retry
                    </Button>
                  )}
                </div>

                {/* Before/After */}
                {job.status === "complete" && (job.enhanced_url || job.sky_url) ? (
                  <div className="relative group">
                    <BeforeAfterSlider
                      beforeUrl={job.original_url}
                      afterUrl={job.sky_url || job.enhanced_url!}
                    />
                    {/* Download overlay on hover */}
                    <button
                      onClick={() =>
                        downloadImage(
                          job.sky_url || job.enhanced_url || job.original_url,
                          `propertymotion-enhanced-${job.id.slice(0, 8)}.jpg`
                        )
                      }
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
            <Button variant="outline" onClick={() => { setJobs([]); setFiles([]); }}>
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
// TAB 2: VIRTUAL STAGING
// ═══════════════════════════════════════════════════════════════════════════

function VirtualStagingTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [roomType, setRoomType] = useState("LIVINGROOM");
  const [designStyle, setDesignStyle] = useState("MODERN");
  const [isProcessing, setIsProcessing] = useState(false);
  const [jobs, setJobs] = useState<PhotoJob[]>([]);

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
            stage_options: { room_type: roomType, style: designStyle },
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
        supabase.functions.invoke("stage-room", { body: { job_id: job.id } }).catch(console.error);
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
  };

  const completedJobs = jobs.filter((j) => j.status === "complete");

  const handleDownloadAll = async () => {
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
            <p className="text-sm text-muted-foreground mt-1">Choose the room type and design style.</p>
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
                  {designStyle}
                </span>
              </div>

              {/* Before/After for first variation */}
              {job.status === "complete" && job.staged_urls.length > 0 ? (
                <>
                  <BeforeAfterSlider
                    beforeUrl={job.original_url}
                    afterUrl={job.staged_urls[0]}
                    large
                  />

                  {/* All variations */}
                  {job.staged_urls.length > 1 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {job.staged_urls.map((url, i) => (
                        <div key={i} className="relative group rounded-lg overflow-hidden border border-border">
                          <img src={url} alt={`Variation ${i + 1}`} className="aspect-square object-cover w-full" />
                          <button
                            onClick={() =>
                              downloadImage(url, `propertymotion-staged-${designStyle.toLowerCase()}-${job.id.slice(0, 8)}-v${i + 1}.jpg`)
                            }
                            className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-white/90 text-foreground hover:bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Single download */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadImage(job.staged_urls[0], `propertymotion-staged-${designStyle.toLowerCase()}-${job.id.slice(0, 8)}.jpg`)}
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </>
              ) : job.status === "failed" ? (
                <div className="aspect-[4/3] bg-secondary rounded-lg flex items-center justify-center">
                  <p className="text-sm text-destructive">{job.error_message || "Staging failed"}</p>
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
    </div>
  );
}
