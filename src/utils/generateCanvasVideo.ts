/**
 * Generates a video clip from a static image using Canvas + MediaRecorder.
 * Uses mathematical transforms for camera movements — zero AI, instant generation.
 */

type CameraAngle =
  | "auto"
  | "wide-shot"
  | "push-in"
  | "push-out"
  | "orbit-right"
  | "orbit-left";

interface Transform {
  scale: number;
  offsetX: number; // fraction of canvas width
  offsetY: number; // fraction of canvas height
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3); // cubic: fast confident start, smooth settle
}

function easeIn(t: number): number {
  return t * t * t; // cubic: slow deliberate start, accelerates away
}

function getTransform(angle: CameraAngle, progress: number): Transform {
  switch (angle) {
    case "push-in":
    case "auto": {
      // Gentle forward push — 6% zoom so the full room stays visible
      const t = easeOut(progress);
      return { scale: 1 + 0.06 * t, offsetX: 0, offsetY: 0 };
    }
    case "push-out": {
      // Pull back from slight zoom — reverse of push-in
      const t = easeIn(progress);
      return { scale: 1.06 - 0.06 * t, offsetX: 0, offsetY: 0 };
    }
    case "orbit-right": {
      // Arc right: subtle zoom + lateral pan to reveal room edge
      const t = easeOut(progress);
      return { scale: 1 + 0.06 * t, offsetX: -0.06 * t, offsetY: 0 };
    }
    case "orbit-left": {
      const t = easeOut(progress);
      return { scale: 1 + 0.06 * t, offsetX: 0.06 * t, offsetY: 0 };
    }
    case "wide-shot":
    default:
      return { scale: 1, offsetX: 0, offsetY: 0 };
  }
}

export async function generateCanvasVideo(
  imageUrl: string,
  cameraAngle: string,
  durationSeconds: number = 3.5,
  fps: number = 30
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      // Load image with CORS support for Supabase public URLs
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () =>
          rej(new Error(`Failed to load image: ${imageUrl}`));
        img.src = imageUrl;
      });

      // 9:16 portrait canvas — matches the video output format
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d")!;

      // Pick best available codec
      const mimeType =
        ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(
          (t) => MediaRecorder.isTypeSupported(t)
        ) ?? "video/webm";

      const chunks: BlobPart[] = [];
      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 6_000_000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () =>
        reject(new Error("MediaRecorder error during canvas video generation"));

      recorder.start(100); // emit chunks every 100ms

      // Determine fit strategy based on image vs canvas aspect ratio
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = canvas.width / canvas.height; // 0.5625 for 9:16
      const isLandscape = imgAspect > canvasAspect;

      // object-fit: contain — preserves the full image composition
      // Landscape photos: fit to canvas width, letterbox top/bottom
      // Portrait photos: fit to canvas height, letterbox left/right
      let baseW: number, baseH: number, baseX: number, baseY: number;
      if (isLandscape) {
        baseW = canvas.width;
        baseH = canvas.width / imgAspect;
        baseX = 0;
        baseY = (canvas.height - baseH) / 2;
      } else {
        baseH = canvas.height;
        baseW = canvas.height * imgAspect;
        baseX = (canvas.width - baseW) / 2;
        baseY = 0;
      }

      // Cover-mode coords for blurred background (fills letterbox areas for landscape shots)
      let bgW: number, bgH: number, bgX: number, bgY: number;
      if (isLandscape) {
        bgH = canvas.height;
        bgW = bgH * imgAspect;
        bgX = (canvas.width - bgW) / 2;
        bgY = 0;
      } else {
        bgW = baseW; bgH = baseH; bgX = baseX; bgY = baseY;
      }

      const durationMs = durationSeconds * 1000;
      const startTime = performance.now();

      function drawFrame() {
        // Time-based progress — correct regardless of display refresh rate (60Hz, 120Hz, etc.)
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const { scale, offsetX, offsetY } = getTransform(
          cameraAngle as CameraAngle,
          progress
        );

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Blurred, darkened background for landscape images.
        // Fills the letterbox areas (top/bottom) and provides a cinematic
        // backdrop when orbits pan the main image slightly off-center.
        if (isLandscape) {
          ctx.save();
          ctx.filter = "blur(30px) brightness(0.35)";
          ctx.drawImage(img, bgX, bgY, bgW, bgH);
          ctx.filter = "none";
          ctx.restore();
        }

        // Main image with camera transform
        ctx.save();
        ctx.translate(
          canvas.width / 2 + offsetX * canvas.width,
          canvas.height / 2 + offsetY * canvas.height
        );
        ctx.scale(scale, scale);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
        ctx.drawImage(img, baseX, baseY, baseW, baseH);
        ctx.restore();

        if (progress < 1) {
          requestAnimationFrame(drawFrame);
        } else {
          // Hold the final frame for one more tick so MediaRecorder captures it
          setTimeout(() => recorder.stop(), 200);
        }
      }

      drawFrame();
    } catch (err) {
      reject(err);
    }
  });
}
