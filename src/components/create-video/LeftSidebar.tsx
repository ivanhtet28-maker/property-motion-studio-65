import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Play, Trash2, Settings, CreditCard, Sparkles, Zap, Crown, ChevronRight } from "lucide-react";

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
  { id: "modern", name: "Modern Luxe", icon: Sparkles, color: "from-violet-500 to-purple-600" },
  { id: "just-listed", name: "Just Listed", icon: Zap, color: "from-amber-500 to-orange-600" },
  { id: "minimal", name: "Minimalist", icon: Crown, color: "from-slate-500 to-gray-600" },
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
            {mockRecentVideos.length}
          </span>
        </div>
        
        <div className="space-y-2">
          {mockRecentVideos.map((video) => (
            <div
              key={video.id}
              className="group relative bg-secondary/40 hover:bg-secondary/70 rounded-xl p-2.5 transition-all cursor-pointer border border-transparent hover:border-border/50"
              onMouseEnter={() => setHoveredVideo(video.id)}
              onMouseLeave={() => setHoveredVideo(null)}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    // Handle delete
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <button className="text-sm text-primary hover:text-primary/80 mt-4 w-full text-left flex items-center gap-1 group">
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
