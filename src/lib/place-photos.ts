import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { googleMapsLinkUrl } from "./maps-link";
import { photoCreditSchema, type Place, type TripState } from "./model";
import { getStorageMode } from "./storage";

export type PhotoPlace = { name: string; lat: number; lng: number; googleMapsUrl?: string };
export type StoredPhoto = { image: string; photoCredit: NonNullable<Place["photoCredit"]> };
export type PhotoResult = { photo: StoredPhoto | null; reason?: "configuration" | "storage" | "missing" | "unavailable" | "limit"; warning?: string };

const maxBytes = 2 * 1024 * 1024;
const photoPath = /^\/api\/place-photos\/([a-f0-9]{64})$/;
export function isStoredPhoto(image: string): boolean { return photoPath.test(image); }
const metadataSchema = z.object({
  photo: z.object({ image: z.string().regex(photoPath), photoCredit: photoCreditSchema }).nullable(),
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
  reason: z.literal("missing").optional(), warning: z.string().max(500).optional(),
});
const searchSchema = z.object({ places: z.array(z.object({
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
  photos: z.array(z.object({
    name: z.string().max(4096).regex(/^places\/[a-zA-Z0-9_-]+\/photos\/[a-zA-Z0-9_-]+$/),
    googleMapsUri: z.string().optional(),
    authorAttributions: z.array(z.object({ displayName: z.string(), uri: z.string().optional() })).max(10).optional(),
  })).max(10).optional(),
})).max(20).default([]) });
const processState = globalThis as typeof globalThis & { __okinawaPhotoQueue?: Promise<void> };
function withPhotoLock<T>(operation: () => Promise<T>): Promise<T> {
  const pending = (processState.__okinawaPhotoQueue ?? Promise.resolve()).then(operation);
  processState.__okinawaPhotoQueue = pending.then(() => undefined, () => undefined);
  return pending;
}
function dataDirectory(): string { return process.env.TRIP_DATA_DIR || path.join(process.cwd(), ".data"); }
function photoDirectory(): string { return path.join(dataDirectory(), "place-photos"); }
function localPhotosEnabled(): boolean {
  try { return process.env.NODE_ENV !== "production" && getStorageMode() === "local"; } catch { return false; }
}
export function photoKey(place: PhotoPlace): string {
  let identity = `${place.name.normalize("NFKC").trim().toLowerCase()}|${place.lat.toFixed(6)}|${place.lng.toFixed(6)}`;
  if (place.googleMapsUrl) {
    const url = googleMapsLinkUrl(place.googleMapsUrl);
    const cid = url.searchParams.get("cid");
    const hex = decodeURIComponent(url.href).match(/!1s0x[a-f0-9]+:(0x[a-f0-9]+)/i)?.[1];
    const coordinates = `${place.lat.toFixed(6)}|${place.lng.toFixed(6)}`;
    if (cid && /^\d{1,20}$/.test(cid)) identity = `cid:${BigInt(cid)}|${coordinates}`;
    else if (hex) identity = `cid:${BigInt(hex)}|${coordinates}`;
  }
  return createHash("sha256").update(identity).digest("hex");
}
async function limitedBody(response: Response): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > maxBytes || !response.body) throw new Error("Invalid photo size");
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) throw new Error("Photo too large"); parts.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(parts);
}
function imageMime(bytes: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
class DamagedPhotoCache extends Error {}
async function readMetadata(key: string) {
  try {
    const raw = await readFile(path.join(photoDirectory(), key, "metadata.json"), "utf8");
    const metadata = metadataSchema.parse(JSON.parse(raw));
    if (metadata.photo) {
      if (metadata.photo.image !== `/api/place-photos/${key}` || !metadata.mime) throw new DamagedPhotoCache("Damaged photo cache");
      const file = await stat(path.join(photoDirectory(), key, "image")).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DamagedPhotoCache("Damaged photo cache");
        throw error;
      });
      if (!file.isFile() || file.size > maxBytes) throw new DamagedPhotoCache("Damaged photo cache");
    }
    return metadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const directory = await stat(path.join(photoDirectory(), key)).catch((failure) => {
      if ((failure as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw failure;
    });
    if (directory) throw new DamagedPhotoCache("Damaged photo cache");
    return null;
  }
}
async function storeResult(key: string, result: PhotoResult, bytes?: Buffer, mime?: string): Promise<void> {
  const base = photoDirectory(); await mkdir(base, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(path.join(base, ".pending-"));
  try {
    if (bytes) await writeFile(path.join(temporary, "image"), bytes, { mode: 0o600 });
    await writeFile(path.join(temporary, "metadata.json"), JSON.stringify({ ...result, mime }), { mode: 0o600 });
    await rename(temporary, path.join(base, key));
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
async function reserveLookup(): Promise<boolean> {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(dataDirectory(), "place-photo-usage.json");
  let calls = 0;
  try {
    const usage = z.object({ date: z.string(), calls: z.number().int().nonnegative() }).parse(JSON.parse(await readFile(file, "utf8")));
    if (usage.date === date) calls = usage.calls;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const configured = Number(process.env.GOOGLE_PHOTO_DAILY_LIMIT ?? "50");
  const limit = Number.isInteger(configured) && configured >= 0 && configured <= 200 ? configured : 50;
  if (calls >= limit) return false;
  await mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify({ date, calls: calls + 1 }), { mode: 0o600 }); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
  return true;
}
function distanceSquared(place: PhotoPlace, location: { latitude: number; longitude: number }): number {
  const north = (place.lat - location.latitude) * 111320;
  const east = (place.lng - location.longitude) * 111320 * Math.cos(place.lat * Math.PI / 180);
  return north * north + east * east;
}
function safeMapsUrl(value: string | undefined, fallback: string): string {
  try { return googleMapsLinkUrl(value || "").href; } catch { return fallback; }
}
async function downloadPhoto(name: string, key: string, signal: AbortSignal): Promise<{ bytes: Buffer; mime: string }> {
  let url = new URL(`https://places.googleapis.com/v1/${name}/media`); url.searchParams.set("maxWidthPx", "800"); url.searchParams.set("maxHeightPx", "800");
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" || url.port || url.username || url.password || !(url.hostname === "places.googleapis.com" || url.hostname.endsWith(".googleusercontent.com"))) throw new Error("Unsafe image redirect");
    const response = await fetch(url, { redirect: "manual", cache: "no-store", signal, headers: url.hostname === "places.googleapis.com" ? { "X-Goog-Api-Key": key } : undefined });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location"); await response.body?.cancel();
      if (!location) throw new Error("Missing image redirect"); url = new URL(location, url); continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error("Photo download failed"); }
    const bytes = await limitedBody(response); const mime = imageMime(bytes);
    if (!mime || !response.headers.get("content-type")?.toLowerCase().startsWith(mime)) throw new Error("Invalid image");
    return { bytes, mime };
  }
  throw new Error("Too many photo redirects");
}
export async function getStoredPlacePhoto(place: PhotoPlace): Promise<PhotoResult> {
  return withPhotoLock(async () => {
    if (!localPhotosEnabled()) return { photo: null, reason: "storage", warning: "사진 저장은 현재 로컬에서만 지원합니다. 배포 전 영구 사진 저장소를 연결해주세요." };
    try {
      const id = photoKey(place); const existing = await readMetadata(id);
      if (existing) return { photo: existing.photo, ...(existing.reason ? { reason: existing.reason, warning: existing.warning } : {}) };
      const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
      if (!apiKey) return { photo: null, reason: "configuration", warning: "사진 조회용 GOOGLE_PLACES_API_KEY와 Places API (New) 설정이 필요합니다." };
      if (!await reserveLookup()) return { photo: null, reason: "limit", warning: "오늘의 새 사진 조회 한도에 도달했습니다. 이미 저장한 사진은 계속 사용할 수 있습니다." };
      const signal = AbortSignal.timeout(15000);
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST", redirect: "error", cache: "no-store", signal,
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.location,places.photos" },
        body: JSON.stringify({ textQuery: place.name, languageCode: "ko", regionCode: "JP", pageSize: 5, locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 200 } } }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        return { photo: null, reason: response.status === 429 ? "limit" : "configuration", warning: "Google 사진 조회가 거절됐습니다. Places API (New), 서버용 키 제한, 결제 및 할당량을 확인해주세요." };
      }
      const places = searchSchema.parse(JSON.parse((await limitedBody(response)).toString("utf8"))).places;
      const match = places.filter((candidate) => distanceSquared(place, candidate.location) <= 150 * 150).sort((a, b) => distanceSquared(place, a.location) - distanceSquared(place, b.location))[0];
      const source = match?.photos?.[0];
      if (!source) {
        const missing: PhotoResult = { photo: null, reason: "missing", warning: "이 장소의 위치와 일치하는 Google 사진을 찾지 못했습니다." };
        await storeResult(id, missing); return missing;
      }
      const { bytes, mime } = await downloadPhoto(source.name, apiKey, signal);
      const fallback = place.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
      const credit = photoCreditSchema.parse({ sourceUrl: safeMapsUrl(source.googleMapsUri, fallback), authors: (source.authorAttributions || []).map((author) => ({ displayName: author.displayName.trim().slice(0, 120), uri: safeMapsUrl(author.uri, "") })).filter((author) => author.displayName) });
      const result: PhotoResult = { photo: { image: `/api/place-photos/${id}`, photoCredit: credit } };
      await storeResult(id, result, bytes, mime); return result;
    } catch { return { photo: null, reason: "unavailable", warning: "사진을 저장하지 못했습니다. 장소는 사진 없이 등록할 수 있습니다." }; }
  });
}
async function readStoredPhotoUnlocked(key: string): Promise<{ mime: string; bytes: Buffer } | null> {
  if (!localPhotosEnabled() || !/^[a-f0-9]{64}$/.test(key)) return null;
  try {
    const metadata = await readMetadata(key); if (!metadata?.photo || !metadata.mime) return null;
    const bytes = await readFile(path.join(photoDirectory(), key, "image"));
    if (imageMime(bytes) !== metadata.mime) return null;
    return { mime: metadata.mime, bytes };
  } catch (error) {
    if (error instanceof DamagedPhotoCache || error instanceof SyntaxError || error instanceof z.ZodError || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
export async function readStoredPhoto(key: string): Promise<{ mime: string; bytes: Buffer } | null> {
  return withPhotoLock(async () => {
    try { return await readStoredPhotoUnlocked(key); } catch { return null; }
  });
}
export async function withValidStoredPhotos(state: TripState, save: (valid: TripState) => Promise<TripState>): Promise<{ state: TripState; removedPhotos: number }> {
  return withPhotoLock(async () => {
    let removedPhotos = 0;
    const places: Place[] = [];
    for (const place of state.places) {
      const key = place.image.match(photoPath)?.[1];
      if (!key || await readStoredPhotoUnlocked(key)) { places.push(place); continue; }
      const { photoCredit: _credit, ...remaining } = place;
      places.push({ ...remaining, image: "" }); removedPhotos++;
    }
    return { state: await save({ ...state, places }), removedPhotos };
  });
}
export async function clearStoredPhotos(update: () => Promise<void>): Promise<{ cleanupPending: boolean }> {
  return withPhotoLock(async () => {
    if (!localPhotosEnabled()) throw new Error("사진 저장소 삭제는 현재 로컬에서만 지원합니다.");
    const quarantined = path.join(dataDirectory(), `.place-photos-deleted-${randomUUID()}`);
    let moved = false;
    try { await rename(photoDirectory(), quarantined); moved = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { await update(); }
    catch (error) { if (moved) await rename(quarantined, photoDirectory()); throw error; }
    let cleanupPending = false;
    // Keep committed trip updates successful even if file cleanup needs a retry.
    let leftovers: string[];
    try { leftovers = await readdir(/* turbopackIgnore: true */ dataDirectory()); }
    catch { return { cleanupPending: true }; }
    for (const name of leftovers.filter((name) => /^\.place-photos-deleted-[a-f0-9-]{36}$/.test(name))) {
      try { await rm(path.join(/* turbopackIgnore: true */ dataDirectory(), name), { recursive: true, force: true }); }
      catch { cleanupPending = true; }
    }
    return { cleanupPending };
  });
}
