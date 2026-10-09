import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaceDetail } from "@/components/editors";
import { PlacesView, SettingsView } from "@/components/views";
import { createSeed } from "@/lib/seed";

const noop = () => {};
describe("saved photo controls", () => {
  it("shows a photo action for already registered places", () => {
    const html = renderToStaticMarkup(createElement(PlacesView, { state: createSeed(), view: "places", onDetail: noop, onAdd: noop, onFavorite: noop, onSchedule: noop, busy: false, onPhotos: noop }));
    expect(html).toContain("사진 가져오기");
  });
  it("provides a photo-only deletion action in local settings", () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { state: createSeed(), mode: "local", onEdit: noop, onExport: noop, onImport: noop, onLogout: noop, onDeletePhotos: noop, busy: false }));
    expect(html).toContain("저장 사진 전체 삭제");
  });
  it("preserves author attribution and a direct Google photo link", () => {
    const place = { ...createSeed().places[0], image: `/api/place-photos/${"a".repeat(64)}`, photoCredit: { sourceUrl: "https://www.google.com/maps?cid=123", authors: [{ displayName: "Test Photographer", uri: "https://www.google.com/maps/contrib/123" }] } };
    const html = renderToStaticMarkup(createElement(PlaceDetail, { place, onClose: noop, onEdit: noop, onSchedule: noop, onDelete: noop }));
    expect(html).toContain("Test Photographer"); expect(html).toContain('href="https://www.google.com/maps?cid=123"'); expect(html).toContain("Google Maps");
  });
});
