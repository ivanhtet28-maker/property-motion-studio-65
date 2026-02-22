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

// Smooth symmetric ease used for pans — mirrors how a videographer
// gently starts a tripod rotation, holds a steady rate, then decelerates.
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function getTransform(angle: CameraAngle, progress: number): Transform {
  switch (angle) {
    case "push-in":
    case "auto": {
      // Gentle dolly forward — 4% zoom keeps the full room in frame
      const t = easeOut(progress);
      return { scale: 1 + 0.04 * t, offsetX: 0, offsetY: 0 };
    }
    case "push-out": {
      // Slow pull-back reveal — reverse of push-in
      const t = easeIn(progress);
      return { scale: 1.04 - 0.04 * t, offsetX: 0, offsetY: 0 };
    }
    case "orbit-right": {
      // Pure pan right: NO simultaneous zoom — that's what makes it feel natural.
      // A real videographer rotates the tripod head steadily with no focal-length change.
      // 12% horizontal offset reveals the far side of a wide-angle room shot.
      const t = easeInOut(progress);
      return { scale: 1, offsetX: -0.12 * t, offsetY: 0 };
    }
    case "orbit-left": {
      // Pure pan left — mirror of orbit-right.
      const t = easeInOut(progress);
      return { scale: 1, offsetX: 0.12 * t, offsetY: 0 };
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
  fps: number = 30,
  format: "portrait" | "landscape" = "portrait"
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

      const canvas = document.createElement("canvas");
      if (format === "landscape") {
        // 16:9 landscape — full room composition, standard widescreen
        canvas.width = 1280;
        canvas.height = 720;
      } else {
        // 9:16 portrait — social media / mobile format
        canvas.width = 720;
        canvas.height = 1280;
      }
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

      const imgAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = canvas.width / canvas.height;

      let baseW: number, baseH: number, baseX: number, baseY: number;

      if (format === "landscape") {
        // Landscape 16:9 canvas — use cover mode.
        // Property photos are typically 3:2 or wider (1.5–1.78:1), fitting naturally
        // into 16:9 with only minor top/bottom crop (< 10%).
        if (imgAspect >= canvasAspect) {
          // Photo wider than 16:9: fit to height, slight left/right crop
          baseH = canvas.height;
          baseW = baseH * imgAspect;
          baseX = (canvas.width - baseW) / 2;
          baseY = 0;
        } else {
          // Photo narrower than 16:9: fit to width, slight top/bottom crop
          baseW = canvas.width;
          baseH = baseW / imgAspect;
          baseX = 0;
          baseY = (canvas.height - baseH) / 2;
        }
      } else {
        // Portrait 9:16 canvas — cover mode: center crop of the room.
        // Shows the actual room contents without any letterboxing or blurred bars.
        // Orbit camera moves reveal different parts of the wide-angle room naturally.
        if (imgAspect > canvasAspect) {
          // Landscape photo in portrait canvas: fit to height, center crop left/right
          baseH = canvas.height;
          baseW = baseH * imgAspect;
          baseX = (canvas.width - baseW) / 2;
          baseY = 0;
        } else {
          // Portrait/square photo: fit to width, center crop top/bottom
          baseW = canvas.width;
          baseH = baseW / imgAspect;
          baseX = 0;
          baseY = (canvas.height - baseH) / 2;
        }
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
