"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, MapPin, Plane, Utensils, BedDouble, X, LoaderCircle, Navigation, Car, Footprints, TramFront } from "lucide-react";
import { categoryLabels, mapsUrl, type Category, type Place, type TravelMode } from "@/lib/model";

export const categoryIcons = { sight: MapPin, food: Utensils, photo: Camera, stay: BedDouble, transport: Plane };
export function CategoryBadge({ category }: { category: Category }) {
  const Icon = categoryIcons[category];
  return <span className={`badge category-${category}`}><Icon size={12} />{categoryLabels[category]}</span>;
}
export function IconButton({ label, children, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" title={label} aria-label={label} className={`icon-button ${className}`} {...props}>{children}</button>;
}
export function Modal({ title, children, onClose, busy = false, dismissible = true }: { title: string; children: React.ReactNode; onClose: () => void; busy?: boolean; dismissible?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); };
  }, []);
  return <dialog ref={dialog} className="modal" aria-label={title} onCancel={(e) => { e.preventDefault(); if (!busy && dismissible) onClose(); }} onClick={(e) => { if (e.target === dialog.current && !busy && dismissible) onClose(); }}>
    <header className="modal-header"><h2>{title}</h2>{dismissible && <IconButton label="닫기" onClick={onClose} disabled={busy}><X size={20} /></IconButton>}</header>
    {children}
  </dialog>;
}
export function SubmitButton({ busy, disabled = false, children = "저장" }: { busy: boolean; disabled?: boolean; children?: React.ReactNode }) {
  return <button type="submit" className="button primary" disabled={busy || disabled}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? "저장 중" : children}</button>;
}
export function NavigationLink({ place, mode = "driving", compact = false, className = "button secondary" }: { place: Place; mode?: TravelMode; compact?: boolean; className?: string }) {
  const label = `${place.name} 길안내`;
  return <a href={mapsUrl(place, "navigate", mode)} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} className={className}><Navigation size={compact ? 14 : 15} />{!compact && "길안내"}</a>;
}
export function NavigationControls({ place }: { place: Place }) {
  const [mode, setMode] = useState<TravelMode>("driving");
  const modes = [{ id: "driving", label: "자동차", icon: Car }, { id: "walking", label: "도보", icon: Footprints }, { id: "transit", label: "대중교통", icon: TramFront }] as const;
  return <div className="navigation-controls"><div className="segmented travel-modes" role="group" aria-label="이동 수단">{modes.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={mode === id ? "active" : ""} aria-pressed={mode === id} onClick={() => setMode(id)}><Icon size={15} />{label}</button>)}</div><NavigationLink place={place} mode={mode} className="button primary" /></div>;
}
export function PhotoCredit({ credit }: { credit?: Place["photoCredit"] }) {
  if (!credit) return null;
  return <div className="photo-credit"><a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" translate="no">Google Maps</a>{credit.authors.map((author, index) => author.uri ? <a key={index} href={author.uri} target="_blank" rel="noopener noreferrer">{author.displayName}</a> : <span key={index}>{author.displayName}</span>)}</div>;
}
export function PlaceImage({ src, alt, className = "", credit }: { src: string; alt: string; className?: string; credit?: Place["photoCredit"] }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const image = <img className={`place-image ${className}`} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
  return src && !failed ? credit ? <span className="attributed-photo">{image}<span className="photo-source-label" translate="no">Google Maps</span></span> : image : <div className={`place-image image-placeholder ${className}`} aria-label={`${alt} 사진 없음`}><MapPin size={26} strokeWidth={1.3} /></div>;
}
