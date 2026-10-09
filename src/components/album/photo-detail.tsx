"use client";
import { useEffect, useState } from "react";
import { ExternalLink, MapPin, Pencil, Save, Trash2 } from "lucide-react";
import type { Place } from "@/lib/model";
import { photoMetadataSchema, type AlbumPhoto, type PhotoMetadata } from "@/lib/album/model";
import { Modal } from "../ui";
import { DeleteConfirm } from "../editors";
import { locationLabels, MetadataFields } from "./metadata-fields";
function fields(p: AlbumPhoto): PhotoMetadata { return { caption: p.caption, capturedAt: p.capturedAt, captureTimezone: p.captureTimezone, lat: p.lat, lng: p.lng, locationSource: p.locationSource }; }
export default function PhotoDetail({ photo, places, onClose, onSave, onDelete, onLocate, onImageError }: { photo: AlbumPhoto; places: Place[]; onClose: () => void; onSave: (photo: AlbumPhoto, metadata: PhotoMetadata) => Promise<AlbumPhoto>; onDelete: (photo: AlbumPhoto) => Promise<void>; onLocate: () => void; onImageError: () => void }) {
  const [editing, setEditing] = useState(false); const [deleting, setDeleting] = useState(false); const [draft, setDraft] = useState(fields(photo)); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { setDraft(fields(photo)); }, [photo.revision]);
  async function save() { setBusy(true); setError(""); try { await onSave(photo, photoMetadataSchema.parse(draft)); setEditing(false); } catch (err) { setError(err instanceof Error ? err.message : "사진을 수정하지 못했습니다."); } finally { setBusy(false); } }
  async function remove() { setBusy(true); try { await onDelete(photo); onClose(); } catch (err) { setError(err instanceof Error ? err.message : "사진을 삭제하지 못했습니다."); setDeleting(false); } finally { setBusy(false); } }
  return <>
    <Modal title="우리 가족 여행사진" onClose={onClose} busy={busy}><div className="album-detail"><a className="album-full-link" href={photo.imageUrl} target="_blank" rel="noopener noreferrer" title="사진 크게 열기"><img src={photo.imageUrl} alt={photo.caption || "가족 여행사진"} onError={onImageError} /></a>
      {error && <p className="form-error" role="alert">{error}</p>}
      {editing ? <fieldset className="editor-form album-metadata" disabled={busy}><MetadataFields value={draft} places={places} onChange={setDraft} /></fieldset> : <><p className="album-caption">{photo.caption || "설명 없음"}</p><p className="album-muted">{photo.capturedAt?.replace("T", " ") || "촬영 날짜 미정"}{photo.capturedAt ? ` · ${photo.captureTimezone || "시간대 정보 없음"}` : ""}</p><div className="album-location"><MapPin size={14} />{locationLabels[photo.locationSource]}</div>{photo.lat !== null && <div className="album-detail-links"><button className="button secondary" onClick={onLocate}><MapPin size={16} />지도에서 보기</button><a className="button secondary" href={`https://www.google.com/maps/search/?api=1&query=${photo.lat},${photo.lng}`} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Google 지도</a></div>}</>}
      <div className="form-actions"><button className="button danger-text" disabled={busy} onClick={() => setDeleting(true)}><Trash2 size={16} />삭제</button>{editing ? <><button className="button secondary" disabled={busy} onClick={() => { setEditing(false); setDraft(fields(photo)); }}>취소</button><button className="button primary" disabled={busy} onClick={() => void save()}><Save size={16} />저장</button></> : <button className="button secondary" onClick={() => setEditing(true)}><Pencil size={16} />수정</button>}</div>
    </div></Modal>
    {deleting && <DeleteConfirm title="여행사진 삭제" description="가족 앨범에서 이 사진을 삭제합니다. 일정과 장소는 유지됩니다. 사진 삭제는 되돌릴 수 없습니다." busy={busy} onClose={() => { if (!busy) setDeleting(false); }} onDelete={remove} />}
  </>;
}
