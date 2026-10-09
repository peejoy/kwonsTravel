import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlaceEditor } from "@/components/editors";
import TripMap from "@/components/trip-map";
import { createSeed } from "@/lib/seed";

const props = {
  busy: false,
  onSave: async () => {},
  onClose: () => {},
  onAuthRequired: () => {},
};

describe("place registration", () => {
  it("does not load Google Maps in the manual fallback even when a Google key exists", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
    try {
      const html = renderToStaticMarkup(createElement(TripMap, { baseOnly: true, points: [], selected: null, onSelect: () => {} }));
      expect(html).toContain("오키나와 기본 지도");
      expect(html).not.toContain(">Google 지도<");
    } finally { vi.unstubAllEnvs(); }
  });
  it("requires a Google Maps link instead of manual place fields for new places", () => {
    const html = renderToStaticMarkup(createElement(PlaceEditor, props));
    expect(html.match(/<input[^>]*aria-label="Google 지도 링크"[^>]*>/)?.[0]).toContain('required=""');
    expect(html).not.toContain("장소 이름<input");
    expect(html).not.toContain("위도<input");
    expect(html).not.toContain("경도<input");
    expect(html).not.toContain("<textarea");
  });

  it("keeps registration disabled until a place has been resolved from the link", () => {
    const html = renderToStaticMarkup(createElement(PlaceEditor, props));
    expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled=""');
  });

  it("starts with the category of the view where the place is added", () => {
    const html = renderToStaticMarkup(createElement(PlaceEditor, { ...props, defaultCategory: "food" }));
    expect(html).toMatch(/<option value="food" selected="">/);
  });

  it("preserves manual fields when editing an existing place", () => {
    const html = renderToStaticMarkup(createElement(PlaceEditor, { ...props, value: createSeed().places[0] }));
    expect(html).toContain("장소 이름<input");
    expect(html).toContain("위도<input");
    expect(html).toContain("경도<input");
    expect(html).toContain("<textarea");
  });
});
