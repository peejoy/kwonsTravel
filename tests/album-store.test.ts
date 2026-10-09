import { beforeEach, afterEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { reservePhoto, renewUpload, listPhotos, finalizePhoto, updatePhoto, deletePhoto, cleanupPhotos, getPhoto } from "@/lib/album/store";
import { emptyMetadata } from "@/lib/album/model";
type Row = Record<string, unknown>;
let rows: Row[]; let objects: Map<string, Uint8Array>; let failRemove: boolean; let deletedDuringDownload: boolean;
let failSign: boolean;
beforeEach(() => {
  rows = []; objects = new Map(); failRemove = false; deletedDuringDownload = false; failSign = false;
  vi.stubEnv("SUPABASE_URL", "https://album.example"); vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret");
  vi.stubGlobal("fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input)); const method = init.method || "GET";
    if (url.pathname === "/storage/v1/bucket/family-travel-photos") return Response.json({ id: "family-travel-photos", public: false });
    if (url.pathname === "/rest/v1/family_album") {
      const matched = rows.filter(r => ["id", "revision", "status", "lease_id", "trip_id"].every(k => !url.searchParams.has(k) || url.searchParams.get(k) === `eq.${r[k]}`)
        && (!(url.searchParams.get("or") || "").includes("lease_expires_at.is.null") || r.lease_expires_at === null || new Date(String(r.lease_expires_at)).valueOf() < Date.now()));
      if (method === "POST") { const row = JSON.parse(String(init.body)); rows.push(row); return Response.json([row]); }
      if (method === "PATCH") { const update = JSON.parse(String(init.body)); matched.forEach(r => Object.assign(r, update)); return Response.json(matched); }
      if (method === "DELETE") { rows = rows.filter(r => !matched.includes(r)); return Response.json(matched); }
      const limit = Number(url.searchParams.get("limit") || 100); return Response.json(matched.slice(0, limit));
    }
    if (url.pathname.startsWith("/storage/v1/object/upload/sign/")) {
      if (failSign) return Response.json({ message: "synthetic signing error" }, { status: 500 });
      return Response.json({ url: `/object/upload/sign/family-travel-photos/key?token=${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+7200 })).toString("base64url")}.sig` });
    }
    if (url.pathname.startsWith("/storage/v1/object/sign/")) return Response.json({ signedURL: "/object/sign/family-travel-photos/photo?token=test" });
    if (url.pathname === "/storage/v1/object/family-travel-photos" && method === "DELETE") {
      if (failRemove) return Response.json({ message: "synthetic error" }, { status: 500 });
      JSON.parse(String(init.body)).prefixes.forEach((key: string) => objects.delete(key)); return Response.json([]);
    }
    const marker = "/family-travel-photos/"; const key = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(marker) + marker.length));
    if (method === "POST") { objects.set(key, new Uint8Array(await new Response(init.body).arrayBuffer())); return Response.json({ Key: key }); }
    if (objects.has(key)) { if (deletedDuringDownload) rows[0].status = "deleting"; return new Response(objects.get(key)! as BodyInit, { headers: { "Content-Type": "image/jpeg" } }); }
    return Response.json({ message: "missing" }, { status: 404 });
  });
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function pending() {
  const reservation = await reservePhoto(emptyMetadata);
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "red" } }).jpeg().toBuffer();
  objects.set(`okinawa/${reservation.id}/temporary.jpg`, bytes);
  return reservation;
}
it("reserves server-generated scoped paths with a real expiry", async () => {
  const r = await reservePhoto(emptyMetadata);
  expect(r.id).toMatch(/^[a-f0-9-]{36}$/); expect(r.uploadUrl).toMatch(/^https:\/\/album.example\/storage\/v1/);
  expect(new Date(r.uploadExpiresAt).valueOf()).toBeGreaterThan(Date.now());
  expect(rows[0].status).toBe("pending"); expect(rows[0]).not.toHaveProperty("token");
});
it("lists only ready photos and never exposes pending files", async () => {
  await reservePhoto(emptyMetadata); expect(await listPhotos(null)).toEqual({ photos: [], nextCursor: null });
});
it("publishes both validated outputs and finalizes idempotently", async () => {
  const r = await pending(); const p = await finalizePhoto(r.id, r.revision);
  expect(p.imageUrl).toMatch(/^https:/); expect(rows[0].status).toBe("ready");
  expect(objects.has(`okinawa/${r.id}/display.jpg`)).toBe(true); expect(objects.has(`okinawa/${r.id}/thumbnail.jpg`)).toBe(true);
  expect((await finalizePhoto(r.id, r.revision)).id).toBe(p.id);
  expect((await listPhotos(null)).photos).toHaveLength(1);
});
it("rejects a stale edit and preserves the winning metadata", async () => {
  const r = await pending(); const p = await finalizePhoto(r.id, r.revision);
  await updatePhoto(p.id, p.revision, { ...emptyMetadata, caption: "new" });
  await expect(updatePhoto(p.id, p.revision, emptyMetadata)).rejects.toMatchObject({ status: 409 });
  expect((await getPhoto(p.id)).caption).toBe("new");
});
it("does not resurrect a reservation deleted during finalize", async () => {
  const r = await pending(); deletedDuringDownload = true;
  await expect(finalizePhoto(r.id, r.revision)).rejects.toMatchObject({ status: 409 });
  expect(rows[0].status).toBe("deleting"); expect((await listPhotos(null)).photos).toEqual([]);
});
it("retains a cleanup tombstone when storage removal fails", async () => {
  const r = await pending(); failRemove = true;
  expect(await deletePhoto(r.id, r.revision)).toEqual({ cleanupPending: true });
  expect(rows[0].status).toBe("deleting"); failRemove = false;
  rows[0].upload_expires_at = "2020-01-01T00:00:00.000Z";
  expect((await cleanupPhotos()).removed).toBe(1); expect(rows).toEqual([]);
});
it("keeps cancellation tombstones until signed upload permissions expire", async () => {
  const r = await pending(); await deletePhoto(r.id, r.revision);
  expect(rows).toHaveLength(1); expect(rows[0].status).toBe("deleting");
  objects.set(`okinawa/${r.id}/temporary.jpg`, new Uint8Array([1]));
  rows[0].upload_expires_at = "2020-01-01T00:00:00.000Z";
  await cleanupPhotos(); expect(objects.size).toBe(0); expect(rows).toHaveLength(0);
});
it("recovers renewal after signing failed without losing the reservation revision", async () => {
  const r = await pending(); failSign = true;
  await expect(renewUpload(r.id, r.revision)).rejects.toThrow(); failSign = false;
  expect((await renewUpload(r.id, r.revision)).revision).toBe(r.revision);
  expect((await deletePhoto(r.id, r.revision)).cleanupPending).toBe(true);
});
it("cleans a ready photo's late temporary upload without deleting the display", async () => {
  const r = await pending(); failRemove = true;
  await finalizePhoto(r.id, r.revision); failRemove = false;
  rows[0].upload_expires_at = "2020-01-01T00:00:00.000Z";
  await cleanupPhotos();
  expect(objects.has(`okinawa/${r.id}/temporary.jpg`)).toBe(false);
  expect(objects.has(`okinawa/${r.id}/display.jpg`)).toBe(true);
  expect(rows[0].status).toBe("ready");
});
it("reports more cleanup work when a batch leaves another tombstone", async () => {
  const r = await pending(); const sample = { ...rows[0], status: "deleting", upload_expires_at: "2020-01-01T00:00:00.000Z" };
  rows = Array.from({ length: 101 }, (_, i) => ({ ...sample, id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}` }));
  const result = await cleanupPhotos(); expect(result.pending).toBeGreaterThan(0); expect(rows).toHaveLength(1);
  await cleanupPhotos(); expect(rows).toHaveLength(0);
});
it("allows only one concurrent finalize lease to publish a reservation", async () => {
  const r = await pending();
  const results = await Promise.allSettled([finalizePhoto(r.id, r.revision), finalizePhoto(r.id, r.revision)]);
  expect(results.filter((p) => p.status === "fulfilled")).toHaveLength(1);
  expect(rows[0].status).toBe("ready"); expect(rows[0].revision).toBe(1);
});
it("returns a continuation cursor without dropping the 41st photo", async () => {
  const r = await pending(); await finalizePhoto(r.id, r.revision); const sample = { ...rows[0] };
  rows = Array.from({ length: 41 }, (_, i) => ({ ...sample, id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}` }));
  const page = await listPhotos(null); expect(page.photos).toHaveLength(40); expect(page.nextCursor).not.toBeNull();
});
it("rejects malformed cursors as invalid input rather than a storage outage", async () => {
  await expect(listPhotos("not-a-valid-cursor")).rejects.toMatchObject({ status: 400 });
});
