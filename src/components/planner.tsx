"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Camera, Check, CheckCircle2, Download, Heart, Images, ListChecks, LoaderCircle, LogOut, MapPin, Plane, Plus, Settings, Share2, Users, Utensils, X, LockKeyhole } from "lucide-react";
import { mergeEditedRecord, parseTripState, placeSchema, removePlace, tripDates, type Category, type PackingItem, type Place, type ScheduleItem, type Trip, type TripState } from "@/lib/model";
import { DeleteConfirm, ImportConfirm, PackingEditor, PlaceDetail, PlaceEditor, ScheduleEditor, TripEditor } from "./editors";
import { IconButton, Modal } from "./ui";
import { ItineraryView, PlacesView, PackingView, SettingsView } from "./views";
import AlbumView from "./album/album-view";

export type View = "itinerary" | "places" | "food" | "photo" | "packing" | "settings" | "album";
type Editor = { kind: "place"; value?: Place; category?: Category } | { kind: "schedule"; value?: ScheduleItem; placeId?: string } | { kind: "packing"; value?: PackingItem } | { kind: "trip" } | { kind: "import"; value: TripState; filename: string } | null;
type Deletion = { kind: "place" | "schedule" | "packing"; id: string; title: string } | null;
type Session = { authenticated: boolean; mode: "local" | "shared" };
const nav = [
  { id: "itinerary" as const, label: "여행 일정", icon: CalendarDays },
  { id: "places" as const, label: "저장한 장소", icon: MapPin },
  { id: "food" as const, label: "맛집", icon: Utensils },
  { id: "photo" as const, label: "사진 명소", icon: Camera },
  { id: "packing" as const, label: "준비물", icon: ListChecks },
  { id: "album" as const, label: "여행 앨범", icon: Images },
];
function friendlyError(error: unknown, fallback: string): string {
  return error instanceof Error && /[가-힣]/.test(error.message) ? error.message : fallback;
}

export default function Planner() {
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<TripState | null>(null);
  const [initialError, setInitialError] = useState("");
  const [view, setView] = useState<View>("itinerary");
  const [day, setDay] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [detail, setDetail] = useState<Place | null>(null);
  const [deletion, setDeletion] = useState<Deletion>(null);
  const [busy, setBusy] = useState(false);
  const [photoProgress, setPhotoProgress] = useState("");
  const [photoDeletion, setPhotoDeletion] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const stateRef = useRef(state);
  const busyRef = useRef(false);
  const editingRef = useRef(false);
  stateRef.current = state;
  editingRef.current = !!(editor || detail || deletion || photoDeletion);
  const showNotice = useCallback((text: string, error = false) => setNotice({ text, error }), []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), notice.error ? 8000 : 3500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { if (state) setDay((current) => Math.min(current, state.trip.days)); }, [state?.trip.days]);

  const load = useCallback(async () => {
    setInitialError("");
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "앱 연결을 확인해주세요.");
      setSession(result);
      if (!result.authenticated) return;
      const tripResponse = await fetch("/api/trip", { cache: "no-store" });
      const trip = await tripResponse.json();
      if (!tripResponse.ok) throw new Error(trip.error || "일정을 불러오지 못했습니다.");
      const incoming = parseTripState(trip.state);
      if (!stateRef.current || incoming.version >= stateRef.current.version) {
        stateRef.current = incoming;
        setState(incoming);
      }
      setSession({ authenticated: true, mode: trip.mode });
    } catch (error) {
      const message = friendlyError(error, "앱에 연결할 수 없습니다. 연결을 확인해주세요.");
      if (stateRef.current) showNotice(message, true);
      else setInitialError(message);
    }
  }, [showNotice]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!session?.authenticated || !state) return;
    const refresh = async () => {
      if (busyRef.current || editingRef.current || document.hidden) return;
      try {
        const response = await fetch("/api/trip", { cache: "no-store" });
        if (response.status === 401) { setSession((s) => s && { ...s, authenticated: false }); return; }
        if (!response.ok) return;
        const payload = await response.json();
        const incoming = parseTripState(payload.state);
        if (!busyRef.current && !editingRef.current && incoming.version > (stateRef.current?.version ?? -1)) {
          setState(incoming); showNotice("최신 여행 내용을 불러왔습니다.");
        }
      } catch { /* Keep the current trip during a temporary network failure. */ }
    };
    const interval = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [session?.authenticated, !!state, showNotice]);

  async function commit(transform: (current: TripState) => TripState): Promise<void> {
    if (busyRef.current || !stateRef.current) throw new Error("이전 내용을 저장 중입니다. 잠시 후 다시 시도해주세요.");
    const current = stateRef.current;
    let next: TripState;
    try { next = parseTripState(transform(current)); }
    catch (error) { const issue = (error as { issues?: { message: string }[] }).issues?.[0]; throw new Error(issue?.message || (error instanceof Error ? error.message : "입력 내용을 확인해주세요.")); }
    busyRef.current = true; setBusy(true);
    try {
      const response = await fetch("/api/trip", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state: next, expectedVersion: current.version }) });
      const result = await response.json();
      if (response.status === 409 && result.state) {
        const latest = parseTripState(result.state);
        stateRef.current = latest; setState(latest);
        throw new Error("다른 가족이 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 저장해주세요.");
      }
      if (response.status === 401) { setSession((s) => s && { ...s, authenticated: false }); throw new Error("로그인이 만료되었습니다. 다시 로그인해주세요."); }
      if (!response.ok) throw new Error(result.error || "저장하지 못했습니다. 연결을 확인하고 다시 시도해주세요.");
      const saved = parseTripState(result.state);
      stateRef.current = saved; setState(saved);
      showNotice(result.warning || "저장했습니다.", !!result.warning);
    } catch (error) {
      const message = friendlyError(error, "저장하지 못했습니다. 연결을 확인하고 다시 시도해주세요.");
      showNotice(message, true);
      throw new Error(message);
    } finally { busyRef.current = false; setBusy(false); }
  }
  function quickChange(transform: (current: TripState) => TripState) { void commit(transform).catch(() => {}); }
  async function populatePhotos(candidates: Place[]) {
    if (busyRef.current || !stateRef.current) return;
    if (session?.mode !== "local") { showNotice("사진 저장은 현재 로컬에서만 지원합니다.", true); return; }
    const missing = candidates.filter((place) => !place.image && place.googleMapsUrl);
    if (!missing.length) return;
    const patches: { original: Place; updated: Place }[] = [];
    let warning = "";
    busyRef.current = true; setBusy(true);
    try {
      for (const [index, place] of missing.entries()) {
        setPhotoProgress(`${index + 1} / ${missing.length}`);
        const response = await fetch("/api/place-photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place: { name: place.name, lat: place.lat, lng: place.lng, googleMapsUrl: place.googleMapsUrl } }) });
        const result = await response.json();
        if (response.status === 401) setSession((s) => s && { ...s, authenticated: false });
        if (!response.ok) throw new Error(result.error || "사진을 가져오지 못했습니다.");
        if (result.photo) patches.push({ original: place, updated: placeSchema.parse({ ...place, ...result.photo }) });
        else if (result.reason !== "missing") { warning = result.warning || "사진을 가져오지 못했습니다."; break; }
      }
    } catch (error) { warning = friendlyError(error, "사진을 가져오지 못했습니다. 연결을 확인해주세요."); }
    finally { busyRef.current = false; setBusy(false); setPhotoProgress(""); }
    if (patches.length) {
      try {
        await commit((current) => ({ ...current, places: current.places.map((place) => {
          const patch = patches.find(({ original }) => original.id === place.id);
          if (!patch || place.image || place.name !== patch.original.name || place.lat !== patch.original.lat || place.lng !== patch.original.lng || place.googleMapsUrl !== patch.original.googleMapsUrl) return place;
          return { ...place, image: patch.updated.image, photoCredit: patch.updated.photoCredit };
        }) }));
      } catch { return; }
    }
    showNotice(warning ? `${patches.length ? `${patches.length}장 저장. ` : ""}${warning}` : patches.length ? `${patches.length}장의 사진을 저장했습니다.` : "등록된 위치와 일치하는 사진을 찾지 못했습니다.", !!warning);
  }
  async function deletePhotos() {
    if (busyRef.current || !stateRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const response = await fetch("/api/place-photos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: stateRef.current.version }) });
      const result = await response.json();
      if (response.status === 409 && result.state) { const latest = parseTripState(result.state); stateRef.current = latest; setState(latest); }
      if (response.status === 401) setSession((s) => s && { ...s, authenticated: false });
      if (!response.ok) throw new Error(result.error || "저장 사진을 삭제하지 못했습니다.");
      const saved = parseTripState(result.state); stateRef.current = saved; setState(saved);
      setPhotoDeletion(false); showNotice(result.warning || "저장 사진을 삭제했습니다. 여행 기록은 유지됩니다.", !!result.warning);
    } catch (error) { showNotice(friendlyError(error, "저장 사진을 삭제하지 못했습니다."), true); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function savePlace(value: Place, original?: Place) {
    await commit((s) => {
      if (original && !s.places.some((p) => p.id === value.id)) throw new Error("다른 가족이 이 장소를 삭제했습니다.");
      return { ...s, places: s.places.some((p) => p.id === value.id) ? s.places.map((p) => p.id === value.id ? original ? mergeEditedRecord(p, original, value) : value : p) : [...s.places, value] };
    });
    setEditor(null);
  }
  async function saveSchedule(value: ScheduleItem, original?: ScheduleItem) {
    await commit((s) => {
      if (original && !s.schedule.some((p) => p.id === value.id)) throw new Error("다른 가족이 이 일정을 삭제했습니다.");
      return { ...s, schedule: s.schedule.some((p) => p.id === value.id) ? s.schedule.map((p) => p.id === value.id ? original ? mergeEditedRecord(p, original, value) : value : p) : [...s.schedule, value].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)) };
    });
    setDay(value.day); setSelected(value.id); setEditor(null);
  }
  async function savePacking(value: PackingItem, original?: PackingItem) {
    await commit((s) => {
      if (original && !s.packing.some((p) => p.id === value.id)) throw new Error("다른 가족이 이 준비물을 삭제했습니다.");
      return { ...s, packing: s.packing.some((p) => p.id === value.id) ? s.packing.map((p) => p.id === value.id ? original ? mergeEditedRecord(p, original, value) : value : p) : [...s.packing, value] };
    }); setEditor(null);
  }
  async function saveTrip(value: Trip, original: Trip) { await commit((s) => ({ ...s, trip: mergeEditedRecord(s.trip, original, value) })); setDay((d) => Math.min(d, stateRef.current!.trip.days)); setEditor(null); }
  async function deleteItem() {
    if (!deletion) return;
    await commit((s) => deletion.kind === "place" ? removePlace(s, deletion.id) : deletion.kind === "schedule" ? { ...s, schedule: s.schedule.filter((i) => i.id !== deletion.id) } : { ...s, packing: s.packing.filter((i) => i.id !== deletion.id) });
    setDeletion(null); setDetail(null);
  }
  function moveSchedule(id: string, direction: number) {
    quickChange((s) => {
      const items = s.schedule.filter((item) => item.day === day).sort((a, b) => a.time.localeCompare(b.time));
      const index = items.findIndex((item) => item.id === id);
      const neighbor = items[index + direction], entry = items[index];
      if (!neighbor || !entry) return s;
      const schedule = [...s.schedule];
      const entryIndex = schedule.findIndex((item) => item.id === entry.id);
      const neighborIndex = schedule.findIndex((item) => item.id === neighbor.id);
      schedule[entryIndex] = { ...neighbor, time: entry.time };
      schedule[neighborIndex] = { ...entry, time: neighbor.time };
      return { ...s, schedule };
    });
  }
  function exportTrip() {
    if (!state) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "okinawa-trip.json"; anchor.click(); URL.revokeObjectURL(url);
  }
  async function openImport(file: File) {
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error("4MB 이하의 여행 파일을 선택해주세요.");
      const value = parseTripState(JSON.parse(await file.text()));
      setEditor({ kind: "import", value, filename: file.name });
    } catch { showNotice("유효한 여행 파일을 선택해주세요. 4MB 이하의 JSON 여행 파일만 불러올 수 있습니다.", true); }
  }
  async function importTrip(value: TripState) {
    await commit((s) => ({ ...value, version: s.version }));
    setEditor(null); setDay(1); setSelected(null);
  }
  async function share() {
    if (session?.mode !== "shared") return;
    try { await navigator.clipboard.writeText(window.location.origin); showNotice("가족에게 보낼 주소를 복사했습니다."); }
    catch { showNotice("주소를 복사하지 못했습니다. 브라우저 주소를 공유해주세요.", true); }
  }
  async function logout() {
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error();
      setSession((s) => s && { ...s, authenticated: false }); setState(null); setEditor(null); setDetail(null); setDeletion(null);
    } catch { showNotice("로그아웃하지 못했습니다. 다시 시도해주세요.", true); }
  }

  if (initialError) return <div className="boot-screen"><MapPin size={36} /><h1>여행을 불러오지 못했어요</h1><p>{initialError}</p><button className="button primary" onClick={() => void load()}>다시 시도</button></div>;
  if (session && !session.authenticated && !state) return <Login onSuccess={load} />;
  if (!state || !session) return <div className="boot-screen"><Plane size={36} /><LoaderCircle className="spin" size={22} /><p>우리 가족 여행을 불러오는 중</p></div>;
  const done = state.packing.filter((p) => p.done).length;
  const favorites = state.places.filter((p) => p.favorite).length;
  const currentView = view === "settings" ? { label: "여행 설정" } : nav.find((n) => n.id === view)!;
  const closeEditor = () => { if (!busy) setEditor(null); };
  const addPlace = () => setEditor({ kind: "place", category: view === "food" || view === "photo" ? view : "sight" });
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="/" aria-label="오키나와 여행 홈"><span className="brand-icon"><Plane size={24} strokeWidth={1.7} /></span><span>Okinawa<span className="brand-subtitle">우리 가족 여행</span></span></a>
      <div className="sidebar-divider" /><div className="nav-heading">여행 노트</div><nav className="side-nav" aria-label="주 메뉴">{nav.map(({ id, label, icon: Icon }) => <button key={id} aria-label={label} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon size={19} strokeWidth={1.8} /><span>{label}</span>{id === "packing" && <span className="nav-count">{done}/{state.packing.length}</span>}{id === "places" && <span className="nav-count">{state.places.length}</span>}</button>)}</nav>
      <div className="sidebar-trip"><img src="/photos/american-village.jpg" alt="오키나와 아메리칸 빌리지" /><div className="sidebar-trip-copy"><span>이번 여행</span><strong>오키나와</strong><p>{state.trip.days}일의 기록{state.trip.travelers ? ` · ${state.trip.travelers}명` : ""}</p></div></div>
      <div className="sidebar-bottom"><button className={view === "settings" ? "sidebar-settings active" : "sidebar-settings"} onClick={() => setView("settings")}><Settings size={18} />여행 설정</button><span className="storage-status"><span className={`status-dot ${session.mode}`} />{session.mode === "shared" ? "가족과 공유 중" : "이 컴퓨터에 저장"}</span><a className="credits-link" href="/credits" target="_blank" rel="noopener noreferrer">사진 출처</a></div>
    </aside>
    <main className="main-content"><header className="main-header"><div><div className="trip-label"><span className="destination-dot" />Japan, Okinawa</div><h1>{state.trip.title}</h1><div className="trip-meta"><span><CalendarDays size={14} />{tripDates(state.trip)}</span><span><Users size={14} />{state.trip.travelers ? `${state.trip.travelers}명` : "가족 여행"}</span><IconButton label="여행 정보 수정" onClick={() => setEditor({ kind: "trip" })}><Settings size={14} /></IconButton></div></div><div className="header-actions"><span className="save-indicator">{busy ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />}{busy ? "저장 중" : "저장됨"}</span><IconButton label="여행 파일 다운로드" onClick={exportTrip}><Download size={18} /></IconButton><button className="button secondary share-button" disabled={session.mode !== "shared"} title={session.mode === "local" ? "가족 공유 연결 후 사용" : "가족 공유 링크 복사"} onClick={() => void share()}><Share2 size={16} />가족 공유</button></div></header>
      <div className="view-header"><div><h2>{currentView.label}</h2><span className="view-count">{view === "itinerary" ? `${state.trip.days}일 · ${state.schedule.length}개 일정` : view === "packing" ? `${done} / ${state.packing.length}개 준비 완료` : view === "settings" ? "우리 가족의 여행 정보" : view === "album" ? "가족의 여행사진" : view === "places" ? `${state.places.length}개 장소 · 즐겨찾기 ${favorites}개` : `${state.places.filter((p) => p.category === view).length}개 장소`}</span></div>{view !== "settings" && view !== "album" && <button className="button primary" onClick={() => view === "itinerary" ? setEditor({ kind: "schedule" }) : view === "packing" ? setEditor({ kind: "packing" }) : addPlace()}><Plus size={16} />{view === "itinerary" ? "일정 추가" : view === "packing" ? "준비물 추가" : "장소 추가"}</button>}</div>
      {view === "album" && <AlbumView places={state.places} onAuthRequired={() => setSession((current) => current && { ...current, authenticated: false })} />}
      {view === "itinerary" && <ItineraryView state={state} day={day} setDay={(d) => { setDay(d); setSelected(null); }} selected={selected} setSelected={setSelected} busy={busy} onEdit={(value) => setEditor({ kind: "schedule", value })} onAdd={() => setEditor({ kind: "schedule" })} onToggle={(id) => quickChange((s) => ({ ...s, schedule: s.schedule.map((i) => i.id === id ? { ...i, completed: !i.completed } : i) }))} onMove={moveSchedule} onDetail={setDetail} onDelete={(entry, name) => setDeletion({ kind: "schedule", id: entry.id, title: name })} />}
      {(view === "places" || view === "food" || view === "photo") && <PlacesView key={view} state={state} view={view} onDetail={setDetail} onAdd={addPlace} busy={busy} onFavorite={(id) => quickChange((s) => ({ ...s, places: s.places.map((p) => p.id === id ? { ...p, favorite: !p.favorite } : p) }))} onSchedule={(placeId) => setEditor({ kind: "schedule", placeId })} onPhotos={session.mode === "local" ? (places) => void populatePhotos(places) : undefined} photoProgress={photoProgress} />}
      {view === "packing" && <PackingView state={state} busy={busy} onToggle={(id) => quickChange((s) => ({ ...s, packing: s.packing.map((i) => i.id === id ? { ...i, done: !i.done } : i) }))} onEdit={(value) => setEditor({ kind: "packing", value })} onAdd={() => setEditor({ kind: "packing" })} onDelete={(item) => setDeletion({ kind: "packing", id: item.id, title: item.label })} />}
      {view === "settings" && <SettingsView state={state} mode={session.mode} onEdit={() => setEditor({ kind: "trip" })} onExport={exportTrip} onImport={(file) => void openImport(file)} onLogout={() => void logout()} onDeletePhotos={() => setPhotoDeletion(true)} busy={busy} />}
      <footer className="main-footer"><span>우리 가족만의 여행 기록</span><span>Okinawa, Japan</span></footer>
    </main>
    <nav className="mobile-nav" aria-label="모바일 메뉴">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)} aria-label={label}><Icon size={19} /><span>{id === "itinerary" ? "일정" : id === "places" ? "장소" : label}</span></button>)}</nav>
    {notice && <div role={notice.error ? "alert" : "status"} className={`toast${notice.error ? " error" : ""}`}><span>{notice.error ? <X size={17} /> : <Check size={17} />}{notice.text}</span><IconButton label="알림 닫기" onClick={() => setNotice(null)}><X size={16} /></IconButton></div>}
    {editor?.kind === "place" && <PlaceEditor value={editor.value} defaultCategory={editor.category} onSave={savePlace} onClose={closeEditor} busy={busy} onAuthRequired={() => setSession((current) => current && { ...current, authenticated: false })} />}
    {editor?.kind === "schedule" && <ScheduleEditor value={editor.value} placeId={editor.placeId} state={state} day={day} onSave={saveSchedule} onClose={closeEditor} busy={busy} />}
    {editor?.kind === "packing" && <PackingEditor value={editor.value} onSave={savePacking} onClose={closeEditor} busy={busy} />}
    {editor?.kind === "trip" && <TripEditor value={state.trip} onSave={saveTrip} onClose={closeEditor} busy={busy} />}
    {editor?.kind === "import" && <ImportConfirm value={editor.value} filename={editor.filename} onSave={importTrip} onClose={closeEditor} busy={busy} />}
    {detail && !deletion && <PlaceDetail place={detail} onClose={() => setDetail(null)} onEdit={() => { setEditor({ kind: "place", value: detail }); setDetail(null); }} onSchedule={() => { setEditor({ kind: "schedule", placeId: detail.id }); setDetail(null); }} onDelete={() => setDeletion({ kind: "place", id: detail.id, title: detail.name })} />}
    {deletion && <DeleteConfirm title={`${deletion.title} 삭제`} description={deletion.kind === "place" ? "이 장소와 연결된 일정도 함께 삭제됩니다." : "이 항목을 여행 기록에서 삭제할까요?"} onClose={() => { if (!busy) setDeletion(null); }} onDelete={deleteItem} busy={busy} />}
    {photoDeletion && <DeleteConfirm title="저장 사진 전체 삭제" description="가져온 사진 파일과 사진 캐시를 모두 삭제합니다. 장소·일정·준비물과 기본 사진은 유지됩니다. 사진 삭제는 되돌릴 수 없습니다." onClose={() => { if (!busy) setPhotoDeletion(false); }} onDelete={deletePhotos} busy={busy} />}
    {!session.authenticated && <Login onSuccess={load} overlay />}
  </div>;
}

function Login({ onSuccess, overlay = false }: { onSuccess: () => Promise<void>; overlay?: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "비밀번호를 확인해주세요."); await onSuccess(); }
    catch (err) { setError(friendlyError(err, "로그인하지 못했습니다. 연결을 확인해주세요.")); }
    finally { setBusy(false); }
  }
  const form = <form className={`login-form${overlay ? " session-login-form" : ""}`} onSubmit={login}>{!overlay && <span className="login-icon"><Plane size={25} /></span>}<span className="login-eyebrow">우리 가족 여행</span><h1>Okinawa</h1>{overlay && <p className="session-login-caption">로그인이 만료되었습니다. 편집하던 내용은 보관되어 있습니다.</p>}<label>가족 비밀번호<div className="password-field"><LockKeyhole size={17} /><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></div></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Plane size={17} />}{busy ? "로그인 중" : "여행 열기"}</button></form>;
  return overlay ? <Modal title="다시 로그인" onClose={() => {}} dismissible={false}>{form}</Modal> : <div className="login-screen"><img className="login-background" src="/photos/american-village.jpg" alt="오키나와 아메리칸 빌리지" />{form}</div>;
}
