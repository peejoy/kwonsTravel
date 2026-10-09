"use client";
import { useRef, useState } from "react";
import { Camera, Eraser, Grid2X2, ImagePlus, LoaderCircle, LockKeyhole, Map as MapIcon, MapPin, RefreshCw } from "lucide-react";
import type { Place } from "@/lib/model";
import { photoDateKey, type AlbumPhoto } from "@/lib/album/model";
import { IconButton } from "../ui";
import TripMap from "../trip-map";
import { useAlbum } from "./use-album";
import { photoPlace } from "./metadata-fields";
import UploadEditor from "./upload-editor";
import PhotoDetail from "./photo-detail";
export default function AlbumView({ places, onAuthRequired }: { places: Place[]; onAuthRequired: () => void }) {
  const album = useAlbum(onAuthRequired); const [mode, setMode] = useState<"grid" | "map">("grid"); const [uploading, setUploading] = useState(false); const [selected, setSelected] = useState<string | null>(null); const [focused, setFocused] = useState<string | null>(null);
  const attempts = useRef(new Map<string, string>());
  const imageError = (photo: AlbumPhoto) => {
    const last = attempts.current.get(photo.id); if (last && Date.now() - new Date(last).valueOf() < 60000) return;
    attempts.current.set(photo.id, new Date().toISOString()); void album.refreshPhoto(photo.id).catch(() => {});
  };
  const located = album.photos.filter((p) => p.lat !== null);
  const groups = new Map<string, AlbumPhoto[]>(); album.photos.forEach((p) => { const date = photoDateKey(p); groups.set(date, [...(groups.get(date) || []), p]); });
  const detail = album.photos.find((p) => p.id === selected);
  return <section aria-label="여행 앨범" className="album-view">
    <div className="album-toolbar"><span className="album-count">{album.photos.length}장{album.hasMore ? "+" : ""} · 위치 {located.length}장</span><div className="album-tools"><IconButton label="임시 업로드 파일 정리" disabled={album.loading || album.setup} onClick={() => void album.cleanup()}><Eraser size={16} /></IconButton><IconButton label="앨범 새로고침" disabled={album.loading} onClick={() => void album.refresh()}><RefreshCw size={16} /></IconButton><div className="segmented" role="group" aria-label="앨범 보기"><IconButton label="사진 목록" aria-pressed={mode === "grid"} className={mode === "grid" ? "active" : ""} onClick={() => setMode("grid")}><Grid2X2 size={16} /></IconButton><IconButton label="촬영 위치 지도" aria-pressed={mode === "map"} className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}><MapIcon size={16} /></IconButton></div><button className="button primary" disabled={album.setup} onClick={() => setUploading(true)}><ImagePlus size={16} />사진 올리기</button></div></div>
    {album.error && <div className="album-notice" role="alert">{album.setup ? <LockKeyhole size={18} /> : <Camera size={18} />}<span>{album.error}</span><button className="button secondary" onClick={() => void album.refresh()}>다시 시도</button></div>}
    {album.cleanupPending && <div className="album-notice" role="status"><span>사진은 앨범에서 제외됐으며 파일 정리가 남아 있습니다.</span><button className="button secondary" onClick={() => void album.cleanup()}>정리 다시 시도</button></div>}
    {album.loading && !album.photos.length && <div className="album-empty" role="status"><LoaderCircle className="spin" size={24} /><p>앨범을 불러오는 중</p></div>}
    {!album.loading && !album.photos.length && !album.error && <div className="album-empty"><Camera size={34} /><p>아직 여행사진이 없습니다.</p></div>}
    {mode === "grid" ? Array.from(groups).sort(([a], [b]) => a === "unknown" ? 1 : b === "unknown" ? -1 : b.localeCompare(a)).map(([date, photos]) => <section className="album-day" key={date}><h3>{date === "unknown" ? "촬영 날짜 미정" : date}</h3><div className="album-grid">{photos.map((p) => <button className="album-photo" key={p.id} onClick={() => setSelected(p.id)}><div className="album-photo-image"><img src={p.thumbnailUrl} alt={p.caption || "가족 여행사진"} loading="lazy" onError={() => imageError(p)} /></div><span>{p.caption || p.capturedAt?.slice(11, 16) || "여행사진"}</span><small><MapPin size={12} />{p.lat !== null ? "촬영 위치" : "위치 없음"}</small></button>)}</div></section>) : <div className="album-map"><TripMap points={located.map((p, index) => ({ place: photoPlace(p, p.caption || "여행사진", p.id), key: p.id, order: index + 1 }))} selected={focused} onSelect={setSelected} connectPoints={false} markerKind="photo" />{!located.length && !album.loading && <p className="album-muted">촬영 위치가 등록된 사진이 없습니다.</p>}</div>}
    {album.hasMore && <div className="album-more"><button className="button secondary" disabled={album.loading} onClick={() => void album.loadMore()}>{album.loading ? <LoaderCircle size={16} className="spin" /> : null}사진 더 보기</button></div>}
    {uploading && <UploadEditor places={places} onClose={() => setUploading(false)} onAdded={album.add} onError={album.fail} onCleanupPending={album.markCleanupPending} />}
    {detail && <PhotoDetail key={detail.id} photo={detail} places={places} onClose={() => setSelected(null)} onSave={album.edit} onDelete={album.remove} onImageError={() => imageError(detail)} onLocate={() => { setMode("map"); setFocused(detail.id); setSelected(null); }} />}
  </section>;
}
