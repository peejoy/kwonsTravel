import { expect, it } from "vitest";
import sharp from "sharp";
import { normalizeImage } from "@/lib/album/images";
it("strips EXIF and produces bounded JPEG display and thumbnail", async () => {
  const input = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#25806c" } }).jpeg().withExif({ IFD0: { Artist: "Private metadata" } }).toBuffer();
  const output = await normalizeImage(input);
  const display = await sharp(output.display).metadata(); const thumb = await sharp(output.thumbnail).metadata();
  expect(display.format).toBe("jpeg"); expect(display.width).toBe(2048); expect(display.exif).toBeUndefined(); expect(thumb.width).toBe(480);
});
it("rejects invalid bytes and overlarge bodies", async () => {
  await expect(normalizeImage(Buffer.from("not a photo"))).rejects.toThrow();
  await expect(normalizeImage(Buffer.alloc(3 * 1024 * 1024 + 1))).rejects.toThrow(/크기/);
});
