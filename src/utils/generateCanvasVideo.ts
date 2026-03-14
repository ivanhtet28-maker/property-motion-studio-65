/**
 * Generates a video clip from a static image using Canvas + MediaRecorder.
 * Uses mathematical transforms for camera movements — zero AI, instant generation.
 */

type CameraAngle =
  | "auto"
  | "wide-shot"
  | "push-in"
  | "pull-out"
  | "tracking"
  | "orbit"
  | "crane-up"
  | "drone-up"
  | "static";

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

// How much of the image is hidden by the crop. Returns a 0-1 fraction of the
// scaled image width that overflows the canvas on ONE side.
// e.g. a 3:2 photo in a 9:16 canvas → baseW/canvasW ≈ 2.69 → overflow ~0.31
function cropOverflow(baseW: number, canvasW: number): number {
  if (baseW <= canvasW) return 0;
  return (baseW - canvasW) / (2 * baseW);
}

function getTransform(
  angle: CameraAngle,
  progress: number,
  /** fraction of image hidden on one side by the crop (0 = no crop) */
  sideOverflow: number = 0,
): Transform {
  // For orbit/tracking in a heavily cropped portrait frame, scale offset so
  // the camera travels far enough to reveal hidden content (e.g. kitchen).
  // Base 5% offset, boosted up to ~20% when 30%+ of the image is cropped.
  // Capped at 0.22 to keep the motion cinematic (not a full side-to-side pan).
  const panRange = Math.min(0.30, 0.10 + sideOverflow * 0.55);

  switch (angle) {
    case "push-in":
    case "auto": {
      const t = easeOut(progress);
      return { scale: 1 + 0.04 * t, offsetX: 0, offsetY: 0 };
    }
    case "pull-out": {
      const t = easeIn(progress);
      return { scale: 1.04 - 0.04 * t, offsetX: 0, offsetY: 0 };
    }
    case "tracking": {
      const t = easeInOut(progress);
      return { scale: 1, offsetX: -panRange * t, offsetY: 0 };
    }
    case "orbit": {
      const t = easeInOut(progress);
      return { scale: 1, offsetX: panRange * t, offsetY: 0 };
    }
    case "crane-up": {
      const t = easeInOut(progress);
      return { scale: 1, offsetX: 0, offsetY: 0.03 * t };
    }
    case "drone-up": {
      const t = easeIn(progress);
      return { scale: 1.04 - 0.04 * t, offsetX: 0, offsetY: 0.02 * t };
    }
    case "static":
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

  return new Promise((resolve, reject) => {
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
      if (imgAspect >= canvasAspect) {
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
    } else {
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
    }

    const sideOverflow = cropOverflow(baseW, canvas.width);
    const durationMs = durationSeconds * 1000;
    const startTime = performance.now();

    function drawFrame() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const { scale, offsetX, offsetY } = getTransform(
        cameraAngle as CameraAngle,
        progress,
        sideOverflow
      );

      ctx.clearRect(0, 0, canvas.width, canvas.height);

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
        setTimeout(() => recorder.stop(), 200);
      }
    }

    drawFrame();
  });
}
