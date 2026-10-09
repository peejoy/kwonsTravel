import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/album/route";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { emptyMetadata } from "@/lib/album/model";
import { listPhotos, reservePhoto } from "@/lib/album/store";
import { GET as detail, PATCH as edit, DELETE as remove } from "@/app/api/album/[id]/route";
import { POST as finalize } from "@/app/api/album/[id]/finalize/route";
import { POST as renew } from "@/app/api/album/[id]/upload/route";
import { POST as cleanup } from "@/app/api/album/cleanup/route";
vi.mock("@/lib/album/store", async () => {
  const real = await vi.importActual<typeof import("@/lib/album/store")>("@/lib/album/store");
  return { ...real, listPhotos: vi.fn(async () => ({ photos: [], nextCursor: null })), reservePhoto: vi.fn(async () => ({ id: "11111111-1111-4111-8111-111111111111", revision: 0, uploadUrl: "https://album.example/upload", uploadExpiresAt: "2026-10-09T12:00:00Z" })) };
});
const origin = "https://family.example"; let token: string;
function request(method: string, body?: unknown, cookie = true, from = origin) {
  return new NextRequest(`${origin}/api/album`, { method, headers: { Origin: from, Cookie: cookie ? `${SESSION_COOKIE}=${token}` : "", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("FAMILY_PASSWORD", "test-family-password"); vi.stubEnv("SESSION_SECRET", "0123456789012345678901234567890123456789"); vi.stubEnv("SUPABASE_URL", "https://album.example"); vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  token = await createSession(); vi.clearAllMocks();
});
afterEach(() => { vi.unstubAllEnvs(); });
it("rejects anonymous reads and reservations", async () => {
  expect((await GET(request("GET", undefined, false))).status).toBe(401);
  expect((await POST(request("POST", { metadata: emptyMetadata }, false))).status).toBe(401);
  expect(listPhotos).not.toHaveBeenCalled(); expect(reservePhoto).not.toHaveBeenCalled();
});
it("requires signed family auth even for development cloud access", async () => {
  vi.stubEnv("FAMILY_PASSWORD", "");
  const response = await GET(request("GET")); expect(response.status).toBe(503);
  expect(listPhotos).not.toHaveBeenCalled();
});
it("returns a no-store family listing and valid reservation", async () => {
  const response = await GET(request("GET")); expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(await response.json()).toEqual({ photos: [], nextCursor: null });
  const added = await POST(request("POST", { metadata: emptyMetadata })); expect(added.status).toBe(200);
  expect((await added.json()).revision).toBe(0);
});
it("rejects foreign-origin writes before accessing storage", async () => {
  expect((await POST(request("POST", { metadata: emptyMetadata }, true, "https://evil.example"))).status).toBe(403);
  expect(reservePhoto).not.toHaveBeenCalled();
});
it("rejects arbitrary paths and invalid locations", async () => {
  expect((await POST(request("POST", { metadata: emptyMetadata, path: "other/photo" }))).status).toBe(400);
  expect((await POST(request("POST", { metadata: { ...emptyMetadata, lat: 26 } }))).status).toBe(400);
});
it("enforces auth and origin for every album operation", async () => {
  const context = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
  expect((await detail(request("GET", undefined, false), context)).status).toBe(401);
  for (const [method, handler] of [["PATCH", edit], ["DELETE", remove], ["POST", finalize], ["POST", renew]] as const) {
    expect((await handler(request(method, { revision: 0 }, false), context)).status).toBe(401);
    expect((await handler(request(method, { revision: 0 }, true, "https://evil.example"), context)).status).toBe(403);
  }
  expect((await cleanup(request("POST", {}, false))).status).toBe(401);
  expect((await cleanup(request("POST", {}, true, "https://evil.example"))).status).toBe(403);
});
it("rejects bad IDs and extra revision fields before storage", async () => {
  const context = { params: Promise.resolve({ id: "../secret" }) };
  expect((await detail(request("GET"), context)).status).toBe(400);
  expect((await finalize(request("POST", { revision: 0, path: "other" }), context)).status).toBe(400);
});
