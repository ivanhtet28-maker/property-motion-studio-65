type CameraMotion =
  | "push-in"
  | "pull-out"
  | "glide-left"
  | "glide-right"
  | "orbit-right"
  | "orbit-left"
  | "drone-up"
  | "static";

const BASE_URL =
  "https://pxhpfewunsetuxygeprp.supabase.co/storage/v1/object/public/property-images/previews/";

const PREVIEW_VIDEOS: Record<CameraMotion, string | null> = {
  "push-in": BASE_URL + "Push%20In.mp4",
  "pull-out": BASE_URL + "Pull%20Out.mp4",
  "glide-left": BASE_URL + "Glide%20Left.mp4",
  "glide-right": BASE_URL + "Glide%20Right.mp4",
  "orbit-right": BASE_URL + "Orbit%20Right.mp4",
  "orbit-left": BASE_URL + "Orbit%20Left.mp4",
  "drone-up": BASE_URL + "Drone%20Up.mp4",
  "static": null,
};

interface CameraMotionPreviewProps {
  motion: CameraMotion;
  width?: number;
  height?: number;
}

export function CameraMotionPreview({
  motion,
  width = 200,
  height = 130,
}: CameraMotionPreviewProps) {
  const videoUrl = PREVIEW_VIDEOS[motion];

  if (!videoUrl) {
    return (
      <div
        className="rounded-md flex items-center justify-center text-muted-foreground text-xs"
        style={{
          width,
          height,
          background: "linear-gradient(135deg, #475569, #1e293b)",
        }}
      >
        No motion
      </div>
    );
  }

  return (
    <video
      key={motion}
      src={videoUrl}
      width={width}
      height={height}
      autoPlay
      loop
      muted
      playsInline
      className="rounded-md object-cover"
      style={{ width, height }}
    />
  );
}
