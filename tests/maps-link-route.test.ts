import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/places/import/route";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const origin = "https://family.example";
const link = "https://www.google.com/maps/place/Churaumi/data=!8m2!3d26.694292!4d127.877934";
function request(body: unknown, requestOrigin = origin) {
  return new NextRequest(`${origin}/api/places/import`, {
    method: "POST", headers: { Origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "okinawa-import-test-"));
  vi.stubEnv("TRIP_DATA_DIR", directory);
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("FAMILY_PASSWORD", "");
  vi.stubEnv("SESSION_SECRET", "");
});
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }); });

describe("place import API", () => {
  it("returns a place draft without changing the saved trip", async () => {
    const response = await POST(request({ url: link }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ place: { name: "Churaumi", lat: 26.694292, lng: 127.877934, googleMapsUrl: link } });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects unauthenticated imports before external requests", async () => {
    vi.stubEnv("FAMILY_PASSWORD", "test-family-password");
    vi.stubEnv("SESSION_SECRET", "test-session-secret-at-least-thirty-two-bytes");
    vi.stubGlobal("fetch", () => { throw new Error("An unauthenticated request must not contact Google"); });
    expect((await POST(request({ url: "https://maps.app.goo.gl/example" }))).status).toBe(401);
  });
  it("rejects foreign-origin imports", async () => {
    expect((await POST(request({ url: link }, "https://other.example"))).status).toBe(403);
  });
  it.each([{ url: "https://localhost/maps" }, { url: 42 }, {}, { url: link, extra: true }])("rejects an invalid import body", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
  });
  it("fails closed when production authentication is unconfigured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request({ url: link }))).status).toBe(503);
  });
});
