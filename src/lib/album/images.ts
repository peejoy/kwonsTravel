import sharp from "sharp";
import { UPLOAD_LIMIT } from "./model";
export async function normalizeImage(bytes: Buffer): Promise<{ display: Buffer; thumbnail: Buffer }> {
  if (!bytes.length || bytes.length > UPLOAD_LIMIT) throw new Error("사진 크기를 확인해주세요.");
  const options = { limitInputPixels: 16_000_000 };
  const metadata = await sharp(bytes, options).metadata();
  if (metadata.format !== "jpeg" || (metadata.pages || 1) !== 1) throw new Error("JPEG 사진만 저장할 수 있습니다.");
  const display = await sharp(bytes, options).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  if (display.length > UPLOAD_LIMIT) throw new Error("변환된 사진 크기가 너무 큽니다.");
  const thumbnail = await sharp(display, options).resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  return { display, thumbnail };
}
