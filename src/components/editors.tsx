"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MapPin, Plus, Trash2, Link2, LoaderCircle, ImageDown } from "lucide-react";
import { categoryLabels, packingCategories, mapsUrl, placeSchema, type Category, type PackingItem, type Place, type ScheduleItem, type Trip, type TripState } from "@/lib/model";
import { googleMapsLinkUrl, type GoogleMapsPlaceDraft } from "@/lib/maps-link";
import { manualPlace, type ManualPlaceFields } from "@/lib/manual-place";
import TripMap from "./trip-map";
import { CategoryBadge, Modal, NavigationControls, PhotoCredit, PlaceImage, SubmitButton } from "./ui";

type Common = { onClose: () => void; busy: boolean };
type ImportedPlace = GoogleMapsPlaceDraft & Partial<Pick<Place, "image" | "photoCredit">>;
function EditorForm({ busy, children, onSubmit }: { busy: boolean; children: React.ReactNode; onSubmit: React.FormEventHandler<HTMLFormElement> }) {
  return <form onSubmit={onSubmit}><fieldset className="editor-form" disabled={busy}>{children}</fieldset></form>;
}
function ErrorMessage({ error }: { error: string }) { return error ? <p className="form-error" role="alert">{error}</p> : null; }
function useSave<T>(save: (value: T) => Promise<void>) {
  const [error, setError] = useState("");
  return { error, submit: async (value: T) => { setError(""); try { await save(value); } catch (err) { setError(err instanceof Error ? err.message : "저장하지 못했습니다. 다시 시도해주세요."); } } };
}

type PlaceEditorProps = Common & { value?: Place; defaultCategory?: Category; onSave: (value: Place, original?: Place) => Promise<void>; onAuthRequired: () => void };
export function PlaceEditor({ value, ...props }: PlaceEditorProps) {
  return value ? <ExistingPlaceEditor value={value} {...props} /> : <GooglePlaceAdd {...props} />;
}

function GooglePlaceAdd({ defaultCategory = "sight", onSave, onClose, busy, onAuthRequired }: Omit<PlaceEditorProps, "value">) {
  const linkInput = useRef<HTMLInputElement>(null);
  useEffect(() => { linkInput.current?.focus(); }, []);
  const [id] = useState(() => crypto.randomUUID());
  const [mapLink, setMapLink] = useState("");
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [favorite, setFavorite] = useState(false);
  const [imported, setImported] = useState<Place | null>(null);
  const [importing, setImporting] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [photoWarning, setPhotoWarning] = useState("");
  const [manual, setManual] = useState(false);
  const [manualFields, setManualFields] = useState({ name: "", area: "", description: "", notes: "", lat: "", lng: "" });
  const [manualError, setManualError] = useState("");
  const { error, submit } = useSave<Place>((place) => onSave(place));
  const locked = busy || importing;
  const ready = imported !== null && mapLink.trim() === imported.googleMapsUrl;
  const manualDraft: ManualPlaceFields = { ...manualFields, id, category, favorite, mapLink };
  let manualPreview: Place | null = null;
  try { manualPreview = manualPlace({ ...manualDraft, name: manualDraft.name || "선택한 위치", mapLink: "" }); } catch {}
  const updateManual = (key: keyof typeof manualFields, value: string) => { setManualFields((current) => ({ ...current, [key]: value })); setManualError(""); };

  async function importLink() {
    if (locked || !mapLink.trim()) return;
    setImporting(true); setImported(null); setLinkError(""); setPhotoWarning("");
    try {
      const source = googleMapsLinkUrl(mapLink).href;
      const response = await fetch("/api/places/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: source }) });
      const data = await response.json();
      if (response.status === 401) onAuthRequired();
      if (!response.ok) throw new Error(data.error || "장소를 불러오지 못했습니다.");
      const place: ImportedPlace | undefined = data.place;
      const parsed = placeSchema.safeParse({
        id, name: place?.name, lat: place?.lat, lng: place?.lng, googleMapsUrl: place?.googleMapsUrl,
        category, favorite, area: "", description: "", image: place?.image || "", photoCredit: place?.photoCredit, link: "", notes: "",
      });
      if (!parsed.success || !place?.googleMapsUrl) throw new Error("장소 이름과 정확한 위치를 확인할 수 없습니다. Google 지도에서 해당 장소의 공유 링크를 다시 복사해주세요.");
      setImported(parsed.data); setMapLink(place.googleMapsUrl); setManual(false);
      setPhotoWarning(data.photoWarning || "");
    } catch (err) {
      setLinkError(err instanceof Error && !(err instanceof TypeError) ? err.message : "링크를 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.");
    } finally { setImporting(false); }
  }

  return <Modal title={manual ? "장소 직접 등록" : "Google 지도로 장소 추가"} onClose={onClose} busy={locked}>
    <EditorForm busy={locked} onSubmit={(e) => {
      e.preventDefault(); if (locked) return;
      if (manual) { try { const place = manualPlace(manualDraft); setManualError(""); void submit(place); } catch (err) { setManualError(err instanceof Error ? err.message : "입력 정보를 확인해주세요."); } }
      else if (ready && imported) void submit({ ...imported, category, favorite });
    }}>
      <div className="maps-link-import"><label>Google 지도 링크<div className="maps-link-row"><input ref={linkInput} type="url" required={!manual} aria-label="Google 지도 링크" maxLength={2048} value={mapLink} onChange={(e) => { setMapLink(e.target.value); setImported(null); setLinkError(""); setManualError(""); }} placeholder="https://maps.app.goo.gl/…" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && !manual) { e.preventDefault(); void importLink(); } }} /><button type="button" className="button secondary" disabled={locked || !mapLink.trim()} onClick={() => void importLink()}>{importing ? <LoaderCircle size={16} className="spin" /> : <Link2 size={16} />}{importing ? "불러오는 중" : "불러오기"}</button></div></label><ErrorMessage error={linkError} /></div>
      {!manual && linkError && <button type="button" className="button secondary" onClick={() => { setManual(true); setManualError(""); }}><Plus size={16} />직접 등록</button>}
      {manual && <>
        <label>장소 이름<input required maxLength={120} value={manualFields.name} onChange={(e) => updateManual("name", e.target.value)} autoFocus /></label>
        <label>지역<input maxLength={100} value={manualFields.area} onChange={(e) => updateManual("area", e.target.value)} /></label>
        <div className="map-field"><span>위치</span><TripMap compact baseOnly points={manualPreview ? [{ place: manualPreview, key: id, order: 1 }] : []} selected={manualPreview ? id : null} onSelect={() => {}} onPick={(lat, lng) => { if (!locked) { setManualFields((current) => ({ ...current, lat: lat.toFixed(6), lng: lng.toFixed(6) })); setManualError(""); } }} /></div>
        <div className="form-row"><label>위도<input type="number" required min={-90} max={90} step="any" value={manualFields.lat} onChange={(e) => updateManual("lat", e.target.value)} /></label><label>경도<input type="number" required min={-180} max={180} step="any" value={manualFields.lng} onChange={(e) => updateManual("lng", e.target.value)} /></label></div>
        <label>소개<textarea rows={2} maxLength={3000} value={manualFields.description} onChange={(e) => updateManual("description", e.target.value)} /></label>
        <label>개인 메모<textarea rows={2} maxLength={3000} value={manualFields.notes} onChange={(e) => updateManual("notes", e.target.value)} /></label>
        <ErrorMessage error={manualError} />
        <button type="button" className="button secondary" onClick={() => setManual(false)}><Link2 size={16} />링크 자동 등록으로 돌아가기</button>
      </>}
      {!manual && ready && imported && <section className="maps-place-preview" aria-label="불러온 장소"><div className="maps-place-preview-heading"><h3>{imported.name}</h3><a className="button secondary" href={imported.googleMapsUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Google 지도</a></div>{imported.image && <div className="import-photo"><PlaceImage src={imported.image} alt={imported.name} /></div>}<PhotoCredit credit={imported.photoCredit} /><TripMap compact points={[{ place: imported, key: imported.id, order: 1 }]} selected={imported.id} onSelect={() => {}} /></section>}
      {ready && photoWarning && <p className="photo-warning" role="status">{photoWarning}</p>}
      <label>분류<select aria-label="분류" value={category} onChange={(e) => setCategory(e.target.value as Category)}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="checkbox-label"><input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />즐겨찾기에 저장</label>
      <ErrorMessage error={error} /><div className="form-actions"><button className="button secondary" type="button" onClick={onClose} disabled={locked}>취소</button><SubmitButton busy={busy} disabled={(!manual && !ready) || importing}>장소 등록</SubmitButton></div>
    </EditorForm>
  </Modal>;
}

function ExistingPlaceEditor({ value, onSave, onClose, busy, onAuthRequired }: PlaceEditorProps & { value: Place }) {
  const [draft, setDraft] = useState<Place>(value);
  const [mapLink, setMapLink] = useState(value?.googleMapsUrl || "");
  const [importing, setImporting] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [needsLocation, setNeedsLocation] = useState(false);
  const [photoWarning, setPhotoWarning] = useState("");
  const [photoFetching, setPhotoFetching] = useState(false);
  const original = useRef(value).current;
  const { error, submit } = useSave<Place>((edited) => onSave(edited, original));
  const update = <K extends keyof Place>(key: K, val: Place[K]) => {
    setDraft((d) => ({ ...d, [key]: val, ...(key === "image" ? { photoCredit: undefined } : {}), ...(["name", "lat", "lng"].includes(key) && d.image.startsWith("/api/place-photos/") ? { image: "", photoCredit: undefined } : {}) }));
    if (key === "lat" || key === "lng") { setNeedsLocation(false); setLinkError(""); }
  };
  function updateMapLink(link: string) {
    setMapLink(link); setLinkError("");
    if (!link.trim()) {
      setDraft((current) => ({ ...current, googleMapsUrl: "" }));
      setNeedsLocation(false);
    } else setNeedsLocation(true);
  }
  async function importLink() {
    if (busy || importing || !mapLink.trim()) return;
    setImporting(true); setLinkError(""); setNeedsLocation(true);
    try {
      const source = googleMapsLinkUrl(mapLink).href;
      setDraft((current) => ({ ...current, googleMapsUrl: source }));
      setMapLink(source);
      const response = await fetch("/api/places/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: source }) });
      const data = await response.json();
      if (response.status === 401) onAuthRequired();
      if (!response.ok) throw new Error(data.error || "장소를 불러오지 못했습니다.");
      const imported: ImportedPlace = data.place;
      const hasLocation = typeof imported.lat === "number" && typeof imported.lng === "number";
      setDraft((current) => ({ ...current, ...(imported.name ? { name: imported.name } : {}), ...(hasLocation ? { lat: imported.lat!, lng: imported.lng! } : {}), googleMapsUrl: imported.googleMapsUrl, ...(!current.image || current.image.startsWith("/api/place-photos/") ? { image: imported.image || "", photoCredit: imported.photoCredit } : {}) }));
      setPhotoWarning(data.photoWarning || "");
      setMapLink(imported.googleMapsUrl);
      setNeedsLocation(!hasLocation);
      if (!hasLocation) setLinkError("이 링크에는 정확한 장소 좌표가 없습니다. 지도에서 위치를 선택하거나 좌표를 확인해주세요.");
    } catch (err) { setLinkError(`${err instanceof Error && !(err instanceof TypeError) ? err.message : "링크를 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요."} 위치를 직접 확인하거나 링크를 지운 뒤 저장해주세요.`); }
    finally { setImporting(false); }
  }
  async function importPhoto() {
    if (busy || importing || photoFetching) return;
    setPhotoFetching(true); setPhotoWarning("");
    try {
      const response = await fetch("/api/place-photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place: { name: draft.name, lat: draft.lat, lng: draft.lng, googleMapsUrl: draft.googleMapsUrl } }) });
      const result = await response.json();
      if (response.status === 401) onAuthRequired();
      if (!response.ok) throw new Error(result.error || "사진을 불러오지 못했습니다.");
      if (result.photo) {
        const updated = placeSchema.parse({ ...draft, ...result.photo });
        setDraft(updated);
      } else setPhotoWarning(result.warning || "이 장소의 사진을 찾지 못했습니다.");
    } catch (error) { setPhotoWarning(error instanceof Error ? error.message : "사진을 불러오지 못했습니다."); }
    finally { setPhotoFetching(false); }
  }
  const locked = busy || importing || photoFetching;
  const pendingLink = mapLink.trim() !== (draft.googleMapsUrl || "").trim();
  return <Modal title={value ? "장소 수정" : "새로운 장소"} onClose={onClose} busy={locked}>
    <EditorForm busy={locked} onSubmit={(e) => { e.preventDefault(); if (!locked && !needsLocation && !pendingLink) void submit(draft); }}>
      <div className="maps-link-import"><label>Google 지도 링크<div className="maps-link-row"><input type="url" aria-label="Google 지도 링크" maxLength={2048} value={mapLink} onChange={(e) => updateMapLink(e.target.value)} placeholder="https://maps.app.goo.gl/…" autoFocus={!value} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void importLink(); } }} /><button type="button" className="button secondary" disabled={locked || !mapLink.trim()} onClick={() => void importLink()}>{importing ? <LoaderCircle size={16} className="spin" /> : <Link2 size={16} />}{importing ? "불러오는 중" : "불러오기"}</button></div></label><ErrorMessage error={linkError} /></div>
      <label>장소 이름<input required maxLength={120} value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="가고 싶은 장소" autoFocus={!!value} /></label>
      <div className="form-row"><label>분류<select aria-label="분류" value={draft.category} onChange={(e) => update("category", e.target.value as Category)}>{Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>지역<input maxLength={100} value={draft.area} onChange={(e) => update("area", e.target.value)} placeholder="나하, 차탄, 모토부" /></label></div>
      <div className="map-field"><span>위치</span><TripMap compact points={[{ place: draft, key: draft.id, order: 1 }]} selected={draft.id} onSelect={() => {}} onPick={(lat, lng) => { if (!locked) { setDraft((d) => ({ ...d, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), ...(d.image.startsWith("/api/place-photos/") ? { image: "", photoCredit: undefined } : {}) })); setNeedsLocation(false); setLinkError(""); } }} /></div>
      <div className="form-row"><label>위도<input type="number" required min={-90} max={90} step="any" value={draft.lat} onChange={(e) => update("lat", Number(e.target.value))} /></label><label>경도<input type="number" required min={-180} max={180} step="any" value={draft.lng} onChange={(e) => update("lng", Number(e.target.value))} /></label></div>
      <label>소개<textarea rows={2} maxLength={3000} value={draft.description} onChange={(e) => update("description", e.target.value)} placeholder="이곳에서 하고 싶은 것" /></label>
      <label>사진 주소<div className="maps-link-row"><input value={draft.image} onChange={(e) => update("image", e.target.value)} placeholder="https://…" maxLength={2048} /><button type="button" className="button secondary" title="Google 사진 가져오기" aria-label="Google 사진 가져오기" disabled={locked || !!draft.image || needsLocation || pendingLink || !draft.googleMapsUrl} onClick={() => void importPhoto()}>{photoFetching ? <LoaderCircle size={16} className="spin" /> : <ImageDown size={16} />}</button></div></label>
      {draft.image && <div className="import-photo"><PlaceImage src={draft.image} alt={draft.name} /></div>}<PhotoCredit credit={draft.image ? draft.photoCredit : undefined} />
      {photoWarning && <p className="photo-warning" role="status">{photoWarning}</p>}
      <label>예약·공식 사이트<input type="url" value={draft.link} onChange={(e) => update("link", e.target.value)} placeholder="https://…" maxLength={2048} /></label>
      <label>개인 메모<textarea rows={2} value={draft.notes} onChange={(e) => update("notes", e.target.value)} maxLength={3000} placeholder="예약, 주차, 사진 구도 등" /></label>
      <label className="checkbox-label"><input type="checkbox" checked={draft.favorite} onChange={(e) => update("favorite", e.target.checked)} />즐겨찾기에 저장</label>
      <ErrorMessage error={error} /><div className="form-actions"><button className="button secondary" type="button" onClick={onClose} disabled={locked}>취소</button><SubmitButton busy={busy} disabled={importing || needsLocation || pendingLink} /></div>
    </EditorForm>
  </Modal>;
}

export function ScheduleEditor({ value, placeId, state, day, onSave, onClose, busy }: Common & { value?: ScheduleItem; placeId?: string; state: TripState; day: number; onSave: (value: ScheduleItem, original?: ScheduleItem) => Promise<void> }) {
  const [draft, setDraft] = useState<ScheduleItem>(value || { id: crypto.randomUUID(), placeId: placeId || state.places[0]?.id || "", day, time: "10:00", duration: 60, notes: "", completed: false });
  const original = useRef(value).current;
  const { error, submit } = useSave<ScheduleItem>((edited) => onSave(edited, original));
  return <Modal title={value ? "일정 수정" : "일정 추가"} onClose={onClose} busy={busy}>
    <EditorForm busy={busy} onSubmit={(e) => { e.preventDefault(); void submit(draft); }}>
      <label>장소<select aria-label="장소" required value={draft.placeId} onChange={(e) => setDraft({ ...draft, placeId: e.target.value })} autoFocus><option value="" disabled>장소 선택</option>{state.places.map((p) => <option key={p.id} value={p.id}>{p.name} ({categoryLabels[p.category]})</option>)}</select></label>
      <div className="form-row"><label>여행 날짜<select aria-label="여행 날짜" value={draft.day} onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}>{Array.from({ length: state.trip.days }, (_, i) => <option key={i} value={i + 1}>{i + 1}일차</option>)}</select></label><label>시작 시간<input type="time" required value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></label></div>
      <label>머무는 시간 (분)<input type="number" min={0} max={1440} required step={15} value={draft.duration} onChange={(e) => setDraft({ ...draft, duration: Number(e.target.value) })} /></label>
      <label>메모<textarea rows={4} maxLength={3000} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="예약 시간, 함께 할 것" /></label>
      <ErrorMessage error={error} /><div className="form-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>취소</button><SubmitButton busy={busy}>{value ? "저장" : "일정에 추가"}</SubmitButton></div>
    </EditorForm>
  </Modal>;
}

export function PackingEditor({ value, onSave, onClose, busy }: Common & { value?: PackingItem; onSave: (value: PackingItem, original?: PackingItem) => Promise<void> }) {
  const [draft, setDraft] = useState<PackingItem>(value || { id: crypto.randomUUID(), label: "", category: "기타", assignee: "", done: false });
  const original = useRef(value).current;
  const { error, submit } = useSave<PackingItem>((edited) => onSave(edited, original));
  return <Modal title={value ? "준비물 수정" : "준비물 추가"} onClose={onClose} busy={busy}>
    <EditorForm busy={busy} onSubmit={(e) => { e.preventDefault(); void submit(draft); }}>
      <label>준비물<input required maxLength={120} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} autoFocus placeholder="챙겨갈 것" /></label>
      <div className="form-row"><label>분류<select aria-label="분류" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as PackingItem["category"] })}>{packingCategories.map((c) => <option key={c}>{c}</option>)}</select></label><label>담당자<input maxLength={80} value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} placeholder="가족 이름" /></label></div>
      <ErrorMessage error={error} /><div className="form-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>취소</button><SubmitButton busy={busy} /></div>
    </EditorForm>
  </Modal>;
}

export function TripEditor({ value, onSave, onClose, busy }: Common & { value: Trip; onSave: (value: Trip, original: Trip) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const original = useRef(value).current;
  const { error, submit } = useSave<Trip>((edited) => onSave(edited, original));
  return <Modal title="여행 설정" onClose={onClose} busy={busy}>
    <EditorForm busy={busy} onSubmit={(e) => { e.preventDefault(); void submit(draft); }}>
      <label>여행 이름<input required maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus /></label>
      <label>출발 날짜<input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} /></label>
      <div className="form-row"><label>여행 일수<input type="number" min={1} max={14} required value={draft.days} onChange={(e) => setDraft({ ...draft, days: Number(e.target.value) })} /></label><label>여행 인원<input type="number" min={1} max={30} value={draft.travelers ?? ""} onChange={(e) => setDraft({ ...draft, travelers: e.target.value ? Number(e.target.value) : null })} placeholder="미정" /></label></div>
      <label>여행 메모<textarea rows={5} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} maxLength={3000} placeholder="숙소, 항공편, 가족과 공유할 내용" /></label>
      <ErrorMessage error={error} /><div className="form-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>취소</button><SubmitButton busy={busy} /></div>
    </EditorForm>
  </Modal>;
}

export function PlaceDetail({ place, onClose, onEdit, onSchedule, onDelete }: { place: Place; onClose: () => void; onEdit: () => void; onSchedule: () => void; onDelete: () => void }) {
  return <Modal title={place.name} onClose={onClose}>
    <div className="place-detail"><PlaceImage src={place.image} alt={place.name} /><PhotoCredit credit={place.image ? place.photoCredit : undefined} /><div className="detail-meta"><CategoryBadge category={place.category} /><span><MapPin size={14} />{place.area || "오키나와"}</span></div><p>{place.description || "아직 소개가 없습니다."}</p>{place.notes && <div className="detail-note"><h3>우리 가족 메모</h3><p>{place.notes}</p></div>}<NavigationControls place={place} /><div className="detail-links"><a href={place.googleMapsUrl || mapsUrl(place)} target="_blank" rel="noopener noreferrer" className="button secondary"><MapPin size={15} />Google 지도</a>{place.link && <a href={place.link} target="_blank" rel="noopener noreferrer" className="button secondary"><ExternalLink size={15} />예약·공식 사이트</a>}</div><div className="form-actions"><button type="button" className="button danger-text" onClick={onDelete}><Trash2 size={16} />삭제</button><button type="button" className="button secondary" onClick={onEdit}>수정</button><button type="button" className="button primary" onClick={onSchedule}><Plus size={16} />일정에 추가</button></div></div>
  </Modal>;
}

export function DeleteConfirm({ title, description, onClose, onDelete, busy }: Common & { title: string; description: string; onDelete: () => Promise<void> }) {
  const { error, submit } = useSave<void>(onDelete);
  return <Modal title={title} onClose={onClose} busy={busy}><div className="editor-form"><p className="confirm-copy">{description}</p><ErrorMessage error={error} /><div className="form-actions"><button className="button secondary" onClick={onClose} disabled={busy}>취소</button><button className="button danger" onClick={() => void submit()} disabled={busy}>{busy ? "삭제 중" : "삭제"}</button></div></div></Modal>;
}

export function ImportConfirm({ value, filename, onSave, onClose, busy }: Common & { value: TripState; filename: string; onSave: (value: TripState) => Promise<void> }) {
  const { error, submit } = useSave(onSave);
  return <Modal title="여행 파일 불러오기" onClose={onClose} busy={busy}><form className="editor-form" onSubmit={(e) => { e.preventDefault(); void submit(value); }}><p className="confirm-copy">현재 여행을 파일의 내용으로 바꿉니다.</p><div className="import-summary"><strong>{value.trip.title}</strong><span>{filename}</span><p>{value.trip.days}일 · {value.places.length}개 장소 · {value.schedule.length}개 일정 · 준비물 {value.packing.length}개</p></div><ErrorMessage error={error} /><div className="form-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>취소</button><SubmitButton busy={busy}>불러오기</SubmitButton></div></form></Modal>;
}
