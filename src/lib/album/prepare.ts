import exifr from "exifr";
import { emptyMetadata, photoMetadataSchema, SOURCE_LIMIT, UPLOAD_LIMIT, type PhotoMetadata } from "./model";
export type PreparedPhoto = { blob: Blob; previewUrl: string; metadata: PhotoMetadata };
export function normalizeExif(raw: Record<string, unknown> | null): PhotoMetadata {
  let result = { ...emptyMetadata };
  if (!raw) return result;
  const gps = photoMetadataSchema.safeParse({ ...result, lat: raw.latitude, lng: raw.longitude, locationSource: "exif" });
  if (gps.success) result = gps.data;
  const capture = typeof raw.DateTimeOriginal === "string" ? raw.DateTimeOriginal.replace(/^(\d{4}):(\d{2}):(\d{2}) /, "$1-$2-$3T") : null;
  const date = photoMetadataSchema.safeParse({ ...result, capturedAt: capture });
  if (date.success) result = date.data;
  if (result.capturedAt && typeof raw.OffsetTimeOriginal === "string") {
    const offset = photoMetadataSchema.safeParse({ ...result, captureTimezone: raw.OffsetTimeOriginal });
    if (offset.success) result = offset.data;
  }
  return result;
}
async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (error) { URL.revokeObjectURL(url); throw error; }
  } catch {
    throw new Error(/heic|heif/i.test(file.type + file.name) ? "이 브라우저에서는 HEIC 사진을 읽을 수 없습니다. JPEG로 변환해 올려주세요." : "사진을 읽을 수 없습니다. JPEG·PNG·WebP 사진을 확인해주세요.");
  }
}
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.size || file.size > SOURCE_LIMIT) throw new Error("사진 원본 크기는 30MB 이하로 선택해주세요.");
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("지원하지 않는 사진 형식입니다.");
  const metadata = normalizeExif(await exifr.parse(file, { reviveValues: false }).catch(() => null));
  const image = await decode(file);
  try {
    if (!image.width || !image.height || image.width * image.height > 100_000_000) throw new Error("사진 해상도가 너무 큽니다.");
    const ratio = Math.min(1, 2048 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d"); if (!context) throw new Error("사진 변환을 시작하지 못했습니다.");
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob?.size && blob.size <= UPLOAD_LIMIT) return { blob, metadata, previewUrl: URL.createObjectURL(blob) };
    }
    throw new Error("사진을 3MB 이하로 줄이지 못했습니다. 작은 사진을 선택해주세요.");
  } finally { image.close(); }
}
