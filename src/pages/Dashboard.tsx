import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { callVideoStatus } from "@/lib/callVideoStatus";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Video,
  Download,
  Trash2,
  Play,
  Plus,
  X,
  Pencil,
  Clapperboard,
  Share2,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SubscriptionModal } from "@/components/SubscriptionModal";
import { useToast } from "@/hooks/use-toast";

interface VideoItem {
  id: string;
  address: string;
  createdAt: string;
  status: "ready" | "processing" | "failed";
  thumbnailUrl?: string;
  videoUrl?: string;
  suburb?: string;
  state?: string;
  renderId?: string;
  generationContext?: string; // JSON string with Luma generation IDs + polling data
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [playingVideoUrl, setPlayingVideoUrl] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Transform data for UI
      const transformedVideos: VideoItem[] = (data || []).map((v) => {
        const propertyAddress = v.property_address || "Unknown Address";

        // Calculate time ago
        const createdDate = new Date(v.created_at);
        const now = new Date();
        const diffMs = now.getTime() - createdDate.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        let createdAt: string;
        if (diffMins < 60) {
          createdAt = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        } else if (diffHours < 24) {
          createdAt = `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        } else if (diffDays < 7) {
          createdAt = `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        } else {
          createdAt = createdDate.toLocaleDateString();
        }

        // Map status
        let status: "ready" | "processing" | "failed";
        if (v.status === "completed" || v.status === "done") {
          status = "ready";
        } else if (v.status === "failed") {
          status = "failed";
        } else {
          status = "processing";
        }

        return {
          id: v.id,
          address: propertyAddress,
          status: status,
          createdAt: createdAt,
          videoUrl: v.video_url,
          thumbnailUrl: v.thumbnail_url,
          renderId: v.render_id || undefined,
          generationContext: v.photos || undefined,
        };
      });

      setVideos(transformedVideos);
    } catch (err) {
      console.error("Failed to load videos:", err);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Auto-check stuck "processing" videos that have recovery data.
  // Uses a ref to avoid re-render loops — the effect only re-runs when
  // the set of processing video IDs actually changes.
  const processingIdsRef = useRef<string>("");

  useEffect(() => {
    const processingVideos = videos.filter(v => v.status === "processing" && (v.renderId || v.generationContext));
    const processingKey = processingVideos.map(v => v.id).join(",");

    // Skip if the processing set hasn't changed
    if (processingKey === processingIdsRef.current) return;
    processingIdsRef.current = processingKey;

    if (processingVideos.length === 0) return;

    let cancelled = false;

    const checkStuckVideos = async () => {
      for (const video of processingVideos) {
        if (cancelled) break;
        try {
          let body: Record<string, unknown>;

          if (video.renderId) {
            body = {
              stitchJobId: video.renderId,
              videoId: video.id,
            };
          } else if (video.generationContext) {
            const ctx = JSON.parse(video.generationContext);
            body = {
              generationIds: ctx.generationIds,
              videoId: video.id,
              audioUrl: ctx.audioUrl,
              musicUrl: ctx.musicUrl,
              agentInfo: ctx.agentInfo,
              propertyData: ctx.propertyData,
              style: ctx.style,
              layout: ctx.layout || "open-house",
              customTitle: ctx.customTitle || "",
              clipDurations: ctx.clipDurations,
              imageUrls: ctx.imageUrls,
            };
          } else {
            continue;
          }

          let data: Record<string, unknown>;
          try {
            data = await callVideoStatus(body);
          } catch (err) {
            console.error("Error checking stuck video:", video.id, err);
            continue;
          }

          if (data.status === "done" || data.status === "failed") {
            loadVideos();
            break;
          }
        } catch (err) {
          console.error("Error polling stuck video:", err);
        }
      }
    };

    checkStuckVideos();
    const interval = setInterval(checkStuckVideos, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [videos, loadVideos]);

  // Load subscription status
  useEffect(() => {
    const loadSubscriptionStatus = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from("users")
        .select("subscription_status")
        .eq("id", user.id)
        .single();

      if (!error && data) {
        setSubscriptionStatus(data.subscription_status);
      }
    };

    loadSubscriptionStatus();
  }, [user]);

  // Handle download with subscription check
  const handleDownload = async (videoUrl: string | undefined) => {
    if (!videoUrl) {
      toast({
        title: "Video not ready",
        description: "This video is still processing",
        variant: "destructive",
      });
      return;
    }

    // Check if user has active subscription
    if (subscriptionStatus !== "active") {
      // Redirect to landing page pricing section
      navigate("/");
      setTimeout(() => {
        const pricingSection = document.getElementById("pricing");
        if (pricingSection) {
          pricingSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
      return;
    }

    // Allow download
    window.open(videoUrl, "_blank");
  };

  const filteredVideos = videos;

  return (
    <DashboardLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-foreground">Videos</h1>
          <Button asChild variant="hero" size="default">
            <Link to="/create">
              <Plus className="w-4 h-4" />
              New video
            </Link>
          </Button>
        </div>

          {/* Video Grid */}
          {loading ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
                <Video className="w-10 h-10 text-muted-foreground animate-pulse" />
              </div>
              <p className="text-muted-foreground">Loading videos...</p>
            </div>
          ) : filteredVideos.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  className="group cursor-pointer"
                  onClick={() => {
                    if (video.status === "ready" && video.videoUrl) {
                      setPlayingVideoUrl(video.videoUrl);
                    }
                  }}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[4/3] bg-secondary rounded-lg overflow-hidden relative border border-border">
                    {video.thumbnailUrl ? (
                      <img
                        src={video.thumbnailUrl}
                        alt={video.address}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Video className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}

                    {/* Play overlay on hover */}
                    {video.status === "ready" && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                        <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                          <Play className="w-5 h-5 text-foreground ml-0.5" />
                        </div>
                      </div>
                    )}

                    {/* Processing indicator */}
                    {video.status === "processing" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Video className="w-6 h-6 text-white animate-pulse" />
                      </div>
                    )}

                    {/* Hover actions */}
                    {video.status === "ready" && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(video.videoUrl); }}
                          className="p-1.5 rounded-md bg-white/90 text-foreground hover:bg-white transition-colors"
                          aria-label="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-md bg-white/90 text-destructive hover:bg-white transition-colors"
                          aria-label="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="mt-2.5">
                    <h3 className="text-sm font-medium text-foreground truncate" title={video.address}>
                      {video.address}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Edited {video.createdAt}</p>

                    {/* Edit / Share buttons */}
                    {video.status === "ready" && (
                      <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-accent transition-colors">
                              Edit
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            <DropdownMenuItem onClick={() => navigate(`/quick-edit/${video.id}`)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Quick Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/studio/${video.id}`)}>
                              <Clapperboard className="w-4 h-4 mr-2" />
                              Studio
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-accent transition-colors">
                          Share
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="text-center py-20">
              <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mx-auto mb-6">
                <Video className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No videos yet</h3>
              <p className="text-muted-foreground mb-8">
                Create your first professional listing video
              </p>
              <Button asChild variant="hero" size="lg">
                <Link to="/create">
                  <Plus className="w-5 h-5" />
                  Create Video
                </Link>
              </Button>
            </div>
          )}
      </div>

      {/* Video Player Modal */}
      {playingVideoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setPlayingVideoUrl(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={() => setPlayingVideoUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <div
            onClick={(e) => {
              e.stopPropagation();
              const video = e.currentTarget.querySelector("video");
              if (video) video.paused ? video.play() : video.pause();
            }}
            className="max-h-[90vh] max-w-[90vw] cursor-pointer"
          >
            <video
              src={playingVideoUrl}
              autoPlay
              className="max-h-[90vh] max-w-[90vw] rounded-lg"
            />
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      <SubscriptionModal
        open={showSubscriptionModal}
        onOpenChange={setShowSubscriptionModal}
      />
    </DashboardLayout>
  );
}
