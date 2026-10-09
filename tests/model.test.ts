import { describe, expect, it } from "vitest";
import { parseTripState, removePlace, mapsUrl, mergeEditedRecord } from "@/lib/model";
import { createSeed } from "@/lib/seed";

describe("trip data integrity", () => {
  it("starts without inventing travel dates or family size", () => {
    const state = parseTripState(createSeed());
    expect(state.trip.startDate).toBe("");
    expect(state.trip.travelers).toBeNull();
  });
  it("rejects nonexistent calendar dates", () => {
    const state = createSeed();
    state.trip.startDate = "2026-02-30";
    expect(() => parseTripState(state)).toThrow();
  });
  it("rejects orphaned itinerary entries", () => {
    const state = createSeed();
    state.schedule[0].placeId = "missing";
    expect(() => parseTripState(state)).toThrow();
  });
  it("does not permit reducing days past existing activities", () => {
    const state = createSeed();
    state.trip.days = 2;
    expect(() => parseTripState(state)).toThrow();
  });
  it("rejects duplicate ids and impossible coordinates", () => {
    const state = createSeed();
    state.places.push({ ...state.places[0] });
    expect(() => parseTripState(state)).toThrow();
    state.places.pop();
    state.places[0].lat = 91;
    expect(() => parseTripState(state)).toThrow();
  });
  it("removing a place also removes its schedule references", () => {
    const state = createSeed();
    const id = state.schedule[0].placeId;
    const next = removePlace(state, id);
    expect(next.places.some((p) => p.id === id)).toBe(false);
    expect(next.schedule.some((s) => s.placeId === id)).toBe(false);
    expect(() => parseTripState(next)).not.toThrow();
  });
  it("creates encoded Google directions without an API key", () => {
    const url = new URL(mapsUrl(createSeed().places[0], "directions"));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.has("key")).toBe(false);
    expect(url.searchParams.get("destination")).toContain(",");
  });
  it("keeps a family member's unrelated changes when retrying an edited record", () => {
    const original = createSeed().trip;
    const edited = { ...original, title: "가족이 입력한 여행 이름" };
    const current = { ...original, notes: "다른 가족이 새로 저장한 메모" };
    expect(mergeEditedRecord(current, original, edited)).toMatchObject({
      title: edited.title, notes: current.notes,
    });
  });
});
