import { z } from "zod";
export const SOURCE_LIMIT = 30 * 1024 * 1024;
export const UPLOAD_LIMIT = 3 * 1024 * 1024;
export const SELECTION_LIMIT = 20;
export const BUCKET = "family-travel-photos";
export const idSchema = z.uuid();
export const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 2);
export const emptyMetadata: PhotoMetadata = { caption: "", capturedAt: null, captureTimezone: null, lat: null, lng: null, locationSource: "none" };
function wallClock(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(`${value}Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 19) === value;
}
export const photoMetadataSchema = z.object({
  caption: z.string().max(1000), capturedAt: z.string().refine(wallClock).nullable(),
  captureTimezone: z.string().max(80).refine((zone) => {
    if (/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(zone)) return !/^[+-]14:(?!00)/.test(zone);
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
  }).nullable(),
  lat: z.number().finite().min(-90).max(90).nullable(),
  lng: z.number().finite().min(-180).max(180).nullable(),
  locationSource: z.enum(["exif", "place", "manual", "none"]),
}).strict().refine((p) => (p.lat === null) === (p.lng === null) && (p.lat === null) === (p.locationSource === "none"));
export type PhotoMetadata = z.infer<typeof photoMetadataSchema>;
export type AlbumPhoto = PhotoMetadata & { id: string; revision: number; createdAt: string; updatedAt: string; imageUrl: string; thumbnailUrl: string; urlsExpireAt: string };
export type AlbumPage = { photos: AlbumPhoto[]; nextCursor: string | null };
export type UploadReservation = { id: string; revision: number; uploadUrl: string; uploadExpiresAt: string };
export function photoPaths(id: string) {
  idSchema.parse(id);
  const root = `okinawa/${id}`;
  return { temporary: `${root}/temporary.jpg`, display: `${root}/display.jpg`, thumbnail: `${root}/thumbnail.jpg` };
}
export function photoDateKey(photo: { capturedAt: string | null }): string { return photo.capturedAt?.slice(0, 10) || "unknown"; }
const cursorSchema = z.object({ createdAt: z.iso.datetime({ offset: true }), id: idSchema }).strict();
export function encodeCursor(cursor: z.infer<typeof cursorSchema>): string { return Buffer.from(JSON.stringify(cursorSchema.parse(cursor))).toString("base64url"); }
export function decodeCursor(value: string): z.infer<typeof cursorSchema> {
  if (value.length > 400 || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Invalid cursor");
  return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
}
