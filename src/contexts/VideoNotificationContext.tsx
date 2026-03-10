import { createContext, useContext, useEffect, useRef, useCallback, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface VideoNotificationContextType {
  /** Force a refresh of the processing video check */
  checkNow: () => void;
}

const VideoNotificationContext = createContext<VideoNotificationContextType | undefined>(undefined);

/**
 * Polls Supabase for the user's processing videos and fires an in-app toast
 * when a video finishes (email notifications are handled server-side).
 *
 * Mount this once near the app root so it works on every page.
 */
export function VideoNotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Track IDs we already notified about so we don't spam
  const notifiedRef = useRef<Set<string>>(new Set());
  // Track which IDs were "processing" on the previous tick
  const prevProcessingRef = useRef<Set<string>>(new Set());

  const checkProcessingVideos = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from("videos")
        .select("id, status, property_address, video_url")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error || !data) return;

      const currentProcessing = new Set<string>();

      for (const v of data) {
        const isDone = v.status === "completed" || v.status === "done";
        const isFailed = v.status === "failed";
        const isProcessing = !isDone && !isFailed;

        if (isProcessing) {
          currentProcessing.add(v.id);
        }

        // If this video was previously processing and is now done, show in-app toast
        if (isDone && prevProcessingRef.current.has(v.id) && !notifiedRef.current.has(v.id)) {
          notifiedRef.current.add(v.id);
          const address = v.property_address || "your property";

          toast({
            title: "Video Ready!",
            description: `Your video for ${address} has finished generating.`,
          });
        }

        if (isFailed && prevProcessingRef.current.has(v.id) && !notifiedRef.current.has(v.id)) {
          notifiedRef.current.add(v.id);
          const address = v.property_address || "your property";

          toast({
            title: "Video Failed",
            description: `The video for ${address} failed to generate.`,
            variant: "destructive",
          });
        }
      }

      prevProcessingRef.current = currentProcessing;
    } catch {
      // Silently ignore — will retry on next tick
    }
  }, [user?.id, toast]);

  useEffect(() => {
    if (!user?.id) return;

    // Initial check (seeds the prevProcessingRef)
    checkProcessingVideos();

    // Poll every 15 seconds
    const interval = setInterval(checkProcessingVideos, 15_000);
    return () => clearInterval(interval);
  }, [user?.id, checkProcessingVideos]);

  return (
    <VideoNotificationContext.Provider value={{ checkNow: checkProcessingVideos }}>
      {children}
    </VideoNotificationContext.Provider>
  );
}

export function useVideoNotifications() {
  const context = useContext(VideoNotificationContext);
  if (!context) {
    throw new Error("useVideoNotifications must be used within a VideoNotificationProvider");
  }
  return context;
}
