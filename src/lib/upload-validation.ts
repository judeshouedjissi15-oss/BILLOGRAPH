export const IMAGE_CONTENT_TYPES: Record<string, string[]> = {
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".gif": ["image/gif"],
};

export const DIGITAL_CONTENT_TYPES: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".zip": ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
  ".mp3": ["audio/mpeg", "audio/mp3", "application/octet-stream"],
  ".mp4": ["video/mp4", "application/octet-stream"],
  ".apk": ["application/vnd.android.package-archive", "application/octet-stream"],
  ".epub": ["application/epub+zip", "application/octet-stream"],
};

export function imageMagicBytesOk(buffer: Uint8Array): boolean {
  if (buffer.length < 12) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e &&
    buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a &&
    buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return true;
  const decoder = new TextDecoder();
  const gif = decoder.decode(buffer.subarray(0, 6));
  if (gif === "GIF87a" || gif === "GIF89a") return true;
  return decoder.decode(buffer.subarray(0, 4)) === "RIFF" &&
    decoder.decode(buffer.subarray(8, 12)) === "WEBP";
}
