import { useEffect, useRef } from "react";

type CameraMotion =
  | "push-in"
  | "pull-out"
  | "glide-left"
  | "glide-right"
  | "orbit-right"
  | "orbit-left"
  | "drone-up"
  | "static";

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeIn(t: number): number {
  return t * t * t;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function getTransform(motion: CameraMotion, progress: number): Transform {
  const panRange = 0.12;

  switch (motion) {
    case "push-in": {
      const t = easeOut(progress);
      return { scale: 1 + 0.06 * t, offsetX: 0, offsetY: 0 };
    }
    case "pull-out": {
      const t = easeIn(progress);
      return { scale: 1.06 - 0.06 * t, offsetX: 0, offsetY: 0 };
    }
    case "glide-left": {
      const t = easeInOut(progress);
      return { scale: 1, offsetX: -panRange * t, offsetY: 0 };
    }
    case "glide-right": {
      const t = easeInOut(progress);
      return { scale: 1, offsetX: panRange * t, offsetY: 0 };
    }
    case "orbit-right": {
      const t = easeInOut(progress);
      return { scale: 1 + 0.02 * t, offsetX: panRange * t, offsetY: 0 };
    }
    case "orbit-left": {
      const t = easeInOut(progress);
      return { scale: 1 + 0.02 * t, offsetX: -panRange * t, offsetY: 0 };
    }
    case "drone-up": {
      const t = easeIn(progress);
      return { scale: 1.06 - 0.06 * t, offsetX: 0, offsetY: 0.03 * t };
    }
    case "static":
    default:
      return { scale: 1, offsetX: 0, offsetY: 0 };
  }
}

const SAMPLE_IMAGE = "/images/staging-styles/modern.jpg";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Load sample image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = SAMPLE_IMAGE;
    imgRef.current = img;

    let startTime = 0;
    const durationMs = 2000; // 2s loop

    function draw(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const elapsed = (timestamp - startTime) % (durationMs + 500); // +500ms pause at end
      const progress = Math.min(elapsed / durationMs, 1);

      const { scale, offsetX, offsetY } = getTransform(motion, progress);

      ctx!.clearRect(0, 0, width, height);

      if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
        const imgAspect = imgRef.current.naturalWidth / imgRef.current.naturalHeight;
        const canvasAspect = width / height;

        let baseW: number, baseH: number, baseX: number, baseY: number;
        if (imgAspect >= canvasAspect) {
          baseH = height;
          baseW = baseH * imgAspect;
          baseX = (width - baseW) / 2;
          baseY = 0;
        } else {
          baseW = width;
          baseH = baseW / imgAspect;
          baseX = 0;
          baseY = (height - baseH) / 2;
        }

        ctx!.save();
        ctx!.translate(
          width / 2 + offsetX * width,
          height / 2 + offsetY * height
        );
        ctx!.scale(scale, scale);
        ctx!.translate(-width / 2, -height / 2);
        ctx!.drawImage(imgRef.current, baseX, baseY, baseW, baseH);
        ctx!.restore();
      } else {
        // Fallback gradient while image loads
        const grad = ctx!.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, "#475569");
        grad.addColorStop(1, "#1e293b");
        ctx!.fillStyle = grad;
        ctx!.fillRect(0, 0, width, height);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    // Start animation once image loads (or immediately for fallback)
    img.onload = () => {
      startTime = 0;
      rafRef.current = requestAnimationFrame(draw);
    };
    // Start with fallback immediately
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [motion, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-md"
      style={{ width, height }}
    />
  );
}
