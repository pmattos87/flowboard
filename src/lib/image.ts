/** Largest input we'll read before downscaling (8 MB). */
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
/** Longest edge of the stored avatar, in pixels. */
const MAX_EDGE = 128;

/**
 * Reads an image file, downscales it so its longest edge is at most
 * {@link MAX_EDGE}px, and returns a base64 JPEG data URL suitable for storing
 * in the `people.avatar_data` column.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("Image is too large (max 8 MB).");
  }

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the image.");
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", 0.85);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image."));
    img.src = src;
  });
}
