import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BUCKET, UPLOAD_LIMIT, decodeCursor, encodeCursor, idSchema, photoMetadataSchema, photoPaths, revisionSchema, type AlbumPage, type AlbumPhoto, type PhotoMetadata, type UploadReservation } from "./model";
import { normalizeImage } from "./images";
export class AlbumError extends Error { constructor(message: string, public status = 503) { super(message); } }

const rowSchema = z.object({
  id: idSchema, trip_id: z.literal("okinawa"), caption: z.string(), captured_at: z.string().nullable(), capture_timezone: z.string().nullable(),
  lat: z.number().nullable(), lng: z.number().nullable(), location_source: z.enum(["exif", "manual", "place", "none"]),
  revision: revisionSchema, status: z.enum(["pending", "ready", "deleting"]), created_at: z.string(), updated_at: z.string(),
  upload_expires_at: z.string(), lease_id: z.string().nullable(), lease_expires_at: z.string().nullable(),
  temporary_cleanup_pending: z.boolean().default(false),
});
type Row = z.infer<typeof rowSchema>;
type Client = SupabaseClient;
const now = () => new Date().toISOString();
const future = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const conflict = () => new AlbumError("사진이 변경되었거나 처리 중입니다. 새로고침 후 다시 시도해주세요.", 409);
export function albumClient(): Client {
  const url = process.env.SUPABASE_URL?.trim(); const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key || new URL(url).protocol !== "https:") throw new AlbumError("Supabase 사진 저장소 설정이 필요합니다.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(20000) }) } });
}
async function guarded<T>(action: (client: Client) => Promise<T>): Promise<T> {
  try { return await action(albumClient()); }
  catch (error) {
    if (error instanceof AlbumError) throw error;
    if (error instanceof z.ZodError) throw new AlbumError("사진 정보 형식을 확인해주세요.", 400);
    throw new AlbumError("사진 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}
function metadataColumns(value: PhotoMetadata) {
  const m = photoMetadataSchema.parse(value);
  return { caption: m.caption, captured_at: m.capturedAt, capture_timezone: m.captureTimezone, lat: m.lat, lng: m.lng, location_source: m.locationSource };
}
function metadata(row: Row): PhotoMetadata {
  return photoMetadataSchema.parse({ caption: row.caption, capturedAt: row.captured_at?.slice(0, 19) || null, captureTimezone: row.capture_timezone, lat: row.lat, lng: row.lng, locationSource: row.location_source });
}
function checked<T>(result: { data: T; error: unknown }): T { if (result.error) throw new AlbumError("사진 저장소 작업을 완료하지 못했습니다."); return result.data; }
function table(client: Client) { return client.from("family_album"); }
async function row(client: Client, id: string): Promise<Row> {
  idSchema.parse(id);
  const data = checked(await table(client).select("*").eq("trip_id", "okinawa").eq("id", id).limit(1).retry(false));
  if (!data?.[0]) throw new AlbumError("사진을 찾을 수 없습니다.", 404);
  return rowSchema.parse(data[0]);
}
async function privateBucket(client: Client): Promise<void> {
  const bucket = checked(await client.storage.getBucket(BUCKET));
  if (!bucket || bucket.public) throw new AlbumError("가족사진 저장소가 비공개로 설정되어야 합니다.");
}
async function signedPhoto(client: Client, record: Row): Promise<AlbumPhoto> {
  if (record.status !== "ready") throw new AlbumError("아직 표시할 수 없는 사진입니다.", 404);
  await privateBucket(client);
  const paths = photoPaths(record.id);
  const image = checked(await client.storage.from(BUCKET).createSignedUrl(paths.display, 300));
  const thumbnail = checked(await client.storage.from(BUCKET).createSignedUrl(paths.thumbnail, 300));
  return { ...metadata(record), id: record.id, revision: record.revision, createdAt: record.created_at, updatedAt: record.updated_at, imageUrl: image!.signedUrl, thumbnailUrl: thumbnail!.signedUrl, urlsExpireAt: future(280) };
}
async function permission(client: Client, record: Row): Promise<UploadReservation> {
  await privateBucket(client);
  const result = checked(await client.storage.from(BUCKET).createSignedUploadUrl(photoPaths(record.id).temporary, { upsert: true }));
  if (!result) throw new AlbumError("사진 업로드 권한을 만들지 못했습니다.");
  let expiration = Date.now() + 2 * 60 * 60 * 1000;
  try { const exp = JSON.parse(Buffer.from(result.token.split(".")[1], "base64url").toString()).exp; if (typeof exp === "number") expiration = exp * 1000; } catch { /* Documented upload permission lifetime is two hours. */ }
  if (expiration > new Date(record.upload_expires_at).valueOf()) throw new AlbumError("업로드 권한 유효기간을 확인하지 못했습니다.");
  return { id: record.id, revision: record.revision, uploadUrl: result.signedUrl, uploadExpiresAt: new Date(expiration).toISOString() };
}
export async function reservePhoto(value: PhotoMetadata): Promise<UploadReservation> {
  return guarded(async (client) => {
    const id = randomUUID(); const paths = photoPaths(id); const timestamp = now();
    const record: Row = { id, trip_id: "okinawa", ...metadataColumns(value), revision: 0, status: "pending", created_at: timestamp, updated_at: timestamp, upload_expires_at: future(3 * 3600), lease_id: null, lease_expires_at: null, temporary_cleanup_pending: false };
    await privateBucket(client);
    checked(await table(client).insert({ ...record, temporary_path: paths.temporary, display_path: paths.display, thumbnail_path: paths.thumbnail }).retry(false));
    return permission(client, record);
  });
}
export async function renewUpload(id: string, revision: number): Promise<UploadReservation> {
  return guarded(async (client) => {
    revisionSchema.parse(revision);
    const data = checked(await table(client).update({ upload_expires_at: future(3 * 3600), updated_at: now() })
      .eq("trip_id", "okinawa").eq("id", idSchema.parse(id)).eq("revision", revision).eq("status", "pending")
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${now()}`).select("*").retry(false));
    if (!data?.[0]) throw conflict();
    return permission(client, rowSchema.parse(data[0]));
  });
}
export async function finalizePhoto(id: string, revision: number): Promise<AlbumPhoto> {
  return guarded(async (client) => {
    revisionSchema.parse(revision); const original = await row(client, id);
    if (original.status === "ready") return signedPhoto(client, original);
    const lease = randomUUID();
    const data = checked(await table(client).update({ lease_id: lease, lease_expires_at: future(120), updated_at: now() })
      .eq("trip_id", "okinawa").eq("id", id).eq("revision", revision).eq("status", "pending")
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${now()}`).select("*").retry(false));
    if (!data?.[0]) throw conflict();
    const paths = photoPaths(id);
    try {
      const input = checked(await client.storage.from(BUCKET).download(paths.temporary));
      if (!input || input.size > UPLOAD_LIMIT) throw new AlbumError("사진 크기는 3MB 이하여야 합니다.", 413);
      let outputs;
      try { outputs = await normalizeImage(Buffer.from(await input.arrayBuffer())); } catch { throw new AlbumError("사진 파일을 확인해주세요. 정상 JPEG 사진만 저장할 수 있습니다.", 415); }
      // A deleting row may not receive new display files after cancellation.
      const active = await row(client, id);
      if (active.status !== "pending" || active.lease_id !== lease) throw conflict();
      for (const [path, bytes] of [[paths.display, outputs.display], [paths.thumbnail, outputs.thumbnail]] as const) {
        checked(await client.storage.from(BUCKET).upload(path, bytes, { upsert: true, contentType: "image/jpeg", cacheControl: "300" }));
      }
      const published = checked(await table(client).update({ status: "ready", revision: revision + 1, updated_at: now(), lease_id: null, lease_expires_at: null, temporary_cleanup_pending: true })
        .eq("trip_id", "okinawa").eq("id", id).eq("revision", revision).eq("status", "pending").eq("lease_id", lease).select("*").retry(false));
      if (!published?.[0]) throw conflict();
      await client.storage.from(BUCKET).remove([paths.temporary]);
      return signedPhoto(client, rowSchema.parse(published[0]));
    } finally {
      await table(client).update({ lease_id: null, lease_expires_at: null }).eq("trip_id", "okinawa").eq("id", id).eq("lease_id", lease).eq("status", "pending").retry(false);
    }
  });
}
export async function listPhotos(cursor: string | null): Promise<AlbumPage> {
  return guarded(async (client) => {
    let query = table(client).select("*").eq("trip_id", "okinawa").eq("status", "ready").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(41);
    if (cursor) {
      let c; try { c = decodeCursor(cursor); } catch { throw new AlbumError("사진 목록 위치를 확인해주세요.", 400); }
      query = query.or(`created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`);
    }
    const records = z.array(rowSchema).parse(checked(await query.retry(false)));
    const page = records.slice(0, 40);
    return { photos: await Promise.all(page.map((p) => signedPhoto(client, p))), nextCursor: records.length > 40 ? encodeCursor({ createdAt: page[39].created_at, id: page[39].id }) : null };
  });
}
export async function getPhoto(id: string): Promise<AlbumPhoto> { return guarded(async (client) => signedPhoto(client, await row(client, id))); }
export async function updatePhoto(id: string, revision: number, value: PhotoMetadata): Promise<AlbumPhoto> {
  return guarded(async (client) => {
    revisionSchema.parse(revision);
    const data = checked(await table(client).update({ ...metadataColumns(value), revision: revision + 1, updated_at: now() }).eq("trip_id", "okinawa").eq("id", idSchema.parse(id)).eq("revision", revision).eq("status", "ready").select("*").retry(false));
    if (!data?.[0]) throw conflict(); return signedPhoto(client, rowSchema.parse(data[0]));
  });
}
async function removeRecord(client: Client, record: Row): Promise<boolean> {
  const paths = Object.values(photoPaths(record.id));
  const removal = await client.storage.from(BUCKET).remove(paths);
  if (removal.error) return false;
  if (Math.max(new Date(record.upload_expires_at).valueOf(), new Date(record.lease_expires_at || 0).valueOf()) > Date.now()) return false;
  const deleted = await table(client).delete().eq("trip_id", "okinawa").eq("id", record.id).eq("status", "deleting").eq("revision", record.revision).retry(false);
  return !deleted.error;
}
export async function deletePhoto(id: string, revision: number): Promise<{ cleanupPending: boolean }> {
  return guarded(async (client) => {
    revisionSchema.parse(revision); const original = await row(client, id);
    if (original.status === "deleting") return { cleanupPending: !await removeRecord(client, original) };
    const data = checked(await table(client).update({ status: "deleting", revision: revision + 1, updated_at: now() }).eq("trip_id", "okinawa").eq("id", id).eq("revision", revision).eq("status", original.status).select("*").retry(false));
    if (!data?.[0]) throw conflict(); return { cleanupPending: !await removeRecord(client, rowSchema.parse(data[0])) };
  });
}
export async function cleanupPhotos(): Promise<{ removed: number; pending: number; hasMore: boolean }> {
  return guarded(async (client) => {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const records = z.array(rowSchema).parse(checked(await table(client).select("*").eq("trip_id", "okinawa").or(`status.eq.deleting,and(status.eq.pending,updated_at.lt.${cutoff}),and(status.eq.ready,temporary_cleanup_pending.eq.true,upload_expires_at.lt.${now()})`).order("updated_at").limit(101).retry(false)));
    const hasMore = records.length > 100; let removed = 0, pending = hasMore ? 1 : 0;
    for (const record of records.slice(0, 100)) {
      if (record.status === "ready") {
        if (!record.temporary_cleanup_pending || new Date(record.upload_expires_at).valueOf() > Date.now()) continue;
        const result = await client.storage.from(BUCKET).remove([photoPaths(record.id).temporary]);
        if (result.error) { pending++; continue; }
        const updated = await table(client).update({ temporary_cleanup_pending: false }).eq("trip_id", "okinawa").eq("id", record.id).eq("status", "ready").eq("revision", record.revision).retry(false);
        if (updated.error) pending++; else removed++;
        continue;
      }
      if (record.status === "pending" && record.updated_at >= cutoff) continue;
      try { const result = await deletePhoto(record.id, record.revision); if (result.cleanupPending) pending++; else removed++; } catch { pending++; }
    }
    return { removed, pending, hasMore };
  });
}
