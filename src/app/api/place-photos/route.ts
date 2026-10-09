import type { NextRequest } from "next/server";
import { z } from "zod";
import { AuthConfigurationError, checkOrigin, isAuthenticated, jsonResponse } from "@/lib/auth";
import { placeSchema } from "@/lib/model";
import { clearStoredPhotos, getStoredPlacePhoto, isStoredPhoto } from "@/lib/place-photos";
import { getStorageMode, readTrip, writeTrip, StorageUnavailableError, TripConflictError } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const photoInput = z.object({ place: placeSchema.pick({ name: true, lat: true, lng: true, googleMapsUrl: true }).extend({ googleMapsUrl: placeSchema.shape.googleMapsUrl.unwrap() }).strict() }).strict();
const deleteInput = z.object({ expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 2) }).strict();
function failure(error: unknown) {
  if (error instanceof TripConflictError) return jsonResponse({ error: error.message, state: error.state }, 409);
  if (error instanceof AuthConfigurationError || error instanceof StorageUnavailableError) return jsonResponse({ error: error.message }, 503);
  return jsonResponse({ error: "사진 저장소에 연결할 수 없습니다. 다시 시도해주세요." }, 503);
}
export async function POST(request: NextRequest) {
  const rejected = checkOrigin(request); if (rejected) return rejected;
  try {
    if (!await isAuthenticated(request)) return jsonResponse({ error: "가족 비밀번호로 다시 로그인해주세요." }, 401);
    const input = photoInput.safeParse(await request.json().catch(() => null));
    if (!input.success || !input.data.place.googleMapsUrl) return jsonResponse({ error: "장소 이름·Google 지도 링크·위치를 확인해주세요." }, 400);
    return jsonResponse(await getStoredPlacePhoto(input.data.place));
  } catch (error) { return failure(error); }
}
export async function DELETE(request: NextRequest) {
  const rejected = checkOrigin(request); if (rejected) return rejected;
  try {
    if (!await isAuthenticated(request)) return jsonResponse({ error: "가족 비밀번호로 다시 로그인해주세요." }, 401);
    const input = deleteInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return jsonResponse({ error: "여행 저장 버전을 확인해주세요." }, 400);
    if (process.env.NODE_ENV === "production" || getStorageMode() !== "local") return jsonResponse({ error: "저장 사진 삭제는 현재 로컬에서만 지원합니다." }, 503);
    let saved;
    const cleanup = await clearStoredPhotos(async () => {
      const current = await readTrip();
      if (current.version !== input.data.expectedVersion) throw new TripConflictError(current);
      const places = current.places.map((place) => {
        if (!isStoredPhoto(place.image)) return place;
        const { photoCredit: _credit, ...remaining } = place;
        return { ...remaining, image: "" };
      });
      saved = await writeTrip({ ...current, places }, current.version);
    });
    return jsonResponse({ state: saved, mode: "local", ...(cleanup.cleanupPending ? { warning: "사진 참조는 삭제했지만 일부 파일 정리가 남았습니다. 저장 사진 전체 삭제를 다시 실행해주세요." } : {}) });
  } catch (error) { return failure(error); }
}
