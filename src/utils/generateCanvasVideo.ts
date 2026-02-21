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

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function getTransform(angle: CameraAngle, progress: number): Transform {
  const t = easeInOut(progress);
  switch (angle) {
    case "push-in":
    case "auto":
      return { scale: 1 + 0.12 * t, offsetX: 0, offsetY: 0 };
    case "push-out":
      return { scale: 1.12 - 0.12 * t, offsetX: 0, offsetY: 0 };
    case "orbit-right":
      return { scale: 1 + 0.04 * t, offsetX: -0.07 * t, offsetY: 0 };
    case "orbit-left":
      return { scale: 1 + 0.04 * t, offsetX: 0.07 * t, offsetY: 0 };
    case "wide-shot":
    default:
      return { scale: 1, offsetX: 0, offsetY: 0 };
  }
}

export async function generateCanvasVideo(
  imageUrl: string,
  cameraAngle: string,
  durationSeconds: number = 5,
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

      // Pre-compute object-fit: cover dimensions
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = canvas.width / canvas.height;
      let baseW: number, baseH: number, baseX: number, baseY: number;
      if (imgAspect > canvasAspect) {
        baseH = canvas.height;
        baseW = baseH * imgAspect;
        baseX = (canvas.width - baseW) / 2;
        baseY = 0;
      } else {
        baseW = canvas.width;
        baseH = baseW / imgAspect;
        baseX = 0;
        baseY = (canvas.height - baseH) / 2;
      }

      const totalFrames = Math.round(durationSeconds * fps);
      let frameIndex = 0;

      function drawFrame() {
        const progress = Math.min(frameIndex / totalFrames, 1);
        const { scale, offsetX, offsetY } = getTransform(
          cameraAngle as CameraAngle,
          progress
        );

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        // Transform from center so zoom/orbit is centered
        ctx.translate(
          canvas.width / 2 + offsetX * canvas.width,
          canvas.height / 2 + offsetY * canvas.height
        );
        ctx.scale(scale, scale);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
        ctx.drawImage(img, baseX, baseY, baseW, baseH);
        ctx.restore();

        frameIndex++;
        if (frameIndex <= totalFrames) {
          requestAnimationFrame(drawFrame);
        } else {
          recorder.stop();
        }
      }

      drawFrame();
    } catch (err) {
      reject(err);
    }
  });
}
