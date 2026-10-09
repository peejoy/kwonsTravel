import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearStoredPhotos, getStoredPlacePhoto, readStoredPhoto, photoKey, withValidStoredPhotos } from "@/lib/place-photos";
import { createSeed } from "@/lib/seed";

const fault = vi.hoisted(() => ({ deletionFails: false, readFails: false }));
vi.mock("node:fs/promises", async (original) => {
  const real = await original<typeof import("node:fs/promises")>();
  return { ...real, readFile: async (...args: Parameters<typeof real.readFile>) => {
    if (fault.readFails && String(args[0]).includes("place-photos")) throw Object.assign(new Error("test read failure"), { code: "EIO" });
    return real.readFile(...args);
  }, rm: async (...args: Parameters<typeof real.rm>) => {
    if (fault.deletionFails && String(args[0]).includes("place-photos")) throw Object.assign(new Error("test failure"), { code: "EPERM" });
    return real.rm(...args);
  } };
});
let directory: string;
const place = { name: "Test", lat: 26, lng: 127, googleMapsUrl: "https://www.google.com/maps?cid=123" };
beforeEach(async () => {
  vi.stubEnv("GOOGLE_PHOTO_DAILY_LIMIT", "50");
  directory = await mkdtemp(path.join(os.tmpdir(), "photo-delete-test-"));
  vi.stubEnv("TRIP_DATA_DIR", directory); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("FAMILY_PASSWORD", ""); vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ places: [{ location: { latitude: place.lat, longitude: place.lng }, photos: [{ name: "places/test/photos/one" }] }] }))
    .mockResolvedValueOnce(new Response(new Uint8Array([255,216,255,224,0,16]), { headers: { "Content-Type": "image/jpeg" } })));
  await getStoredPlacePhoto(place);
});
afterEach(async () => { fault.deletionFails = false; fault.readFails = false; vi.unstubAllGlobals(); vi.unstubAllEnvs(); await rm(directory, { recursive: true, force: true }); });
it("rejects unrelated saves on temporary storage errors without dropping photo references", async () => {
  const state = createSeed(); state.places[0].image = `/api/place-photos/${photoKey(place)}`;
  fault.readFails = true;
  const save = vi.fn(async (valid) => valid);
  await expect(withValidStoredPhotos(state, save)).rejects.toThrow("test read failure");
  expect(save).not.toHaveBeenCalled();
});
it("reports pending file cleanup instead of losing the successfully committed trip state", async () => {
  fault.deletionFails = true; let saved = false;
  const result = await clearStoredPhotos(async () => { saved = true; });
  expect(saved).toBe(true); expect(result).toEqual({ cleanupPending: true });
  expect(await readStoredPhoto(photoKey(place))).toBeNull();
  fault.deletionFails = false;
  expect(await clearStoredPhotos(async () => {})).toEqual({ cleanupPending: false });
});
