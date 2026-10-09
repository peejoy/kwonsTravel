import { describe, expect, it } from "vitest";
import { photoMetadataSchema, photoPaths, photoDateKey, encodeCursor, decodeCursor } from "@/lib/album/model";
const base = { caption: "", capturedAt: null, captureTimezone: null, lat: null, lng: null, locationSource: "none" };
describe("album metadata", () => {
  it.each([
    { lat: 26 }, { lng: 127 }, { lat: 91, lng: 127, locationSource: "manual" },
    { lat: 26, lng: Infinity, locationSource: "exif" }, { locationSource: "exif" },
    { caption: "x".repeat(1001) }, { capturedAt: "2026-02-30T12:00:00" },
    { captureTimezone: "Wrong/Zone" }, { objectPath: "other/photo" },
  ])("rejects invalid metadata %j", (patch) => {
    expect(photoMetadataSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });
  it("accepts a timezone-free capture time and a GPS pair", () => {
    expect(photoMetadataSchema.parse({ ...base, capturedAt: "2026-10-14T12:05:00", lat: 26.3, lng: 127.7, locationSource: "exif" }).captureTimezone).toBeNull();
  });
  it("supports explicit offset and manual Tokyo timezone", () => {
    expect(photoMetadataSchema.safeParse({ ...base, capturedAt: "2026-10-14T12:05:00", captureTimezone: "+09:00" }).success).toBe(true);
    expect(photoMetadataSchema.safeParse({ ...base, capturedAt: "2026-10-14T12:05:00", captureTimezone: "Asia/Tokyo" }).success).toBe(true);
  });
  it("derives only fixed-trip UUID paths", () => {
    expect(photoPaths("11111111-1111-4111-8111-111111111111").display).toBe("okinawa/11111111-1111-4111-8111-111111111111/display.jpg");
    expect(() => photoPaths("../other")).toThrow();
  });
  it("groups undated photos separately", () => {
    expect(photoDateKey(base)).toBe("unknown");
    expect(photoDateKey({ ...base, capturedAt: "2026-10-14T12:00:00" })).toBe("2026-10-14");
  });
  it("round-trips a strict cursor and rejects arbitrary filters", () => {
    const cursor = { createdAt: "2026-10-09T00:00:00.000Z", id: "11111111-1111-4111-8111-111111111111" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(() => decodeCursor(Buffer.from('{"id":"bad","createdAt":"x"}').toString("base64url"))).toThrow();
  });
});
