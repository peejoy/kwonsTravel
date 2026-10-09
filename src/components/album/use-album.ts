"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { albumRequest, AlbumClientError } from "@/lib/album/client";
import type { AlbumPage, AlbumPhoto, PhotoMetadata } from "@/lib/album/model";
export function useAlbum(onAuthRequired: () => void) {
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(false);
  const mounted = useRef(true); const lock = useRef(false); const auth = useRef(onAuthRequired); auth.current = onAuthRequired;
  const fail = useCallback((err: unknown) => {
    if (!mounted.current) return;
    if (err instanceof AlbumClientError && err.status === 401) { setPhotos([]); auth.current(); }
    setError(err instanceof Error ? err.message : "사진을 불러오지 못했습니다.");
    setSetup(err instanceof AlbumClientError && err.status === 503);
  }, []);
  const load = useCallback(async (after: string | null = null) => {
    if (lock.current) return; lock.current = true; setLoading(true); setError("");
    try {
      const page = await albumRequest<AlbumPage>(`/api/album${after ? `?cursor=${encodeURIComponent(after)}` : ""}`);
      if (mounted.current) { setPhotos((old) => after ? [...old.filter((p) => !page.photos.some((n) => n.id === p.id)), ...page.photos] : page.photos); setCursor(page.nextCursor); setSetup(false); }
    } catch (err) { fail(err); } finally { lock.current = false; if (mounted.current) setLoading(false); }
  }, [fail]);
  const refreshPhoto = useCallback(async (id: string) => {
    try {
      const result = await albumRequest<{ photo: AlbumPhoto }>(`/api/album/${id}`);
      if (mounted.current) setPhotos((old) => old.map((p) => p.id === id ? result.photo : p));
      return result.photo;
    } catch (err) { fail(err); throw err; }
  }, [fail]);
  useEffect(() => {
    mounted.current = true; void load();
    return () => { mounted.current = false; };
  }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") photos.filter((p) => new Date(p.urlsExpireAt).valueOf() < Date.now()).forEach((p) => void refreshPhoto(p.id).catch(() => {})); };
    document.addEventListener("visibilitychange", refresh); const timer = setInterval(refresh, 60000);
    return () => { document.removeEventListener("visibilitychange", refresh); clearInterval(timer); };
  }, [photos, refreshPhoto]);
  async function edit(photo: AlbumPhoto, metadata: PhotoMetadata) {
    try { const result = await albumRequest<{ photo: AlbumPhoto }>(`/api/album/${photo.id}`, "PATCH", { revision: photo.revision, metadata }); setPhotos((old) => old.map((p) => p.id === photo.id ? result.photo : p)); return result.photo; }
    catch (err) { fail(err); if (err instanceof AlbumClientError && err.status === 409) await refreshPhoto(photo.id).catch(() => {}); throw err; }
  }
  async function remove(photo: AlbumPhoto) {
    try { const result = await albumRequest<{ cleanupPending: boolean }>(`/api/album/${photo.id}`, "DELETE", { revision: photo.revision }); setPhotos((old) => old.filter((p) => p.id !== photo.id)); setCleanupPending(result.cleanupPending); }
    catch (err) { fail(err); throw err; }
  }
  async function cleanup() {
    try { const result = await albumRequest<{ pending: number }>("/api/album/cleanup", "POST", {}); setCleanupPending(result.pending > 0); }
    catch (err) { fail(err); }
  }
  return { photos, loading, error, setup, cleanupPending, loadMore: () => load(cursor), hasMore: !!cursor, refresh: () => load(), refreshPhoto, edit, remove, cleanup,
    add: (photo: AlbumPhoto) => setPhotos((old) => [photo, ...old.filter((p) => p.id !== photo.id)]), fail };
}
