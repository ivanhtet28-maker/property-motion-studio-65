import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Maximize,
  Volume2,
  VolumeX,
  Loader2,
} from "lucide-react";

interface VideoPlayerProps {
  src: string | null;
  thumbnailUrl?: string | null;
  isRendering?: boolean;
  renderProgress?: string;
}

export default function VideoPlayer({
  src,
  thumbnailUrl,
  isRendering,
  renderProgress,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    video.currentTime = pct * duration;
  }, [duration]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Rendering overlay
  if (isRendering) {
    return (
      <div
        ref={containerRef}
        className="relative w-full aspect-[9/16] max-h-[500px] bg-black rounded-lg overflow-hidden border border-white/10 flex flex-col items-center justify-center gap-4"
      >
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt="Video thumbnail"
            className="absolute inset-0 w-full h-full object-cover opacity-20"
          />
        )}
        <Loader2 className="w-10 h-10 text-primary animate-spin relative z-10" />
        <p className="text-white text-sm font-medium relative z-10">Re-rendering video...</p>
        {renderProgress && (
          <p className="text-white/60 text-xs relative z-10">{renderProgress}</p>
        )}
      </div>
    );
  }

  // No video available
  if (!src) {
    return (
      <div
        ref={containerRef}
        className="relative w-full aspect-[9/16] max-h-[500px] bg-black rounded-lg overflow-hidden border border-white/10 flex flex-col items-center justify-center gap-3"
      >
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="Video thumbnail" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        ) : (
          <Play className="w-16 h-16 text-white/20" />
        )}
        <p className="text-white/40 text-sm relative z-10">No video available</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[9/16] max-h-[500px] bg-black rounded-lg overflow-hidden border border-white/10 group"
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        onClick={togglePlay}
        playsInline
      />

      {/* Play/Pause overlay */}
      {!isPlaying && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors"
        >
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="w-6 h-6 text-black ml-0.5" />
          </div>
        </button>
      )}

      {/* Controls bar (bottom) */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Progress bar */}
        <div
          className="w-full h-1 bg-white/20 rounded-full cursor-pointer mb-2"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="text-white hover:text-primary transition-colors">
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={toggleMute} className="text-white hover:text-primary transition-colors">
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <span className="text-white text-[10px] tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <button onClick={toggleFullscreen} className="text-white hover:text-primary transition-colors">
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
