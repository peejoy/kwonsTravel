"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, MapPin, Plane, Utensils, BedDouble, X, LoaderCircle } from "lucide-react";
import { categoryLabels, type Category } from "@/lib/model";

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
export function SubmitButton({ busy, children = "저장" }: { busy: boolean; children?: React.ReactNode }) {
  return <button type="submit" className="button primary" disabled={busy}>{busy && <LoaderCircle size={16} className="spin" />}{busy ? "저장 중" : children}</button>;
}
export function PlaceImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  return src && !failed ? <img className={`place-image ${className}`} src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <div className={`place-image image-placeholder ${className}`} aria-label={`${alt} 사진 없음`}><MapPin size={26} strokeWidth={1.3} /></div>;
}
