"use client";

import { useEffect, useRef, useState } from "react";
import { APIProvider, Map as GoogleMap, AdvancedMarker, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { Camera, Expand, Layers, MapPin, LoaderCircle } from "lucide-react";
import type { Place } from "@/lib/model";
import { IconButton } from "./ui";

export type MapPoint = { place: Place; order: number; key: string };
type Props = {
  points: MapPoint[];
  selected: string | null;
  onSelect: (key: string) => void;
  onPick?: (lat: number, lng: number) => void;
  compact?: boolean;
  connectPoints?: boolean;
  markerKind?: "place" | "photo";
};
const center = { lat: 26.36, lng: 127.8 };

function GoogleControls({ points, selected, reset, connectPoints = true }: { points: MapPoint[]; selected: string | null; reset: number; connectPoints?: boolean }) {
  const map = useMap();
  const core = useMapsLibrary("core");
  const maps = useMapsLibrary("maps");
  const positionsKey = points.map((p) => `${p.key}:${p.place.lat}:${p.place.lng}`).join("|");
  useEffect(() => {
    if (!map || !core || !points.length) return;
    const bounds = new core.LatLngBounds();
    points.forEach(({ place }) => bounds.extend({ lat: place.lat, lng: place.lng }));
    if (points.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(14); }
    else map.fitBounds(bounds, { top: 65, bottom: 80, left: 48, right: 48 });
  // Positions, not selection, determine when the entire itinerary is fitted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, core, positionsKey, reset]);
  useEffect(() => {
    if (!map || !selected) return;
    const point = points.find((p) => p.key === selected);
    if (point) map.panTo({ lat: point.place.lat, lng: point.place.lng });
  }, [map, selected, positionsKey]);
  useEffect(() => {
    if (!map || !maps || !connectPoints) return;
    const line = new maps.Polyline({ map, path: points.map(({ place }) => ({ lat: place.lat, lng: place.lng })), strokeColor: "#19806b", strokeOpacity: 0.65, strokeWeight: 3, geodesic: false });
    return () => line.setMap(null);
  }, [map, maps, positionsKey, connectPoints]);
  return null;
}

function BaseMap({ points, selected, onSelect, onPick, reset, onReady, connectPoints = true, markerKind = "place" }: Props & { reset: number; onReady: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const callbacks = useRef({ onSelect, onPick, onReady });
  callbacks.current = { onSelect, onPick, onReady };
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    let disposed = false;
    import("leaflet").then((L) => {
      if (disposed || !container.current) return;
      const map = L.map(container.current, { zoomControl: false, scrollWheelZoom: true }).setView([center.lat, center.lng], 10);
      instance.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
      tiles.on("tileerror", () => { setTileError(true); callbacks.current.onReady(); });
      tiles.on("load", () => { if (tiles.getContainer()?.querySelector("img.leaflet-tile-loaded")) setTileError(false); callbacks.current.onReady(); });
      layer.current = L.layerGroup().addTo(map);
      map.on("click", (event) => callbacks.current.onPick?.(event.latlng.lat, event.latlng.lng));
      const observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(container.current);
      map.once("unload", () => observer.disconnect());
      setReady(true);
    });
    return () => { disposed = true; instance.current?.remove(); instance.current = null; layer.current = null; };
  }, []);
  const positionsKey = points.map((p) => `${p.key}:${p.place.lat}:${p.place.lng}`).join("|");
  useEffect(() => {
    if (!ready || !instance.current || !layer.current) return;
    import("leaflet").then((L) => {
      const group = layer.current, map = instance.current;
      if (!group || !map) return;
      group.clearLayers();
      const coords = points.map(({ place }) => L.latLng(place.lat, place.lng));
      if (connectPoints && coords.length > 1) L.polyline(coords, { color: "#19806b", weight: 3, opacity: 0.65 }).addTo(group);
      points.forEach((point) => {
        const element = document.createElement("button");
        element.className = `map-pin${markerKind === "photo" ? " photo-map-pin" : ""}${selected === point.key ? " selected" : ""}`;
        element.textContent = String(point.order);
        element.type = "button";
        element.setAttribute("aria-label", point.place.name);
        const icon = L.divIcon({ html: element, className: "leaflet-number-marker", iconSize: [36, 42], iconAnchor: [18, 40] });
        L.marker([point.place.lat, point.place.lng], { icon, title: point.place.name }).on("click", () => callbacks.current.onSelect(point.key)).addTo(group);
      });
    });
  }, [ready, positionsKey, selected, connectPoints, markerKind]);
  useEffect(() => {
    if (!ready || !instance.current || !points.length) return;
    const map = instance.current;
    if (points.length === 1) map.setView([points[0].place.lat, points[0].place.lng], 14);
    else map.fitBounds(points.map(({ place }) => [place.lat, place.lng] as [number, number]), { padding: [50, 70], maxZoom: 15 });
  }, [ready, positionsKey, reset]);
  useEffect(() => {
    const point = points.find((p) => p.key === selected);
    if (point && instance.current) instance.current.panTo([point.place.lat, point.place.lng]);
  }, [selected, positionsKey]);
  return <><div className="map-canvas" ref={container} role="region" aria-label="오키나와 기본 지도" />{tileError && <div className="map-message">지도 이미지를 불러오지 못했습니다. 장소의 길찾기 링크를 이용해주세요.</div>}</>;
}

export default function TripMap(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const [provider, setProvider] = useState<"google" | "base">(apiKey ? "google" : "base");
  const [authError, setAuthError] = useState(false);
  const [reset, setReset] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(false); }, [provider]);
  useEffect(() => {
    const win = window as Window & { gm_authFailure?: () => void };
    const previous = win.gm_authFailure;
    win.gm_authFailure = () => { previous?.(); setAuthError(true); setProvider("base"); };
    return () => { win.gm_authFailure = previous; };
  }, []);
  return <div className={`trip-map${props.compact ? " compact" : ""}`} data-ready={ready}>
    {provider === "google" ? <APIProvider apiKey={apiKey} language="ko" region="JP" onError={() => { setAuthError(true); setProvider("base"); }}>
      <GoogleMap defaultCenter={center} defaultZoom={10} mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID"} disableDefaultUI zoomControl gestureHandling="greedy" clickableIcons={false} onTilesLoaded={() => setReady(true)} onClick={(event) => { const p = event.detail.latLng; if (p) props.onPick?.(p.lat, p.lng); }}>
        {props.points.map((point) => <AdvancedMarker key={point.key} position={{ lat: point.place.lat, lng: point.place.lng }} title={point.place.name} onClick={() => props.onSelect(point.key)} zIndex={props.selected === point.key ? 10 : 1}><button type="button" tabIndex={-1} className={`map-pin${props.markerKind === "photo" ? " photo-map-pin" : ""}${props.selected === point.key ? " selected" : ""}`} aria-label={point.place.name}>{props.markerKind === "photo" ? <Camera size={15} /> : point.order}</button></AdvancedMarker>)}
        <GoogleControls points={props.points} selected={props.selected} reset={reset} connectPoints={props.connectPoints} />
      </GoogleMap>
    </APIProvider> : <BaseMap {...props} reset={reset} onReady={() => setReady(true)} />}
    {!ready && <div className="map-loading" role="status"><LoaderCircle size={21} className="spin" /><span>지도를 불러오는 중</span></div>}
    <div className="map-topbar"><span className="map-caption"><MapPin size={14} />{props.points.length}{props.markerKind === "photo" ? "개 촬영 위치" : "개 장소"}</span><div className="map-tools"><button className="map-provider" type="button" onClick={() => setProvider(provider === "google" ? "base" : apiKey ? "google" : "base")} title="지도 전환"><Layers size={15} />{provider === "google" ? "Google 지도" : "기본 지도"}</button><IconButton label="전체 장소 보기" onClick={() => setReset((n) => n + 1)}><Expand size={17} /></IconButton></div></div>
    {authError && provider === "base" && <div className="map-message">구글 지도 연결을 확인해주세요. 기본 지도를 표시합니다.</div>}
    <div className="map-legend">{props.markerKind === "photo" ? <><Camera size={14} />촬영 위치</> : <><span className="legend-line" />방문 순서</>}{props.onPick && <span className="map-pick-label">장소 위치 선택 중</span>}</div>
  </div>;
}
