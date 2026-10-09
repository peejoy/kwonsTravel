import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGoogleMapsLink } from "@/lib/maps-link";
import { resolveGoogleMapsLink } from "@/lib/resolve-maps-link";

const fullLink = "https://www.google.com/maps/place/Okinawa+Churaumi+Aquarium/@26.69,127.87,14z/data=!4m6!3m5!1splace!8m2!3d26.694292!4d127.877934!16splace";
afterEach(() => vi.unstubAllGlobals());

describe("Google Maps place links", () => {
  it("uses the destination coordinates rather than the camera center", () => {
    expect(parseGoogleMapsLink(fullLink)).toMatchObject({ name: "Okinawa Churaumi Aquarium", lat: 26.694292, lng: 127.877934, googleMapsUrl: fullLink });
  });
  it("decodes a Japanese place name", () => {
    const url = `https://www.google.co.jp/maps/place/${encodeURIComponent("美ら海水族館")}/data=!8m2!3d26.694292!4d127.877934`;
    expect(parseGoogleMapsLink(url).name).toBe("美ら海水族館");
  });
  it.each([
    ["C%2B%2B+Cafe", "C++ Cafe"],
    ["Cafe+%2F+Sushi", "Cafe / Sushi"],
  ])("preserves encoded punctuation in %s", (encoded, name) => {
    expect(parseGoogleMapsLink(`https://www.google.com/maps/place/${encoded}/data=!8m2!3d26.2!4d127.6`).name).toBe(name);
  });
  it.each([
    "https://www.google.com/maps/search/?api=1&query=26.694292%2C127.877934",
    "https://maps.google.com/?q=26.694292,127.877934",
    "https://www.google.co.kr/maps?q=loc:26.694292,127.877934",
  ])("reads coordinates from a pin query: %s", (url) => {
    expect(parseGoogleMapsLink(url)).toMatchObject({ lat: 26.694292, lng: 127.877934 });
  });
  it("keeps a search name unresolved rather than inventing coordinates", () => {
    const place = parseGoogleMapsLink("https://www.google.com/maps/search/?api=1&query=American+Village+Okinawa");
    expect(place.name).toBe("American Village Okinawa");
    expect(place.lat).toBeUndefined();
    expect(place.lng).toBeUndefined();
  });
  it("does not interpret a map viewport as a saved destination", () => {
    expect(parseGoogleMapsLink("https://www.google.com/maps/place/Cafe/@26.2,127.6,15z").lat).toBeUndefined();
  });
  it("does not mistake tokens in the place name for destination data", () => {
    const place = parseGoogleMapsLink("https://www.google.com/maps/place/Cafe%213d26.214%214d127.6812/@35,139,15z");
    expect(place.lat).toBeUndefined();
    expect(place.lng).toBeUndefined();
  });
  it("does not interpret a name starting with data= as the data segment", () => {
    expect(parseGoogleMapsLink("https://www.google.com/maps/place/data=%213d26.214%214d127.6812/@35,139,15z").lat).toBeUndefined();
  });
  it("reads an explicit coordinate search path without using its camera center", () => {
    expect(parseGoogleMapsLink("https://www.google.com/maps/search/26.694292,127.877934/@35,139,15z")).toMatchObject({ lat: 26.694292, lng: 127.877934 });
  });
  it.each([
    "http://www.google.com/maps/place/Cafe",
    "https://www.google.com.evil.example/maps/place/Cafe",
    "https://evil.example/?url=https://www.google.com/maps/place/Cafe",
    "https://user:password@www.google.com/maps/place/Cafe",
    "https://www.google.com:444/maps/place/Cafe",
    "https://www.google.com/url?q=https://localhost/",
    "https://goo.gl/not-maps",
    "https://127.0.0.1/maps",
    "javascript:alert(1)",
    "",
  ])("rejects unsupported or unsafe links: %s", (url) => {
    expect(() => parseGoogleMapsLink(url)).toThrow();
  });
  it("rejects an out-of-range destination", () => {
    expect(() => parseGoogleMapsLink("https://www.google.com/maps?q=91,127")).toThrow();
  });
});

describe("shared link expansion", () => {
  it("expands a mobile sharing link into a registerable place", async () => {
    vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
      expect(init.redirect).toBe("manual");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      if (String(input) === "https://maps.app.goo.gl/example") return new Response(null, { status: 302, headers: { location: fullLink } });
      throw new Error("Unexpected external request");
    });
    expect(await resolveGoogleMapsLink("https://maps.app.goo.gl/example")).toMatchObject({ name: "Okinawa Churaumi Aquarium", lat: 26.694292, lng: 127.877934 });
  });
  it("supports older goo.gl/maps sharing links", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 301, headers: { location: fullLink } }));
    expect((await resolveGoogleMapsLink("https://goo.gl/maps/example")).lat).toBe(26.694292);
  });
  it.each(["http://localhost/private", "https://127.0.0.1/private", "https://attacker.example/maps", "https://www.google.com/url?url=http://localhost"])("blocks a redirect to %s before fetching it", async (destination) => {
    let requests = 0;
    vi.stubGlobal("fetch", async () => { requests++; return new Response(null, { status: 302, headers: { location: destination } }); });
    await expect(resolveGoogleMapsLink("https://maps.app.goo.gl/example")).rejects.toThrow();
    expect(requests).toBe(1);
  });
  it("stops redirect loops", async () => {
    let requests = 0;
    vi.stubGlobal("fetch", async () => { requests++; return new Response(null, { status: 302, headers: { location: "https://maps.app.goo.gl/loop" } }); });
    await expect(resolveGoogleMapsLink("https://maps.app.goo.gl/loop")).rejects.toThrow();
    expect(requests).toBeLessThanOrEqual(5);
  });
  it("reports a missing or unavailable shared link", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    await expect(resolveGoogleMapsLink("https://maps.app.goo.gl/missing")).rejects.toThrow(/[가-힣]/);
  });
  it("does not fetch an ordinary Maps URL", async () => {
    vi.stubGlobal("fetch", () => { throw new Error("Should not need a network request"); });
    expect((await resolveGoogleMapsLink(fullLink)).lat).toBe(26.694292);
  });
});
