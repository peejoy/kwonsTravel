import { z } from "zod";
import { googleMapsLinkUrl } from "./maps-link";

export const categoryLabels = {
  sight: "관광", food: "맛집", photo: "사진 명소", stay: "숙소", transport: "이동",
} as const;
export const packingCategories = ["서류·예약", "옷·생활", "전자기기", "아이·가족", "기타"] as const;
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const short = z.string().trim().min(1).max(120);
const text = z.string().max(3000);
const httpsOrEmpty = z.string().max(2048).refine((value) => {
  if (!value) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "https:// 주소를 입력해주세요.");
const image = z.string().max(2048).refine((value) =>
  !value || /^\/photos\/[a-zA-Z0-9_.-]+$/.test(value) || httpsOrEmpty.safeParse(value).success,
  "사진은 HTTPS 주소를 입력해주세요.",
);
export function validDate(value: string): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const placeSchema = z.object({
  id, name: short, category: z.enum(["sight", "food", "photo", "stay", "transport"]),
  area: z.string().max(100), description: text,
  lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180),
  image, link: httpsOrEmpty, favorite: z.boolean(), notes: text,
  googleMapsUrl: z.string().max(2048).refine((value) => {
    if (!value) return true;
    try { googleMapsLinkUrl(value); return true; } catch { return false; }
  }, "Google 지도 공유 링크를 확인해주세요.").optional(),
});
export const scheduleSchema = z.object({
  id, placeId: id, day: z.number().int().min(1).max(14),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().min(0).max(1440), notes: text, completed: z.boolean(),
});
export const packingSchema = z.object({
  id, label: short, category: z.enum(packingCategories),
  assignee: z.string().max(80), done: z.boolean(),
});
export const tripSchema = z.object({
  title: short, startDate: z.string().refine(validDate, "여행 날짜를 확인해주세요."),
  days: z.number().int().min(1).max(14),
  travelers: z.number().int().min(1).max(30).nullable(), notes: text,
});
export const tripStateSchema = z.object({
  version: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  trip: tripSchema,
  places: z.array(placeSchema).max(200),
  schedule: z.array(scheduleSchema).max(300),
  packing: z.array(packingSchema).max(300),
}).superRefine((state, ctx) => {
  for (const collection of ["places", "schedule", "packing"] as const) {
    if (new Set(state[collection].map((row) => row.id)).size !== state[collection].length)
      ctx.addIssue({ code: "custom", path: [collection], message: "중복된 항목이 있습니다." });
  }
  const placeIds = new Set(state.places.map((place) => place.id));
  for (const entry of state.schedule) {
    if (!placeIds.has(entry.placeId))
      ctx.addIssue({ code: "custom", path: ["schedule"], message: "일정의 장소를 찾을 수 없습니다." });
    if (entry.day > state.trip.days)
      ctx.addIssue({ code: "custom", path: ["trip", "days"], message: `${entry.day}일차 일정이 있습니다. 먼저 다른 날짜로 옮겨주세요.` });
  }
});
export type Place = z.infer<typeof placeSchema>;
export type Category = Place["category"];
export type ScheduleItem = z.infer<typeof scheduleSchema>;
export type PackingItem = z.infer<typeof packingSchema>;
export type Trip = z.infer<typeof tripSchema>;
export type TripState = z.infer<typeof tripStateSchema>;
export function parseTripState(input: unknown): TripState { return tripStateSchema.parse(input); }
export function mergeEditedRecord<T extends object>(current: T, original: T, edited: T): T {
  const merged = { ...current };
  for (const key of Object.keys(edited) as (keyof T)[]) {
    if (edited[key] !== original[key]) merged[key] = edited[key];
  }
  return merged;
}
export function removePlace(state: TripState, placeId: string): TripState {
  return { ...state, places: state.places.filter((p) => p.id !== placeId), schedule: state.schedule.filter((s) => s.placeId !== placeId) };
}
export type TravelMode = "driving" | "walking" | "transit";
export function mapsUrl(place: Place, action: "search" | "directions" | "navigate" = "search", mode: TravelMode = "driving"): string {
  const url = new URL(`https://www.google.com/maps/${action === "search" ? "search" : "dir"}/`);
  url.searchParams.set("api", "1");
  if (action !== "search") {
    url.searchParams.set("destination", `${place.lat},${place.lng}`);
    url.searchParams.set("travelmode", mode);
    if (action === "navigate") url.searchParams.set("dir_action", "navigate");
  } else url.searchParams.set("query", `${place.lat},${place.lng}`);
  return url.toString();
}
export function dayDate(start: string, day: number): string {
  if (!start) return "날짜 미정";
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + day - 1);
  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}
export function tripDates(trip: Trip): string {
  if (!trip.startDate) return "여행 날짜 미정";
  return `${dayDate(trip.startDate, 1)} ~ ${dayDate(trip.startDate, trip.days)}`;
}
