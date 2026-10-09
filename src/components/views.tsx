"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarDays, Camera, Check, ChevronRight, Clock3, Download, Upload, ExternalLink, Grid2X2, Heart, ListChecks, Map as MapIcon, MapPin, Pencil, Plus, Search, Settings, Trash2, Users, LogOut } from "lucide-react";
import { dayDate, mapsUrl, packingCategories, tripDates, type PackingItem, type Place, type ScheduleItem, type TripState } from "@/lib/model";
import TripMap from "./trip-map";
import { CategoryBadge, IconButton, PlaceImage } from "./ui";

type ItineraryProps = {
  state: TripState; day: number; setDay: (day: number) => void; selected: string | null;
  setSelected: (id: string | null) => void; busy: boolean;
  onEdit: (entry: ScheduleItem) => void; onAdd: () => void; onToggle: (id: string) => void;
  onMove: (id: string, direction: number) => void; onDetail: (place: Place) => void;
  onDelete: (entry: ScheduleItem, name: string) => void;
};
export function ItineraryView({ state, day, setDay, selected, setSelected, busy, onEdit, onAdd, onToggle, onMove, onDetail, onDelete }: ItineraryProps) {
  const entries = state.schedule.filter((item) => item.day === day).sort((a, b) => a.time.localeCompare(b.time));
  const points = entries.map((entry, index) => ({ place: state.places.find((p) => p.id === entry.placeId)!, order: index + 1, key: entry.id }));
  const selectedPoint = points.find((p) => p.key === selected);
  const refs = useRef<Record<string, HTMLLIElement | null>>({});
  useEffect(() => { if (selected) refs.current[selected]?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [selected]);
  const areas = [...new Set(points.map((p) => p.place.area).filter(Boolean))].join(" · ");
  const completed = entries.filter((e) => e.completed).length;
  return <>
    <div className="day-tabs" role="tablist" aria-label="여행 날짜">{Array.from({ length: state.trip.days }, (_, index) => <button role="tab" aria-selected={day === index + 1} key={index} className={day === index + 1 ? "active" : ""} onClick={() => setDay(index + 1)}><strong>{index + 1}일차</strong><span>{state.trip.startDate ? dayDate(state.trip.startDate, index + 1) : `Day ${String(index + 1).padStart(2, "0")}`}</span></button>)}</div>
    <div className="itinerary-layout"><section className="timeline-panel" aria-label={`${day}일차 일정`}><div className="day-heading"><div><span className="day-number">DAY {String(day).padStart(2, "0")}</span><h3>{areas || "새로운 하루"}</h3></div><span className="day-completion"><CheckCircle completed={completed === entries.length && entries.length > 0} />{completed}/{entries.length}</span></div>
      {entries.length ? <ol className="timeline">{entries.map((entry, index) => {
        const place = points[index].place;
        return <li key={entry.id} ref={(element) => { refs.current[entry.id] = element; }} className={`timeline-entry${selected === entry.id ? " selected" : ""}${entry.completed ? " completed" : ""}`}>
          <div className="timeline-clock"><time>{entry.time}</time><button type="button" className="timeline-number" onClick={() => setSelected(entry.id)} aria-label={`${place.name} 지도에서 보기`}>{index + 1}</button></div>
          <div className="timeline-content"><div className="entry-main"><button className="entry-info" type="button" onClick={() => setSelected(entry.id)}><CategoryBadge category={place.category} /><h4>{place.name}</h4><span className="entry-duration"><Clock3 size={12} />{entry.duration}분{place.area && <span>{place.area}</span>}</span></button><button className="thumbnail-button" onClick={() => onDetail(place)} aria-label={`${place.name} 상세보기`}><PlaceImage src={place.image} alt={place.name} /></button></div>
          {entry.notes && <p className="entry-note">{entry.notes}</p>}<div className="entry-actions"><label className="entry-check"><input type="checkbox" checked={entry.completed} disabled={busy} onChange={() => onToggle(entry.id)} />다녀왔어요</label><div className="entry-tools"><IconButton label={`${place.name} 앞 시간으로 이동`} disabled={index === 0 || busy} onClick={() => onMove(entry.id, -1)}><ArrowUp size={14} /></IconButton><IconButton label={`${place.name} 뒤 시간으로 이동`} disabled={index === entries.length - 1 || busy} onClick={() => onMove(entry.id, 1)}><ArrowDown size={14} /></IconButton><IconButton label={`${place.name} 일정 수정`} disabled={busy} onClick={() => onEdit(entry)}><Pencil size={14} /></IconButton><IconButton label={`${place.name} 일정 삭제`} disabled={busy} onClick={() => onDelete(entry, place.name)}><Trash2 size={14} /></IconButton></div></div></div>
        </li>;
      })}</ol> : <Empty icon={<CalendarDays size={30} />} title="아직 비어 있는 하루" action="일정 추가" onAction={onAdd} />}
      {entries.length > 0 && <button className="add-row" onClick={onAdd}><Plus size={16} />이 날에 일정 추가</button>}
    </section><section className="map-panel" aria-label="일정 지도"><TripMap points={points} selected={selected} onSelect={setSelected} />
      <div className="map-bottom"><div><span className="map-bottom-icon"><MapPin size={20} /></span><div><strong>{selectedPoint ? selectedPoint.place.name : `${day}일차 여행 지도`}</strong><span>{selectedPoint ? selectedPoint.place.area || "오키나와" : `${points.length}개의 장소, 우리 가족의 하루`}</span></div></div>{selectedPoint ? <a href={mapsUrl(selectedPoint.place, "directions")} target="_blank" rel="noopener noreferrer" className="button secondary"><ExternalLink size={14} />길찾기</a> : <span className="map-bottom-label">Okinawa</span>}</div>
      {state.trip.notes && <div className="trip-note"><span><Pencil size={14} />여행 메모</span><p>{state.trip.notes}</p></div>}
    </section></div>
  </>;
}
function CheckCircle({ completed }: { completed: boolean }) { return <span className={completed ? "completion-circle done" : "completion-circle"}><Check size={11} /></span>; }
function Empty({ icon, title, action, onAction }: { icon: React.ReactNode; title: string; action: string; onAction: () => void }) {
  return <div className="empty-state">{icon}<h3>{title}</h3><button className="button primary" onClick={onAction}><Plus size={16} />{action}</button></div>;
}

export function PlacesView({ state, view, onDetail, onAdd, busy, onFavorite, onSchedule }: { state: TripState; view: "places" | "food" | "photo"; onDetail: (place: Place) => void; onAdd: () => void; busy: boolean; onFavorite: (id: string) => void; onSchedule: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [mode, setMode] = useState<"grid" | "map">("grid");
  const [selected, setSelected] = useState<string | null>(null);
  const places = state.places.filter((place) => (view === "places" || place.category === view) && (!favoritesOnly || place.favorite) && `${place.name} ${place.area} ${place.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const points = places.map((place, index) => ({ place, order: index + 1, key: place.id }));
  return <><div className="filter-toolbar"><label className="search-field"><Search size={17} /><input aria-label="저장한 장소 검색" placeholder="장소 이름, 지역 검색" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="filter-controls"><div className="segmented"><button className={!favoritesOnly ? "active" : ""} onClick={() => setFavoritesOnly(false)}>전체</button><button className={favoritesOnly ? "active" : ""} onClick={() => setFavoritesOnly(true)}><Heart size={14} />즐겨찾기</button></div><div className="segmented icon-segmented"><IconButton label="사진 목록 보기" className={mode === "grid" ? "active" : ""} onClick={() => setMode("grid")}><Grid2X2 size={17} /></IconButton><IconButton label="지도에서 보기" className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}><MapIcon size={17} /></IconButton></div></div></div>
    {!places.length ? <Empty icon={view === "photo" ? <Camera size={30} /> : <MapPin size={30} />} title={query || favoritesOnly ? "조건에 맞는 장소가 없어요" : "가고 싶은 곳을 저장해보세요"} action="장소 추가" onAction={onAdd} /> : mode === "map" ? <div className="places-map-layout"><div className="map-place-list">{places.map((p, i) => <button key={p.id} className={selected === p.id ? "active" : ""} onClick={() => setSelected(p.id)}><span className="small-place-number">{i + 1}</span><span><strong>{p.name}</strong><span>{p.area}</span></span><ChevronRight size={15} /></button>)}{selected && <button className="button secondary map-detail-button" onClick={() => { const p = places.find((p) => p.id === selected); if (p) onDetail(p); }}>장소 상세보기<ChevronRight size={15} /></button>}</div><TripMap points={points} selected={selected} onSelect={setSelected} /></div> : <div className="places-grid">{places.map((place) => <article className="place-card" key={place.id}><div className="place-card-media"><button className="place-media-button" onClick={() => onDetail(place)} aria-label={`${place.name} 상세보기`}><PlaceImage src={place.image} alt={place.name} /></button><IconButton label={`${place.name} 즐겨찾기 ${place.favorite ? "해제" : "추가"}`} disabled={busy} className={`favorite-button${place.favorite ? " is-favorite" : ""}`} onClick={() => onFavorite(place.id)}><Heart size={17} fill={place.favorite ? "currentColor" : "none"} /></IconButton></div><div className="place-card-body"><div className="place-card-meta"><CategoryBadge category={place.category} /><span>{place.area || "오키나와"}</span></div><button className="place-name-button" onClick={() => onDetail(place)}>{place.name}</button><p>{place.description || "소개를 추가해보세요."}</p><div className="place-card-footer"><a href={mapsUrl(place, "directions")} target="_blank" rel="noopener noreferrer" title={`${place.name} 길찾기`}><ExternalLink size={14} />길찾기</a><button onClick={() => onSchedule(place.id)}><Plus size={14} />일정에 추가</button></div></div></article>)}</div>}
  </>;
}

export function PackingView({ state, busy, onToggle, onEdit, onAdd, onDelete }: { state: TripState; busy: boolean; onToggle: (id: string) => void; onEdit: (value: PackingItem) => void; onAdd: () => void; onDelete: (value: PackingItem) => void }) {
  const [remainingOnly, setRemainingOnly] = useState(false);
  const total = state.packing.length, done = state.packing.filter((p) => p.done).length;
  const percent = total ? Math.round(done / total * 100) : 0;
  return <><div className="packing-overview"><div className="packing-heading"><span className="packing-icon"><ListChecks size={24} /></span><div><h3>{done === total && total ? "여행 준비 끝!" : "하나씩, 차근차근"}</h3><p>{total ? `${total - done}개의 준비물이 남았어요` : "가족이 챙길 준비물을 적어보세요"}</p></div><strong>{percent}<span>%</span></strong></div><progress max={100} value={percent} aria-label="여행 준비 진행률" /><div className="packing-progress-caption"><span>여행 준비</span><span>{done} / {total}</span></div></div>
    <div className="packing-filter"><h3>준비물 체크리스트</h3><label className="checkbox-label"><input type="checkbox" checked={remainingOnly} onChange={(e) => setRemainingOnly(e.target.checked)} />남은 준비물만</label></div>
    {!total ? <Empty icon={<ListChecks size={30} />} title="준비물을 적어보세요" action="준비물 추가" onAction={onAdd} /> : packingCategories.map((category) => {
      const all = state.packing.filter((p) => p.category === category);
      const items = all.filter((p) => !remainingOnly || !p.done);
      if (!items.length) return null;
      return <section className="packing-group" key={category}><h4>{category}<span>{all.filter((p) => p.done).length}/{all.length}</span></h4><ul>{items.map((item) => <li key={item.id} className={item.done ? "done" : ""}><label><input type="checkbox" checked={item.done} disabled={busy} onChange={() => onToggle(item.id)} /><span>{item.label}</span></label>{item.assignee && <span className="assignee"><Users size={12} />{item.assignee}</span>}<div className="packing-item-tools"><IconButton label={`${item.label} 수정`} disabled={busy} onClick={() => onEdit(item)}><Pencil size={15} /></IconButton><IconButton label={`${item.label} 삭제`} disabled={busy} onClick={() => onDelete(item)}><Trash2 size={15} /></IconButton></div></li>)}</ul></section>;
    })}
    {remainingOnly && total > 0 && done === total && <div className="all-packed"><Check size={30} /><h3>모두 챙겼어요</h3></div>}
  </>;
}

export function SettingsView({ state, mode, onEdit, onExport, onImport, onLogout }: { state: TripState; mode: "local" | "shared"; onEdit: () => void; onExport: () => void; onImport: (file: File) => void; onLogout: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  return <div className="settings-content"><section className="settings-section"><div className="settings-section-heading"><h3>여행 정보</h3><button className="button secondary" onClick={onEdit}><Pencil size={15} />수정</button></div><dl><div><dt>여행 이름</dt><dd>{state.trip.title}</dd></div><div><dt>여행 날짜</dt><dd>{tripDates(state.trip)}</dd></div><div><dt>여행 일수</dt><dd>{state.trip.days}일</dd></div><div><dt>가족 인원</dt><dd>{state.trip.travelers ? `${state.trip.travelers}명` : "미정"}</dd></div></dl></section><section className="settings-section"><h3>가족 메모</h3><p className="settings-note">{state.trip.notes || "아직 메모가 없습니다."}</p></section><section className="settings-section"><h3>저장과 공유</h3><dl><div><dt>저장 위치</dt><dd>{mode === "shared" ? "가족 공유 저장소" : "이 컴퓨터"}</dd></div><div><dt>공유 상태</dt><dd>{mode === "shared" ? "같은 주소와 비밀번호로 가족이 함께 수정할 수 있습니다." : "가족 공유 연결 전입니다."}</dd></div></dl><div className="settings-actions"><button className="button secondary" onClick={onExport}><Download size={16} />여행 파일 다운로드</button><button className="button secondary" onClick={() => fileInput.current?.click()}><Upload size={16} />여행 파일 불러오기</button><input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="여행 파일 선택" onChange={(e) => { const file = e.target.files?.[0]; if (file) onImport(file); e.target.value = ""; }} />{mode === "shared" && <button className="button secondary" onClick={onLogout}><LogOut size={16} />로그아웃</button>}</div></section></div>;
}
