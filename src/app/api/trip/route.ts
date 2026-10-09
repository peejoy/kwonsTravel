import type { NextRequest } from "next/server";
import { z } from "zod";
import { AuthConfigurationError, checkOrigin, isAuthenticated, jsonResponse } from "@/lib/auth";
import { tripStateSchema } from "@/lib/model";
import { getStorageMode, readTrip, StorageUnavailableError, TripConflictError, TripValidationError, writeTrip } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const saveSchema = z.object({
  state: tripStateSchema,
  expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 2),
}).strict().refine((input) => input.state.version === input.expectedVersion, {
  message: "여행 상태와 저장 버전을 확인해주세요.", path: ["expectedVersion"],
});

function failure(error: unknown) {
  if (error instanceof TripConflictError) return jsonResponse({ error: error.message, state: error.state }, 409);
  if (error instanceof TripValidationError) return jsonResponse({ error: error.message }, 400);
  if (error instanceof AuthConfigurationError || error instanceof StorageUnavailableError) {
    return jsonResponse({ error: error.message }, 503);
  }
  return jsonResponse({ error: "여행 저장소 연결과 가족 공유 설정을 확인한 뒤 다시 시도해주세요." }, 503);
}

export async function GET(request: NextRequest) {
  try {
    const authenticated = await isAuthenticated(request);
    const mode = getStorageMode();
    if (!authenticated) return jsonResponse({ error: "가족 비밀번호로 로그인해주세요." }, 401);
    return jsonResponse({ state: await readTrip(), mode });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: NextRequest) {
  const originError = checkOrigin(request);
  if (originError) return originError;
  try {
    const authenticated = await isAuthenticated(request);
    const mode = getStorageMode();
    if (!authenticated) return jsonResponse({ error: "가족 비밀번호로 로그인해주세요." }, 401);
    const parsed = saveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonResponse({ error: "여행 내용과 저장 버전을 확인해주세요." }, 400);
    return jsonResponse({ state: await writeTrip(parsed.data.state, parsed.data.expectedVersion), mode });
  } catch (error) {
    return failure(error);
  }
}
