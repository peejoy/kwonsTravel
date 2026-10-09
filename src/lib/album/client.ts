import type { AlbumPhoto, PhotoMetadata, UploadReservation } from "./model";
export class AlbumClientError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function albumRequest<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", signal: AbortSignal.timeout(65000), ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new AlbumClientError(result.error || "사진 작업에 실패했습니다. 다시 시도해주세요.", response.status);
  return result as T;
}
export async function uploadPrepared(blob: Blob, metadata: PhotoMetadata, reservation?: UploadReservation, onReservation?: (value: UploadReservation) => void): Promise<AlbumPhoto> {
  let saved = reservation;
  if (saved) {
    try { return (await albumRequest<{ photo: AlbumPhoto }>(`/api/album/${saved.id}`)).photo; }
    catch (error) { if (!(error instanceof AlbumClientError) || error.status !== 404) throw error; }
    if (new Date(saved.uploadExpiresAt).valueOf() <= Date.now()) saved = await albumRequest<UploadReservation>(`/api/album/${saved.id}/upload`, "POST", { revision: saved.revision });
  } else saved = await albumRequest<UploadReservation>("/api/album", "POST", { metadata });
  onReservation?.(saved);
  const url = new URL(saved.uploadUrl);
  const expected = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!expected || url.origin !== new URL(expected).origin || url.protocol !== "https:" || !url.pathname.startsWith("/storage/v1/object/upload/sign/family-travel-photos/") || url.username || url.password) throw new Error("사진 업로드 연결 설정을 확인해주세요.");
  const response = await fetch(url.href, { method: "PUT", headers: { "Content-Type": "image/jpeg", "cache-control": "max-age=300" }, body: blob, credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error("사진 업로드에 실패했습니다. 다시 시도해주세요.");
  return (await albumRequest<{ photo: AlbumPhoto }>(`/api/album/${saved.id}/finalize`, "POST", { revision: saved.revision })).photo;
}
