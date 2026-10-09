import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, DELETE } from "@/app/api/place-photos/route";
import { GET } from "@/app/api/place-photos/[key]/route";
import { readTrip, writeTrip } from "@/lib/storage";
import { getStoredPlacePhoto, photoKey } from "@/lib/place-photos";
import { POST as importPlace } from "@/app/api/places/import/route";
import { PUT as saveTrip } from "@/app/api/trip/route";

const origin = "https://family.example";
let directory: string;
const draft = { name: "Test photo place", lat: 26.3, lng: 127.7, googleMapsUrl: "https://www.google.com/maps/place/Test/data=!3d26.3!4d127.7" };
function request(method: string, body: unknown, from = origin) {
  return new NextRequest(`${origin}/api/place-photos`, { method, headers: { Origin: from, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(async () => {
  vi.stubEnv("GOOGLE_PHOTO_DAILY_LIMIT", "50");
  directory = await mkdtemp(path.join(os.tmpdir(), "okinawa-photo-route-"));
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("TRIP_DATA_DIR", directory); vi.stubEnv("FAMILY_PASSWORD", ""); vi.stubEnv("SESSION_SECRET", ""); vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
describe("photo API", () => {
  it("includes the stored photo on registration but does not save the draft as a place", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-photo-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ places: [{ location: { latitude: draft.lat, longitude: draft.lng }, photos: [{ name: "places/ChIJexample/photos/one" }] }] }))
      .mockResolvedValueOnce(new Response(new Uint8Array([255,216,255,224,0,16]), { headers: { "Content-Type": "image/jpeg" } })));
    const before = await readTrip();
    const response = await importPlace(new NextRequest(`${origin}/api/places/import`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ url: draft.googleMapsUrl }) }));
    expect(response.status).toBe(200); expect((await response.json()).place.image).toMatch(/^\/api\/place-photos\/[a-f0-9]{64}$/);
    expect(await readTrip()).toEqual(before);
  });
  it("returns a setup warning without changing the trip", async () => {
    const before = await readTrip(); const response = await POST(request("POST", { place: draft }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ photo: null, reason: "configuration" });
    expect(await readTrip()).toEqual(before);
  });
  it("rejects foreign-origin writes and invalid source locations", async () => {
    expect((await POST(request("POST", { place: draft }, "https://evil.example"))).status).toBe(403);
    expect((await POST(request("POST", { place: { ...draft, googleMapsUrl: "https://127.0.0.1/secret" } }))).status).toBe(400);
    expect((await POST(request("POST", { place: { ...draft, lat: 100 } }))).status).toBe(400);
    expect((await DELETE(request("DELETE", { expectedVersion: 0 }, "https://evil.example"))).status).toBe(403);
  });
  it("requires authentication for both paid lookups and local image access", async () => {
    vi.stubEnv("FAMILY_PASSWORD", "test-family-password"); vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-thirty-two-bytes");
    expect((await POST(request("POST", { place: draft }))).status).toBe(401);
    expect((await GET(new NextRequest(`${origin}/api/place-photos/${"a".repeat(64)}`), { params: Promise.resolve({ key: "a".repeat(64) }) })).status).toBe(401);
  });
  it("returns 404 for missing photos and traversal-like keys", async () => {
    expect((await GET(new NextRequest(origin), { params: Promise.resolve({ key: "../trip.json" }) })).status).toBe(404);
  });
  it("removes cached image references but preserves static images, schedules and packing", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-photo-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ places: [{ location: { latitude: draft.lat, longitude: draft.lng }, photos: [{ name: "places/ChIJexample/photos/one" }] }] }))
      .mockResolvedValueOnce(new Response(new Uint8Array([255,216,255,224,0,16]), { headers: { "Content-Type": "image/jpeg" } })));
    const photo = (await getStoredPlacePhoto(draft)).photo!;
    const initial = await readTrip(); initial.places[0] = { ...initial.places[0], ...photo };
    const before = await writeTrip(initial, initial.version);
    const image = await GET(new NextRequest(origin), { params: Promise.resolve({ key: photoKey(draft) }) });
    expect(image.status).toBe(200); expect(image.headers.get("content-type")).toBe("image/jpeg"); expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    const response = await DELETE(request("DELETE", { expectedVersion: before.version }));
    expect(response.status).toBe(200); const after = (await response.json()).state;
    expect(after.places[0].image).toBe(""); expect(after.places[0].photoCredit).toBeUndefined();
    expect(after.places.slice(1)).toEqual(before.places.slice(1)); expect(after.schedule).toEqual(before.schedule); expect(after.packing).toEqual(before.packing);
    expect((await GET(new NextRequest(origin), { params: Promise.resolve({ key: photoKey(draft) }) })).status).toBe(404);
  });
  it("refuses a stale deletion rather than overwriting later edits", async () => {
    const current = await readTrip(); await writeTrip(current, current.version);
    const response = await DELETE(request("DELETE", { expectedVersion: current.version }));
    expect(response.status).toBe(409); expect((await response.json()).state.version).toBe(1);
  });
  it("does not resurrect a deleted photo from an outstanding editor draft", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ places: [{ location: { latitude: draft.lat, longitude: draft.lng }, photos: [{ name: "places/test/photos/one" }] }] }))
      .mockResolvedValueOnce(new Response(new Uint8Array([255,216,255,224,0,16]), { headers: { "Content-Type": "image/jpeg" } })));
    const photo = (await getStoredPlacePhoto(draft)).photo!;
    const before = await readTrip();
    await DELETE(request("DELETE", { expectedVersion: before.version }));
    const edited = await readTrip(); edited.places[0] = { ...edited.places[0], ...photo };
    const response = await saveTrip(new NextRequest(`${origin}/api/trip`, { method: "PUT", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ state: edited, expectedVersion: edited.version }) }));
    expect(response.status).toBe(200); const result = await response.json();
    expect(result.state.places[0].image).toBe(""); expect(result.warning).toBeTruthy();
    expect(result.state.schedule).toEqual(before.schedule);
  });
});
