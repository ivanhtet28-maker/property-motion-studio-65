import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────

export interface StagingJob {
  id: string;
  original_url: string;
  staged_urls: string[];
  status: "pending" | "processing" | "complete" | "failed";
  error_message: string | null;
  stage_options: { room_type?: string; style?: string };
}

export interface UploadedFile {
  file: File;
  preview: string;
  name: string;
  size: string;
}

export interface StagingState {
  files: UploadedFile[];
  jobs: StagingJob[];
  isProcessing: boolean;
  roomType: string;
  designStyle: string;
  selectedVariation: Record<string, number>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

export function useStagingJobs() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [jobs, setJobs] = useState<StagingJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [roomType, setRoomType] = useState("LIVINGROOM");
  const [designStyle, setDesignStyle] = useState("MODERN");
  const [selectedVariation, setSelectedVariation] = useState<Record<string, number>>({});

  const completedJobs = jobs.filter((j) => j.status === "complete");

  const addFiles = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter(
      (f) =>
        (f.type === "image/jpeg" || f.type === "image/png" || f.type === "image/webp") &&
        f.size <= 20 * 1024 * 1024,
    );
    setFiles((prev) => {
      const combined = [
        ...prev,
        ...valid.map((f) => ({
          file: f,
          preview: URL.createObjectURL(f),
          name: f.name,
          size: formatFileSize(f.size),
        })),
      ];
      return combined.slice(0, 5);
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const getSelectedVariationIndex = useCallback(
    (jobId: string) => selectedVariation[jobId] ?? 0,
    [selectedVariation],
  );

  const selectVariation = useCallback((jobId: string, index: number) => {
    setSelectedVariation((prev) => ({ ...prev, [jobId]: index }));
  }, []);

  const stagePhotos = useCallback(async (): Promise<boolean> => {
    if (!user?.id || files.length === 0) return false;
    setIsProcessing(true);
    setJobs([]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const uploadedJobs: StagingJob[] = [];

      for (const f of files) {
        const ext = f.file.name.split(".").pop() || "jpg";
        const path = `${user.id}/originals/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("property-images")
          .upload(path, f.file, { cacheControl: "3600" });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("property-images").getPublicUrl(path);

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
            },
          })
          .select()
          .single();
        if (jobError) throw jobError;

        uploadedJobs.push({
          id: job.id,
          original_url: job.original_url,
          staged_urls: [],
          status: "pending",
          error_message: null,
          stage_options: job.stage_options,
        });
      }

      setJobs(uploadedJobs);

      // Call edge function for each
      for (const job of uploadedJobs) {
        invokeEdgeFunction("stage-room", { body: { job_id: job.id } }).catch((err) => {
          console.error("stage-room invocation failed:", err);
          setJobs((prev) =>
            prev.map((j) =>
              j.id === job.id
                ? {
                    ...j,
                    status: "failed" as const,
                    error_message: err instanceof Error ? err.message : "Failed to start staging",
                  }
                : j,
            ),
          );
          toast({
            title: "Staging failed",
            description: err instanceof Error ? err.message : "Failed to start room staging",
            variant: "destructive",
          });
        });
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
                      status: updated.status as StagingJob["status"],
                      staged_urls: (updated.staged_urls as string[]) || [],
                      error_message: (updated.error_message as string) || null,
                    }
                  : j,
              ),
            );
          },
        )
        .subscribe();

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
            if (row.status === "complete" || row.status === "failed") pollIds.delete(row.id);
            setJobs((prev) =>
              prev.map((j) =>
                j.id === row.id
                  ? {
                      ...j,
                      status: row.status,
                      staged_urls: row.staged_urls || [],
                      error_message: row.error_message,
                    }
                  : j,
              ),
            );
          }
        }
        if (pollIds.size === 0) {
          clearInterval(pollInterval);
          channel.unsubscribe();
          setIsProcessing(false);
        }
      }, 3000);

      return true;
    } catch (err) {
      console.error("Staging error:", err);
      toast({ title: "Error", description: "Failed to start staging", variant: "destructive" });
      setIsProcessing(false);
      return false;
    }
  }, [user, files, roomType, designStyle, toast]);

  const restageWithOptions = useCallback(
    async (newRoomType?: string, newStyle?: string) => {
      if (newRoomType) setRoomType(newRoomType);
      if (newStyle) setDesignStyle(newStyle);
      // Wait for state to update, then re-stage
      // We need to use the new values directly since setState is async
      if (!user?.id || files.length === 0) return;

      const effectiveRoom = newRoomType || roomType;
      const effectiveStyle = newStyle || designStyle;

      setIsProcessing(true);
      setJobs([]);
      setSelectedVariation({});

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const uploadedJobs: StagingJob[] = [];

        for (const f of files) {
          const ext = f.file.name.split(".").pop() || "jpg";
          const path = `${user.id}/originals/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("property-images")
            .upload(path, f.file, { cacheControl: "3600" });
          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage.from("property-images").getPublicUrl(path);

          const { data: job, error: jobError } = await supabase
            .from("photo_jobs")
            .insert({
              user_id: user.id,
              job_type: "stage",
              original_url: urlData.publicUrl,
              status: "pending",
              stage_options: {
                room_type: effectiveRoom,
                style: effectiveStyle,
              },
            })
            .select()
            .single();
          if (jobError) throw jobError;

          uploadedJobs.push({
            id: job.id,
            original_url: job.original_url,
            staged_urls: [],
            status: "pending",
            error_message: null,
            stage_options: job.stage_options,
          });
        }

        setJobs(uploadedJobs);

        for (const job of uploadedJobs) {
          invokeEdgeFunction("stage-room", { body: { job_id: job.id } }).catch((err) => {
            console.error("stage-room invocation failed:", err);
            setJobs((prev) =>
              prev.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      status: "failed" as const,
                      error_message:
                        err instanceof Error ? err.message : "Failed to start staging",
                    }
                  : j,
              ),
            );
          });
        }

        const channel = supabase
          .channel("photo-jobs-restaging")
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
                        status: updated.status as StagingJob["status"],
                        staged_urls: (updated.staged_urls as string[]) || [],
                        error_message: (updated.error_message as string) || null,
                      }
                    : j,
                ),
              );
            },
          )
          .subscribe();

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
              if (row.status === "complete" || row.status === "failed") pollIds.delete(row.id);
              setJobs((prev) =>
                prev.map((j) =>
                  j.id === row.id
                    ? {
                        ...j,
                        status: row.status,
                        staged_urls: row.staged_urls || [],
                        error_message: row.error_message,
                      }
                    : j,
                ),
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
        console.error("Re-staging error:", err);
        toast({ title: "Error", description: "Failed to re-stage", variant: "destructive" });
        setIsProcessing(false);
      }
    },
    [user, files, roomType, designStyle, toast],
  );

  const retryJob = useCallback(
    (jobId: string) => {
      invokeEdgeFunction("stage-room", { body: { job_id: jobId } }).catch((err) => {
        toast({
          title: "Retry failed",
          description: err instanceof Error ? err.message : "Failed to retry staging",
          variant: "destructive",
        });
      });
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId ? { ...j, status: "processing" as const, error_message: null } : j,
        ),
      );
    },
    [toast],
  );

  const reset = useCallback(() => {
    setFiles([]);
    setJobs([]);
    setIsProcessing(false);
    setSelectedVariation({});
  }, []);

  return {
    // State
    files,
    jobs,
    isProcessing,
    roomType,
    designStyle,
    selectedVariation,
    completedJobs,

    // Actions
    addFiles,
    removeFile,
    setRoomType,
    setDesignStyle,
    getSelectedVariationIndex,
    selectVariation,
    stagePhotos,
    restageWithOptions,
    retryJob,
    reset,
  };
}
