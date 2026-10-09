import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeExif, preparePhoto } from "@/lib/album/prepare";
vi.mock("exifr", () => ({ default: { parse: vi.fn(async () => ({ latitude: 26.3, longitude: 127.7, DateTimeOriginal: "2026:10:14 13:05:00" })) } }));
afterEach(() => vi.unstubAllGlobals());
describe("phone photo preparation", () => {
  it("extracts GPS and preserves timezone-free wall clock", () => {
    expect(normalizeExif({ latitude: 26.3, longitude: 127.7, DateTimeOriginal: "2026:10:14 13:05:00", Make: "private device" })).toEqual({ caption: "", lat: 26.3, lng: 127.7, locationSource: "exif", capturedAt: "2026-10-14T13:05:00", captureTimezone: null });
  });
  it("keeps a valid explicit offset but discards invalid GPS and dates", () => {
    expect(normalizeExif({ latitude: 99, longitude: 127, DateTimeOriginal: "2026:02:30 01:00:00" }).lat).toBeNull();
    expect(normalizeExif({ DateTimeOriginal: "2026:10:14 13:05:00", OffsetTimeOriginal: "+09:00" }).captureTimezone).toBe("+09:00");
    expect(normalizeExif(null).locationSource).toBe("none");
  });
  it("rejects oversized input before attempting image decode", async () => {
    const file = new File([new Uint8Array(30 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" });
    await expect(preparePhoto(file)).rejects.toThrow(/30/);
  });
  it("normalizes a decoded photo and closes the bitmap", async () => {
    const close = vi.fn(); const sizes: number[] = [];
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close })));
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toBlob(callback: (b: Blob) => void) { sizes.push(this.width); callback(new Blob(["jpeg"], { type: "image/jpeg" })); } }) });
    const photo = await preparePhoto(new File(["input"], "test.jpg", { type: "image/jpeg" }));
    expect(photo.blob.type).toBe("image/jpeg"); expect(sizes).toEqual([2048]); expect(close).toHaveBeenCalled();
    expect(photo.metadata.lat).toBe(26.3); URL.revokeObjectURL(photo.previewUrl);
  });
  it("shows a conversion error for unsupported HEIC decoding", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("decode"); }));
    await expect(preparePhoto(new File(["heic"], "test.heic", { type: "image/heic" }))).rejects.toThrow(/HEIC/);
  });
});
