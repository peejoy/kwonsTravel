import { afterAll, beforeAll, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { NextRequest } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { POST as reserve } from "@/app/api/album/route";
import { POST as finalize } from "@/app/api/album/[id]/finalize/route";
import { GET as detail, PATCH as edit, DELETE as remove } from "@/app/api/album/[id]/route";
import { albumClient, cleanupPhotos } from "@/lib/album/store";
import { emptyMetadata } from "@/lib/album/model";
import { createSeed } from "@/lib/seed";
const live = process.env.ALBUM_LIVE_TEST === "1";
let id: string | null = null; let token = "";
const origin = "https://family.example";
function request(method: string, body?: unknown) { return new NextRequest(`${origin}/api/album`, { method, headers: { Origin: origin, Cookie: `${SESSION_COOKIE}=${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); }
beforeAll(async () => {
  if (!live) return;
  process.loadEnvFile(".env.local");
  process.env.FAMILY_PASSWORD = "synthetic-album-test-only";
  process.env.SESSION_SECRET = "synthetic-album-test-session-secret-0123456789";
  token = await createSession();
  const seed = createSeed(); seed.trip.title = "여행 앨범 검증용 여행";
  await writeFile("/tmp/okinawa-album-qa-trip.json", JSON.stringify(seed));
});
afterAll(async () => {
  if (!live || !id || process.env.ALBUM_KEEP_FIXTURE === "1") return;
  const client = albumClient();
  await client.from("family_album").update({ upload_expires_at: "2020-01-01T00:00:00Z", lease_id: null, lease_expires_at: null }).eq("id", id).eq("trip_id", "okinawa");
  const row = await client.from("family_album").select("revision").eq("id", id).single();
  if (row.data) await remove(request("DELETE", { revision: row.data.revision }), { params: Promise.resolve({ id }) });
});
it.skipIf(!live)("stores a synthetic photo privately through authenticated routes", async () => {
  const metadata = { ...emptyMetadata, caption: "검증용 이미지 · 실제 가족사진 아님", lat: 26.3168, lng: 127.7573, locationSource: "manual" as const, capturedAt: "2026-10-14T13:00:00", captureTimezone: "Asia/Tokyo" };
  const reservation = await reserve(request("POST", { metadata }));
  expect(reservation.status).toBe(200); const body = await reservation.json(); id = body.id;
  await writeFile("/tmp/okinawa-album-qa-id.txt", id!);
  const image = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#25806c" } }).composite([{ input: Buffer.from('<svg width="1200" height="800"><rect x="150" y="150" width="900" height="500" fill="#edf4f0"/><text x="600" y="405" text-anchor="middle" font-family="Arial" font-size="55" fill="#25806c">ALBUM STORAGE TEST</text></svg>') }]).jpeg().toBuffer();
  const upload = await fetch(body.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: image }); expect(upload.ok).toBe(true);
  const context = { params: Promise.resolve({ id: id! }) };
  const saved = await finalize(request("POST", { revision: body.revision }), context); expect(saved.status).toBe(200);
  const photo = (await saved.json()).photo; expect(photo.lat).toBe(26.3168);
  const downloaded = await fetch(photo.imageUrl); expect(downloaded.ok).toBe(true);
  expect((await sharp(Buffer.from(await downloaded.arrayBuffer())).metadata()).exif).toBeUndefined();
  const bucket = await albumClient().storage.getBucket("family-travel-photos"); expect(bucket.data?.public).toBe(false);
  const anon = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/public/family-travel-photos/okinawa/${id}/display.jpg`); expect(anon.ok).toBe(false);
  const updated = await edit(request("PATCH", { revision: photo.revision, metadata: { ...metadata, caption: "검증용 이미지 · 실제 가족사진 아님" } }), context); expect(updated.status).toBe(200);
  const loaded = await detail(request("GET"), context); expect(loaded.status).toBe(200);
  if (process.env.ALBUM_KEEP_FIXTURE !== "1") {
    await albumClient().from("family_album").update({ upload_expires_at: "2020-01-01T00:00:00Z" }).eq("id", id);
    const deleted = await remove(request("DELETE", { revision: (await updated.json()).photo.revision }), context); expect(deleted.status).toBe(200);
    expect((await deleted.json()).cleanupPending).toBe(false);
    await cleanupPhotos();
  }
}, 60000);
