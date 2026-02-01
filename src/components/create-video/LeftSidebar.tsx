import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Play, Trash2, Settings, CreditCard, Sparkles, Zap, Crown } from "lucide-react";

interface RecentVideo {
  id: string;
  title: string;
  date: string;
  thumbnail: string;
}

const mockRecentVideos: RecentVideo[] = [
  {
    id: "1",
    title: "27 Alamanda Blvd",
    date: "2 Feb 2026",
    thumbnail: "https://picsum.photos/120/80?random=1",
  },
  {
    id: "2",
    title: "42 Smith Street",
    date: "1 Feb 2026",
    thumbnail: "https://picsum.photos/120/80?random=2",
  },
  {
    id: "3",
    title: "15 Ocean Drive",
    date: "30 Jan 2026",
    thumbnail: "https://picsum.photos/120/80?random=3",
  },
];

const templates = [
  { id: "modern", name: "Modern Luxe", icon: Sparkles },
  { id: "just-listed", name: "Just Listed", icon: Zap },
  { id: "minimal", name: "Minimalist", icon: Crown },
];

interface LeftSidebarProps {
  onNewVideo: () => void;
  selectedTemplate: string;
  onSelectTemplate: (id: string) => void;
}

export function LeftSidebar({ onNewVideo, selectedTemplate, onSelectTemplate }: LeftSidebarProps) {
  const navigate = useNavigate();
  const [hoveredVideo, setHoveredVideo] = useState<string | null>(null);

  return (
    <aside className="w-60 bg-card border-r border-border flex flex-col h-full overflow-hidden">
      {/* New Video Button */}
      <div className="p-4">
        <Button 
          variant="hero" 
          className="w-full gap-2" 
          onClick={onNewVideo}
        >
          <Plus className="w-4 h-4" />
          New Video
        </Button>
      </div>

      {/* Recent Videos */}
      <div className="flex-1 overflow-y-auto px-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Recent Videos
        </h3>
        <div className="space-y-2">
          {mockRecentVideos.map((video) => (
            <div
              key={video.id}
              className="group relative bg-secondary/50 rounded-lg p-2 hover:bg-secondary transition-colors cursor-pointer"
              onMouseEnter={() => setHoveredVideo(video.id)}
              onMouseLeave={() => setHoveredVideo(null)}
            >
              <div className="flex gap-3">
                <div className="relative w-16 h-10 rounded overflow-hidden flex-shrink-0">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  {hoveredVideo === video.id && (
                    <div className="absolute inset-0 bg-foreground/60 flex items-center justify-center">
                      <Play className="w-4 h-4 text-background" fill="currentColor" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{video.title}</p>
                  <p className="text-xs text-muted-foreground">{video.date}</p>
                </div>
              </div>
              {hoveredVideo === video.id && (
                <button
                  className="absolute top-2 right-2 p-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Handle delete
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>

        <button className="text-sm text-primary hover:underline mt-3 w-full text-left">
          View All Videos →
        </button>

        {/* Templates */}
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-6">
          Templates
        </h3>
        <div className="space-y-1">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => onSelectTemplate(template.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedTemplate === template.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <template.icon className="w-4 h-4" />
              {template.name}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Settings */}
      <div className="p-4 border-t border-border space-y-1">
        <button
          onClick={() => navigate("/settings")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <Settings className="w-4 h-4" />
          Account
        </button>
        <button
          onClick={() => navigate("/settings?tab=billing")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        >
          <CreditCard className="w-4 h-4" />
          Billing
        </button>
      </div>
    </aside>
  );
}
