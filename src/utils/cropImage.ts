/**
 * Crops an image File to the target aspect ratio using a focal point (0-1 range).
 * Returns a new File with the cropped result.
 */
export async function cropImageToFile(
  file: File,
  focalX: number,
  focalY: number,
  targetAspect: number // e.g. 9/16 for portrait, 16/9 for landscape
): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const { width: imgW, height: imgH } = bitmap;
  const imgAspect = imgW / imgH;

  let cropW: number;
  let cropH: number;

  if (imgAspect > targetAspect) {
    // Image is wider than target — crop the width
    cropH = imgH;
    cropW = Math.round(imgH * targetAspect);
  } else {
    // Image is taller than target — crop the height
    cropW = imgW;
    cropH = Math.round(imgW / targetAspect);
  }

  // Position crop rect centered on focal point, clamped to image bounds
  const maxLeft = imgW - cropW;
  const maxTop = imgH - cropH;
  const idealLeft = focalX * imgW - cropW / 2;
  const idealTop = focalY * imgH - cropH / 2;
  const cropLeft = Math.max(0, Math.min(maxLeft, Math.round(idealLeft)));
  const cropTop = Math.max(0, Math.min(maxTop, Math.round(idealTop)));

  // Draw cropped region to canvas
  const canvas = new OffscreenCanvas(cropW, cropH);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);
  bitmap.close();

  // Convert to blob then File
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
  return new File([blob], file.name, { type: "image/jpeg" });
}
