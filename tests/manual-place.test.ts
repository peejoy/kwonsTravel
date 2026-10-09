import { describe, expect, it } from "vitest";
import { manualPlace } from "@/lib/manual-place";

const fields = { id: "manual-place", name: "카페", area: "나하", description: "점심", notes: "주차 확인", lat: "26.2", lng: "127.7", category: "food" as const, favorite: true, mapLink: "https://maps.app.goo.gl/example" };

describe("manual place fallback", () => {
  it("preserves information and the original Google link", () => {
    expect(manualPlace(fields)).toMatchObject({ name: "카페", lat: 26.2, lng: 127.7, googleMapsUrl: fields.mapLink, area: "나하", notes: "주차 확인", favorite: true });
  });
  it("does not invent coordinates from empty input", () => {
    expect(() => manualPlace({ ...fields, lat: "" })).toThrow();
    expect(() => manualPlace({ ...fields, lng: " " })).toThrow();
  });
  it("rejects invalid names, coordinates and unsafe links", () => {
    expect(() => manualPlace({ ...fields, name: " " })).toThrow();
    expect(() => manualPlace({ ...fields, lat: "91" })).toThrow();
    expect(() => manualPlace({ ...fields, mapLink: "https://evil.example" })).toThrow();
  });
  it("allows registration without a link", () => {
    expect(manualPlace({ ...fields, mapLink: "" }).googleMapsUrl).toBe("");
  });
});
