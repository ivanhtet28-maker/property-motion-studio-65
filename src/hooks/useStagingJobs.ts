import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export interface StagingJob {
  id: string;
  original_url: string;
  staged_urls: string[];
  status: "pending" | "processing" | "complete" | "failed";
  error_message?: string;
  stage_options: {
    room_type: string;
    style: string;
  };
  created_at: string;
  updated_at: string;
}

export interface UseStagingJobsReturn {
  jobs: StagingJob[];
  isProcessing: boolean;
  stagePhotos: (
    imageUrls: string[],
    roomType: string,
    designStyle: string,
    userId: string
  ) => Promise<void>;
  restageWithOptions: (
    jobIds: string[],
    roomType: string,
    designStyle: string
  ) => Promise<void>;
  retryJob: (jobId: string) => Promise<void>;
  reset: () => void;
}

export function useStagingJobs(): UseStagingJobsReturn {
  const [jobs, setJobs] = useState<StagingJob[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initial photo staging submission
  const stagePhotos = useCallback(
    async (
      imageUrls: string[],
      roomType: string,
      designStyle: string,
      userId: string
    ) => {
      setIsProcessing(true);
      try {
        // Upload images to storage and create jobs
        const newJobs: StagingJob[] = [];

        for (let i = 0; i < imageUrls.length; i++) {
          const imageUrl = imageUrls[i];

          // Create photo job record in DB
          const { data: job, error: jobError } = await supabase
            .from("photo_jobs")
            .insert({
              user_id: userId,
              job_type: "stage",
              original_url: imageUrl,
              status: "pending",
              stage_options: {
                room_type: roomType,
                style: designStyle,
              },
            })
            .select()
            .single();

          if (jobError) {
            console.error("Failed to create staging job:", jobError);
            continue;
          }

          newJobs.push({
            id: job.id,
            original_url: job.original_url,
            staged_urls: [],
            status: "pending",
            error_message: undefined,
            stage_options: job.stage_options,
            created_at: job.created_at,
            updated_at: job.updated_at,
          });

          // Trigger edge function for this job
          try {
            await invokeEdgeFunction("stage-room", {
              body: { job_id: job.id },
            });
          } catch (err) {
            console.error("Failed to invoke stage-room:", err);
          }
        }

        setJobs((prev) => [...prev, ...newJobs]);

        // Poll for completion
        pollJobsForCompletion(newJobs.map((j) => j.id));
      } catch (err) {
        console.error("Error staging photos:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  // Re-stage with different room/style (without re-uploading)
  const restageWithOptions = useCallback(
    async (jobIds: string[], roomType: string, designStyle: string) => {
      setIsProcessing(true);
      try {
        for (const jobId of jobIds) {
          // Update job with new options
          await supabase
            .from("photo_jobs")
            .update({
              stage_options: { room_type: roomType, style: designStyle },
              status: "pending",
              staged_urls: [],
            })
            .eq("id", jobId);

          // Re-trigger staging
          await invokeEdgeFunction("stage-room", {
            body: { job_id: jobId },
          });
        }

        // Update local state
        setJobs((prev) =>
          prev.map((job) =>
            jobIds.includes(job.id)
              ? {
                  ...job,
                  status: "pending" as const,
                  staged_urls: [],
                  stage_options: { room_type: roomType, style: designStyle },
                }
              : job
          )
        );

        // Poll for completion
        pollJobsForCompletion(jobIds);
      } catch (err) {
        console.error("Error restaging photos:", err);
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  // Retry a failed job
  const retryJob = useCallback(async (jobId: string) => {
    setIsProcessing(true);
    try {
      await supabase
        .from("photo_jobs")
        .update({ status: "pending" })
        .eq("id", jobId);

      await invokeEdgeFunction("stage-room", {
        body: { job_id: jobId },
      });

      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId ? { ...job, status: "pending" as const } : job
        )
      );

      pollJobsForCompletion([jobId]);
    } catch (err) {
      console.error("Error retrying job:", err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setJobs([]);
    setIsProcessing(false);
  }, []);

  // Poll function (internal)
  const pollJobsForCompletion = (jobIds: string[]) => {
    const pollInterval = setInterval(async () => {
      try {
        const { data: updatedJobs } = await supabase
          .from("photo_jobs")
          .select("*")
          .in("id", jobIds);

        if (updatedJobs) {
          setJobs((prev) =>
            prev.map((job) => {
              const updated = updatedJobs.find((j) => j.id === job.id);
              return updated ? { ...job, ...updated } : job;
            })
          );

          // Check if all jobs are complete
          const allComplete = updatedJobs.every(
            (j) => j.status === "complete" || j.status === "failed"
          );
          if (allComplete) {
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error("Error polling job status:", err);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
  };

  return {
    jobs,
    isProcessing,
    stagePhotos,
    restageWithOptions,
    retryJob,
    reset,
  };
}
