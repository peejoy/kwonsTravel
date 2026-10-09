"use client";
import { MapPin, X } from "lucide-react";
import type { Place } from "@/lib/model";
import type { PhotoMetadata } from "@/lib/album/model";
import TripMap from "../trip-map";
import { IconButton } from "../ui";
export function photoPlace(metadata: PhotoMetadata, name: string, id: string): Place {
  return { id, name, lat: metadata.lat ?? 26.36, lng: metadata.lng ?? 127.8, category: "photo", area: "", description: "", image: "", link: "", notes: "", favorite: false };
}
export const locationLabels = { exif: "사진 GPS", place: "선택한 장소", manual: "직접 지정", none: "위치 없음" };
export function MetadataFields({ value, onChange, places, disabled = false }: { value: PhotoMetadata; onChange: (value: PhotoMetadata) => void; places: Place[]; disabled?: boolean }) {
  return <>
    <label>사진 설명<textarea maxLength={1000} rows={2} value={value.caption} onChange={(e) => onChange({ ...value, caption: e.target.value })} /></label>
    <label>촬영 시각<input type="datetime-local" step="1" value={value.capturedAt || ""} onChange={(e) => onChange({ ...value, capturedAt: e.target.value ? e.target.value.length === 16 ? `${e.target.value}:00` : e.target.value : null, captureTimezone: e.target.value ? "Asia/Tokyo" : null })} /></label>
    {value.capturedAt && <span className="album-muted">{value.captureTimezone || "시간대 정보 없음"}</span>}
    <label>촬영 장소<select aria-label="촬영 장소" value="" onChange={(e) => { const p = places.find((place) => place.id === e.target.value); if (p) onChange({ ...value, lat: p.lat, lng: p.lng, locationSource: "place" }); }}><option value="">장소 선택</option>{places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <div className="album-location"><span><MapPin size={14} />{locationLabels[value.locationSource]}{value.lat !== null ? ` · ${value.lat.toFixed(5)}, ${value.lng!.toFixed(5)}` : ""}</span>{value.lat !== null && <IconButton label="촬영 위치 제거" onClick={() => onChange({ ...value, lat: null, lng: null, locationSource: "none" })}><X size={16} /></IconButton>}</div>
    <TripMap compact points={value.lat === null ? [] : [{ key: "capture", order: 1, place: photoPlace(value, "촬영 위치", "capture") }]} selected={null} onSelect={() => {}} connectPoints={false} markerKind="photo" onPick={(lat, lng) => { if (!disabled) onChange({ ...value, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), locationSource: "manual" }); }} />
  </>;
}
