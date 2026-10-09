"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, Pause, RotateCw, X } from "lucide-react";
import type { Place } from "@/lib/model";
import { preparePhoto, type PreparedPhoto } from "@/lib/album/prepare";
import { SELECTION_LIMIT, photoMetadataSchema, type AlbumPhoto, type UploadReservation } from "@/lib/album/model";
import { cancelReservation, uploadPrepared } from "@/lib/album/client";
import { IconButton, Modal } from "../ui";
import { MetadataFields } from "./metadata-fields";
type Draft = PreparedPhoto & { key: string; name: string; status: "ready" | "uploading" | "done" | "error"; error?: string; reservation?: UploadReservation };
export default function UploadEditor({ places, onClose, onAdded, onError, onCleanupPending }: { places: Place[]; onClose: () => void; onAdded: (photo: AlbumPhoto) => void; onError: (error: unknown) => void; onCleanupPending: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]); const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const refs = useRef<Draft[]>([]); const stop = useRef(false); const mounted = useRef(true); const input = useRef<HTMLInputElement>(null);
  function replace(next: Draft[]) { refs.current = next; setDrafts(next); }
  function update(key: string, patch: Partial<Draft>) { replace(refs.current.map((d) => d.key === key ? { ...d, ...patch } : d)); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; refs.current.forEach((d) => URL.revokeObjectURL(d.previewUrl)); }; }, []);
  async function choose(files: FileList | null) {
    if (!files || busy) return; const list = Array.from(files); if (refs.current.length + list.length > SELECTION_LIMIT) { setError("한 번에 20장까지 선택할 수 있습니다."); return; }
    setBusy(true); setError("");
    for (const file of list) {
      try { const photo = await preparePhoto(file); if (!mounted.current) { URL.revokeObjectURL(photo.previewUrl); break; }
        const key = crypto.randomUUID(); replace([...refs.current, { ...photo, key, name: file.name, status: "ready" }]); setSelected((old) => old || key);
      } catch (err) { setError(`${file.name}: ${err instanceof Error ? err.message : "사진을 읽을 수 없습니다."}`); }
    }
    if (input.current) input.current.value = ""; if (mounted.current) setBusy(false);
  }
  async function upload(onlyKey?: string) {
    if (busy) return; setBusy(true); setError(""); stop.current = false;
    for (const original of refs.current) {
      if (stop.current) break; if (original.status === "done") continue;
      if (onlyKey && original.key !== onlyKey) continue;
      try {
        photoMetadataSchema.parse(original.metadata); update(original.key, { status: "uploading", error: "" }); setSelected(original.key);
        const photo = await uploadPrepared(original.blob, original.metadata, original.reservation, (reservation) => update(original.key, { reservation }));
        update(original.key, { status: "done" }); onAdded(photo);
      } catch (err) {
        update(original.key, { status: "error", error: err instanceof Error ? err.message : "업로드에 실패했습니다." }); onError(err);
        if ((err as { status?: number }).status === 401) { stop.current = true; break; }
      }
    }
    if (mounted.current) setBusy(false);
  }
  async function discard(draft: Draft): Promise<boolean> {
    if (draft.reservation && draft.status !== "done") {
      try { const result = await cancelReservation(draft.reservation); if (result.photo) onAdded(result.photo); if (result.cleanupPending) onCleanupPending(); }
      catch (err) { setError(err instanceof Error ? err.message : "사진 정리를 다시 시도해주세요."); onError(err); return false; }
    }
    URL.revokeObjectURL(draft.previewUrl); replace(refs.current.filter((d) => d.key !== draft.key)); setSelected(refs.current[0]?.key || "");
    return true;
  }
  async function close() { if (busy) return; setBusy(true); for (const d of [...refs.current]) if (d.status !== "done" && !await discard(d)) { setBusy(false); return; } onClose(); }
  const active = drafts.find((d) => d.key === selected); const remaining = drafts.filter((d) => d.status !== "done").length;
  return <Modal title="여행사진 올리기" busy={busy} onClose={() => void close()}>
    <div className="album-upload">
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" aria-label="여행사진 선택" onChange={(e) => void choose(e.target.files)} hidden />
      <div className="album-upload-toolbar"><button type="button" className="button secondary" disabled={busy || drafts.length >= SELECTION_LIMIT} onClick={() => input.current?.click()}><ImagePlus size={16} />사진 선택</button><span>{drafts.filter((d) => d.status === "done").length} / {drafts.length}장</span></div>
      {error && <p role="alert" className="form-error">{error}</p>}
      {!!drafts.length && <div className="album-draft-strip">{drafts.map((d) => <button key={d.key} className={selected === d.key ? "active" : ""} disabled={busy} onClick={() => setSelected(d.key)} aria-label={d.name}><img src={d.previewUrl} alt={d.name} />{d.status === "done" && <Check size={16} />}{d.status === "error" && <span className="album-draft-error">!</span>}</button>)}</div>}
      {active && <><img className="album-upload-preview" src={active.previewUrl} alt={active.name} /><div className="album-file-heading"><span>{active.name}</span><IconButton label="선택 사진 제외" disabled={busy} onClick={() => void discard(active)}><X size={16} /></IconButton></div>
        {active.error && <div className="album-notice"><p className="form-error" role="alert">{active.error}</p><button type="button" className="button secondary" disabled={busy} onClick={() => void upload(active.key)}><RotateCw size={16} />이 사진 다시 업로드</button></div>}
        <fieldset className="editor-form album-metadata" disabled={busy || active.status === "done" || !!active.reservation}><MetadataFields value={active.metadata} places={places} disabled={busy || active.status === "done" || !!active.reservation} onChange={(metadata) => update(active.key, { metadata })} /></fieldset>
      </>}
      {!drafts.length && <div className="album-empty"><ImagePlus size={32} /><p>선택한 사진이 없습니다.</p></div>}
      <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => void close()}>{remaining ? "취소" : "완료"}</button>{busy ? <button type="button" className="button secondary" onClick={() => { stop.current = true; }}><Pause size={16} />업로드 중단</button> : !!remaining && <button type="button" className="button primary" onClick={() => void upload()}><RotateCw size={16} />{drafts.some((d) => d.status === "error") ? "다시 업로드" : `${remaining}장 업로드`}</button>}{busy && <LoaderCircle size={18} className="spin" />}</div>
    </div>
  </Modal>;
}
