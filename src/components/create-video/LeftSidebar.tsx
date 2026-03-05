import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Play, Trash2, Settings, CreditCard, Sparkles, Zap, Crown, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface RecentVideo {
  id: string;
  title: string;
  date: string;
  thumbnail: string;
  videoUrl?: string;
}

const templates = [
  { id: "modern", name: "Modern Luxe", icon: Sparkles, color: "from-violet-500 to-purple-600" },
  { id: "just-listed", name: "Just Listed", icon: Zap, color: "from-amber-500 to-orange-600" },
  { id: "minimal", name: "Minimalist", icon: Crown, color: "from-slate-500 to-gray-600" },
];

interface LeftSidebarProps {
  onNewVideo: () => void;
  selectedTemplate: string;
  onSelectTemplate: (id: string) => void;
  refreshTrigger?: number; // Increment this to trigger a refresh
}

export function LeftSidebar({ onNewVideo, selectedTemplate, onSelectTemplate, refreshTrigger }: LeftSidebarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);
  const [recentVideos, setRecentVideos] = useState<RecentVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecentVideos();
  }, [user, refreshTrigger]);

  const loadRecentVideos = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("videos")
        .select("id, created_at, thumbnail_url, video_url, property_address")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);

      if (error) throw error;

      const transformedVideos: RecentVideo[] = (data || []).map(v => ({
        id: v.id,
        title: v.property_address || "Property Video",
        date: new Date(v.created_at).toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }),
        thumbnail: v.thumbnail_url || "https://picsum.photos/120/80?random=1",
        videoUrl: v.video_url,
      }));

      setRecentVideos(transformedVideos);
    } catch (err) {
      console.error("Failed to load recent videos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVideo = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this video?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("videos")
        .delete()
        .eq("id", videoId);

      if (error) throw error;

      // Reload videos after deletion
      loadRecentVideos();
    } catch (err) {
      console.error("Failed to delete video:", err);
    }
  };

  return (
    <aside className="w-64 bg-gradient-to-b from-card via-card to-secondary/30 border-r border-border/50 flex flex-col h-full overflow-hidden">
      {/* New Video Button */}
      <div className="p-4">
        <Button 
          variant="hero" 
          className="w-full gap-2 shadow-lg shadow-primary/20 h-11" 
          onClick={onNewVideo}
        >
          <Plus className="w-4 h-4" />
          New Video
        </Button>
      </div>

      {/* Recent Videos */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Recent Videos
          </h3>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
            {recentVideos.length}
          </span>
        </div>

        <div className="space-y-2">
          {loading ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">Loading...</p>
            </div>
          ) : recentVideos.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">No videos yet</p>
            </div>
          ) : (
            recentVideos.map((video) => (
              <div
                key={video.id}
                className="group relative bg-secondary/40 hover:bg-secondary/70 rounded-xl p-2.5 transition-all cursor-pointer border border-transparent hover:border-border/50"
                onMouseEnter={() => setHoveredVideo(video.id)}
                onMouseLeave={() => setHoveredVideo(null)}
                onClick={() => navigate("/dashboard")}
              >
                <div className="flex gap-3">
                  <div className="relative w-16 h-11 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    {hoveredVideo === video.id && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity">
                        <Play className="w-4 h-4 text-white" fill="white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 py-0.5">
                    <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
                    <p className="text-xs text-muted-foreground">{video.date}</p>
                  </div>
                </div>
                {hoveredVideo === video.id && (
                  <button
                    className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-all opacity-0 group-hover:opacity-100"
                    onClick={(e) => handleDeleteVideo(video.id, e)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <button
          className="text-sm text-primary hover:text-primary/80 mt-4 w-full text-left flex items-center gap-1 group"
          onClick={() => navigate("/dashboard")}
        >
          View All Videos
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>

        {/* Templates */}
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 mt-8">
          Templates
        </h3>
        <div className="space-y-2">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                selectedTemplate === template.id
                  ? "bg-primary/10 text-primary font-medium border border-primary/20 shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground border border-transparent"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${template.color} flex items-center justify-center shadow-sm`}>
                <template.icon className="w-4 h-4 text-white" />
              </div>
              {template.name}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Settings */}
      <div className="p-4 border-t border-border/50 bg-card/50 space-y-1">
        <button
          onClick={() => navigate("/settings")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
            <Settings className="w-4 h-4" />
          </div>
          Account
        </button>
        <button
          onClick={() => navigate("/settings?tab=billing")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary/70 hover:text-foreground transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
            <CreditCard className="w-4 h-4" />
          </div>
          Billing
        </button>
      </div>
    </aside>
  );
}
