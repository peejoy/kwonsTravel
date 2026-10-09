import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStoredPlacePhoto, readStoredPhoto, clearStoredPhotos, photoKey } from "@/lib/place-photos";
import { placeSchema } from "@/lib/model";
import { createSeed } from "@/lib/seed";

let directory: string;
const place = { name: "オダルレンタカー", lat: 26.167595, lng: 127.6686257, googleMapsUrl: "https://www.google.com/maps?cid=10272877510840134532" };
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3, 0xff, 0xd9]);
const searchResult = { places: [{ id: "ChIJexample", displayName: { text: place.name }, location: { latitude: place.lat, longitude: place.lng }, photos: [{ name: "places/ChIJexample/photos/photo-one", googleMapsUri: place.googleMapsUrl, authorAttributions: [{ displayName: "Photographer", uri: "https://www.google.com/maps/contrib/123" }] }] }] };
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "okinawa-photo-test-"));
  vi.stubEnv("TRIP_DATA_DIR", directory);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FAMILY_PASSWORD", "");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-photo-key");
  vi.stubEnv("GOOGLE_PHOTO_DAILY_LIMIT", "50");
});
afterEach(async () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
function successfulFetch() {
  return vi.fn().mockResolvedValueOnce(Response.json(searchResult))
    .mockResolvedValueOnce(new Response(jpeg, { headers: { "Content-Type": "image/jpeg" } }));
}
describe("one-time local place photos", () => {
  it("downloads once and serves repeat requests from disk even without an API key", async () => {
    const fetcher = successfulFetch(); vi.stubGlobal("fetch", fetcher);
    const first = await getStoredPlacePhoto(place);
    expect(first.photo?.image).toMatch(/^\/api\/place-photos\/[a-f0-9]{64}$/);
    expect(first.photo?.photoCredit.authors[0].displayName).toBe("Photographer");
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    expect(await getStoredPlacePhoto(place)).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const stored = await readStoredPhoto(photoKey(place));
    expect(stored?.mime).toBe("image/jpeg");
    expect(stored?.bytes).toEqual(Buffer.from(jpeg));
    expect((await readFile(path.join(directory, "place-photos", photoKey(place), "metadata.json"), "utf8"))).not.toContain("test-photo-key");
  });
  it("deduplicates concurrent requests for the same place", async () => {
    const fetcher = successfulFetch(); vi.stubGlobal("fetch", fetcher);
    const [a, b] = await Promise.all([getStoredPlacePhoto(place), getStoredPlacePhoto(place)]);
    expect(a).toEqual(b); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("reuses a CID identity across different Google map URL formats", () => {
    expect(photoKey(place)).toBe(photoKey({ ...place, googleMapsUrl: "https://www.google.com/maps/place/ODAL/data=!1s0x34e569a44e3a5039:0x8e9097ab06b9ab84" }));
  });
  it("does not call Google without configured photo credentials", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await getStoredPlacePhoto(place)).toMatchObject({ photo: null, reason: "configuration" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("remembers missing photos instead of repeatedly querying Google", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ places: [] })); vi.stubGlobal("fetch", fetcher);
    expect(await getStoredPlacePhoto(place)).toMatchObject({ photo: null, reason: "missing" });
    await getStoredPlacePhoto(place); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not download a different branch far from the registered map pin", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ places: [{ ...searchResult.places[0], location: { latitude: 35, longitude: 139 } }] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getStoredPlacePhoto(place)).toMatchObject({ photo: null, reason: "missing" }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never follows a Google photo redirect to an arbitrary host or forwards the key", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(searchResult)).mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://evil.example/image" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getStoredPlacePhoto(place)).toMatchObject({ photo: null, reason: "unavailable" }); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not persist HTML pretending to be a photo", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(searchResult)).mockResolvedValueOnce(new Response("<html>not an image</html>", { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getStoredPlacePhoto(place)).toMatchObject({ photo: null, reason: "unavailable" }); expect(await readStoredPhoto(photoKey(place))).toBeNull();
  });
  it("does not spend more API calls on an incomplete stored entry", async () => {
    const fetcher = successfulFetch(); vi.stubGlobal("fetch", fetcher); await getStoredPlacePhoto(place);
    await rm(path.join(directory, "place-photos", photoKey(place), "image"));
    expect(await getStoredPlacePhoto(place)).toMatchObject({ photo: null, reason: "unavailable" });
    await getStoredPlacePhoto(place); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not repeat paid lookups when cached metadata is missing", async () => {
    const fetcher = successfulFetch(); vi.stubGlobal("fetch", fetcher); await getStoredPlacePhoto(place);
    await rm(path.join(directory, "place-photos", photoKey(place), "metadata.json"));
    expect(await getStoredPlacePhoto(place)).toMatchObject({ photo: null, reason: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("waits for a conflicting deletion to restore photos before serving images", async () => {
    vi.stubGlobal("fetch", successfulFetch()); await getStoredPlacePhoto(place);
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const deletion = clearStoredPhotos(async () => { entered(); await blocked; throw new Error("conflict"); });
    const rejection = expect(deletion).rejects.toThrow("conflict");
    await started;
    const reading = readStoredPhoto(photoKey(place));
    release(); await rejection;
    expect(await reading).not.toBeNull();
  });
  it("follows permitted image redirects without sending the API key to the image host", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(searchResult))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://lh3.googleusercontent.com/places/photo" } }))
      .mockResolvedValueOnce(new Response(jpeg, { headers: { "Content-Type": "image/jpeg" } }));
    vi.stubGlobal("fetch", fetcher);
    expect((await getStoredPlacePhoto(place)).photo).not.toBeNull();
    expect(fetcher.mock.calls[1][1].headers).toEqual({ "X-Goog-Api-Key": "test-photo-key" });
    expect(fetcher.mock.calls[2][1].headers).toBeUndefined();
    expect(String(fetcher.mock.calls[2][0])).not.toContain("test-photo-key");
  });
  it("enforces the daily request limit before additional paid lookups", async () => {
    vi.stubEnv("GOOGLE_PHOTO_DAILY_LIMIT", "1"); const fetcher = successfulFetch(); vi.stubGlobal("fetch", fetcher);
    await getStoredPlacePhoto(place);
    expect(await getStoredPlacePhoto({ ...place, googleMapsUrl: "https://www.google.com/maps?cid=999", lat: 26.3 })).toMatchObject({ photo: null, reason: "limit" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails closed for deployed storage instead of writing Vercel temporary files", async () => {
    vi.stubEnv("NODE_ENV", "production"); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect(await getStoredPlacePhoto(place)).toMatchObject({ photo: null, reason: "storage" }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("deletes only owned photos while preserving trip data and the usage budget", async () => {
    vi.stubGlobal("fetch", successfulFetch()); await getStoredPlacePhoto(place);
    let updated = false;
    await clearStoredPhotos(async () => { updated = true; });
    expect(updated).toBe(true); expect(await readStoredPhoto(photoKey(place))).toBeNull();
    expect(await readFile(path.join(directory, "place-photo-usage.json"), "utf8")).toContain('"calls":1');
  });
  it("leaves photos intact if clearing trip references conflicts", async () => {
    vi.stubGlobal("fetch", successfulFetch()); await getStoredPlacePhoto(place);
    await expect(clearStoredPhotos(async () => { throw new Error("conflict"); })).rejects.toThrow("conflict");
    expect(await readStoredPhoto(photoKey(place))).not.toBeNull();
  });
  it("accepts stored-photo references without accepting arbitrary local image paths", () => {
    expect(placeSchema.safeParse({ ...createSeed().places[0], image: `/api/place-photos/${"a".repeat(64)}` }).success).toBe(true);
    expect(placeSchema.safeParse({ ...createSeed().places[0], image: "/api/place-photos/../../secret" }).success).toBe(false);
  });
});
